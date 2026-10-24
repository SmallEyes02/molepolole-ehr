-- =====================================================================
-- Migration 0010: administrator module
--
-- Security fixes found while cross-checking against the admin spec:
--   1. "update own staff row" let ANY staff member edit their own
--      role_id (privilege escalation to Administrator). Removed.
--   2. audit_log was readable by every staff member. Now admin only.
--   3. staff.is_active was never enforced. A deactivated account can
--      now see and do nothing (the helper functions return NULL).
--
-- New: configurable permissions per role, appointments, billing,
-- inventory, facility settings, staff management guards.
--
-- Administrator-only modules use is_admin() (hard-wired to role 1, not
-- configurable). Configurable permissions (has_permission) only apply
-- to the day-to-day clinical actions.
--
-- Safe to run more than once.
-- =====================================================================

-- ---------------------------------------------------------------------
-- A. HELPER FUNCTIONS (SECURITY DEFINER avoids RLS recursion on staff)
--    Inactive accounts resolve to NULL, so every policy fails for them.
-- ---------------------------------------------------------------------

create or replace function my_facility_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select facility_id from staff where id = auth.uid() and is_active;
$$;

create or replace function my_role_id()
returns smallint
language sql stable security definer set search_path = public
as $$
  select role_id from staff where id = auth.uid() and is_active;
$$;

create or replace function is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(my_role_id() = 1, false);
$$;

-- ---------------------------------------------------------------------
-- B. PERMISSIONS (access control)
-- ---------------------------------------------------------------------

create table if not exists permissions (
  code text primary key,
  description text not null
);

create table if not exists role_permissions (
  role_id smallint not null references roles(id) on delete cascade,
  permission_code text not null references permissions(code) on delete cascade,
  primary key (role_id, permission_code)
);

create or replace function has_permission(p_code text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from role_permissions rp
    where rp.role_id = my_role_id() and rp.permission_code = p_code
  );
$$;

-- the Administrator role can never lose a permission (no lock-out)
create or replace function protect_admin_permissions()
returns trigger
language plpgsql
as $$
begin
  if old.role_id = 1 and pg_trigger_depth() = 1 then
    raise exception 'Administrator permissions cannot be removed';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_protect_admin_permissions on role_permissions;
create trigger trg_protect_admin_permissions
  before delete on role_permissions
  for each row execute function protect_admin_permissions();

alter table permissions enable row level security;
alter table role_permissions enable row level security;

drop policy if exists "read permissions" on permissions;
create policy "read permissions" on permissions for select using (auth.role() = 'authenticated');

drop policy if exists "read role permissions" on role_permissions;
create policy "read role permissions" on role_permissions for select using (auth.role() = 'authenticated');

drop policy if exists "admin grants permissions" on role_permissions;
create policy "admin grants permissions" on role_permissions for insert with check (is_admin());

drop policy if exists "admin revokes permissions" on role_permissions;
create policy "admin revokes permissions" on role_permissions for delete using (is_admin());

-- ---------------------------------------------------------------------
-- C. STAFF MANAGEMENT
-- ---------------------------------------------------------------------

drop policy if exists "update own staff row" on staff;   -- privilege escalation hole

drop policy if exists "read own staff row" on staff;
create policy "read own staff row" on staff for select using (id = auth.uid());

drop policy if exists "admin updates staff" on staff;
create policy "admin updates staff" on staff for update
  using (is_admin() and facility_id = my_facility_id())
  with check (is_admin() and facility_id = my_facility_id());

-- an admin cannot demote or deactivate their own account (lock-out guard)
create or replace function guard_staff_update()
returns trigger
language plpgsql
as $$
begin
  if new.id <> old.id then
    raise exception 'Staff ids cannot be changed';
  end if;
  if auth.uid() is not null and old.id = auth.uid()
     and (new.role_id <> old.role_id or new.is_active = false) then
    raise exception 'You cannot change your own role or deactivate your own account';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_staff_update on staff;
create trigger trg_guard_staff_update
  before update on staff
  for each row execute function guard_staff_update();

-- departments and facility details
drop policy if exists "admin adds departments" on departments;
create policy "admin adds departments" on departments for insert
  with check (is_admin() and facility_id = my_facility_id());

drop policy if exists "admin edits departments" on departments;
create policy "admin edits departments" on departments for update
  using (is_admin() and facility_id = my_facility_id())
  with check (is_admin() and facility_id = my_facility_id());

drop policy if exists "admin removes departments" on departments;
create policy "admin removes departments" on departments for delete
  using (is_admin() and facility_id = my_facility_id());

drop policy if exists "admin edits own facility" on facilities;
create policy "admin edits own facility" on facilities for update
  using (is_admin() and id = my_facility_id())
  with check (is_admin() and id = my_facility_id());

-- ---------------------------------------------------------------------
-- D. SYSTEM CONFIGURATION
-- ---------------------------------------------------------------------

create table if not exists setting_definitions (
  key text primary key,
  label text not null,
  default_value text not null,
  description text
);

create table if not exists facility_settings (
  facility_id uuid not null references facilities(id) on delete cascade,
  key text not null references setting_definitions(key) on delete cascade,
  value text not null,
  updated_by uuid references staff(id),
  updated_at timestamptz not null default now(),
  primary key (facility_id, key)
);

alter table setting_definitions enable row level security;
alter table facility_settings enable row level security;

drop policy if exists "read setting definitions" on setting_definitions;
create policy "read setting definitions" on setting_definitions for select using (auth.role() = 'authenticated');

drop policy if exists "admin manages settings" on facility_settings;
create policy "admin manages settings" on facility_settings for all
  using (is_admin() and facility_id = my_facility_id())
  with check (is_admin() and facility_id = my_facility_id());

-- ---------------------------------------------------------------------
-- E. APPOINTMENTS
-- ---------------------------------------------------------------------

create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  facility_id uuid not null references facilities(id),
  staff_id uuid references staff(id),
  department_id uuid references departments(id),
  scheduled_at timestamptz not null,
  duration_minutes smallint not null default 30 check (duration_minutes between 5 and 240),
  reason text,
  status text not null default 'scheduled' check (status in ('scheduled','completed','cancelled','no_show')),
  cancellation_reason text,
  reschedule_count smallint not null default 0,
  created_by uuid references staff(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_appointments_facility on appointments (facility_id, scheduled_at);

-- no double booking: one live appointment per clinician per slot, and per patient per slot
create unique index if not exists uq_appointment_staff_slot
  on appointments (staff_id, scheduled_at) where status = 'scheduled' and staff_id is not null;
create unique index if not exists uq_appointment_patient_slot
  on appointments (patient_id, scheduled_at) where status = 'scheduled';

create or replace function appointment_reschedule_counter()
returns trigger
language plpgsql
as $$
begin
  if new.scheduled_at <> old.scheduled_at then
    new.reschedule_count := old.reschedule_count + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_appointment_reschedule on appointments;
create trigger trg_appointment_reschedule
  before update on appointments
  for each row execute function appointment_reschedule_counter();

alter table appointments enable row level security;
drop policy if exists "admin manages appointments" on appointments;
create policy "admin manages appointments" on appointments for all
  using (is_admin() and facility_id = my_facility_id())
  with check (is_admin() and facility_id = my_facility_id());

-- ---------------------------------------------------------------------
-- F. FINANCE (totals and balances are derived in a view, never stored)
-- ---------------------------------------------------------------------

create table if not exists services (
  id serial primary key,
  facility_id uuid not null references facilities(id) on delete cascade,
  name text not null,
  price numeric(10,2) not null check (price >= 0),
  is_active boolean not null default true,
  unique (facility_id, name)
);

create table if not exists bills (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id),
  visit_id uuid references visits(id),
  facility_id uuid not null references facilities(id),
  is_void boolean not null default false,
  created_by uuid references staff(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_bills_facility on bills (facility_id, created_at desc);

create table if not exists bill_items (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references bills(id) on delete cascade,
  service_id integer not null references services(id),
  quantity integer not null check (quantity > 0),
  unit_price numeric(10,2) not null check (unit_price >= 0),   -- price at time of billing
  unique (bill_id, service_id)
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references bills(id) on delete cascade,
  amount numeric(10,2) not null check (amount > 0),
  method text not null check (method in ('cash','card','mobile_money','insurance')),
  reference text,
  received_by uuid references staff(id),
  paid_at timestamptz not null default now()
);

create or replace function check_payment()
returns trigger
language plpgsql
as $$
declare
  v_total numeric;
  v_paid numeric;
  v_void boolean;
begin
  select is_void into v_void from bills where id = new.bill_id;
  if v_void then
    raise exception 'Cannot record a payment on a void bill';
  end if;
  select coalesce(sum(quantity * unit_price), 0) into v_total from bill_items where bill_id = new.bill_id;
  select coalesce(sum(amount), 0) into v_paid from payments where bill_id = new.bill_id;
  if v_paid + new.amount > v_total then
    raise exception 'Payment exceeds the outstanding balance';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_check_payment on payments;
create trigger trg_check_payment
  before insert on payments
  for each row execute function check_payment();

create or replace function guard_bill_void()
returns trigger
language plpgsql
as $$
begin
  if new.is_void and not old.is_void
     and exists (select 1 from payments where bill_id = new.id) then
    raise exception 'A bill with payments cannot be voided';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_bill_void on bills;
create trigger trg_guard_bill_void
  before update on bills
  for each row execute function guard_bill_void();

create or replace view bill_balances with (security_invoker = on) as
select
  b.id as bill_id,
  b.patient_id,
  b.facility_id,
  b.created_at,
  b.is_void,
  pt.first_name,
  pt.last_name,
  coalesce(i.total, 0) as total,
  coalesce(p.paid, 0) as paid,
  coalesce(i.total, 0) - coalesce(p.paid, 0) as balance
from bills b
join patients pt on pt.id = b.patient_id
left join (select bill_id, sum(quantity * unit_price) as total from bill_items group by bill_id) i on i.bill_id = b.id
left join (select bill_id, sum(amount) as paid from payments group by bill_id) p on p.bill_id = b.id;

alter table services enable row level security;
alter table bills enable row level security;
alter table bill_items enable row level security;
alter table payments enable row level security;

drop policy if exists "admin manages services" on services;
create policy "admin manages services" on services for all
  using (is_admin() and facility_id = my_facility_id())
  with check (is_admin() and facility_id = my_facility_id());

drop policy if exists "admin manages bills" on bills;
create policy "admin manages bills" on bills for all
  using (is_admin() and facility_id = my_facility_id())
  with check (is_admin() and facility_id = my_facility_id());

drop policy if exists "admin manages bill items" on bill_items;
create policy "admin manages bill items" on bill_items for all
  using (is_admin() and exists (select 1 from bills b where b.id = bill_items.bill_id and b.facility_id = my_facility_id()))
  with check (is_admin() and exists (select 1 from bills b where b.id = bill_items.bill_id and b.facility_id = my_facility_id()));

drop policy if exists "admin manages payments" on payments;
create policy "admin manages payments" on payments for all
  using (is_admin() and exists (select 1 from bills b where b.id = payments.bill_id and b.facility_id = my_facility_id()))
  with check (is_admin() and exists (select 1 from bills b where b.id = payments.bill_id and b.facility_id = my_facility_id()));

-- ---------------------------------------------------------------------
-- G. INVENTORY (stock on hand is derived from movements, never stored)
-- ---------------------------------------------------------------------

create table if not exists inventory_items (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references facilities(id) on delete cascade,
  medication_id integer references medications(id),   -- set for medicines
  supply_name text,                                    -- set for non-medicine supplies
  unit text not null,
  reorder_level integer not null default 0 check (reorder_level >= 0),
  check ((medication_id is null) <> (supply_name is null)),
  unique (facility_id, medication_id),
  unique (facility_id, supply_name)
);

create table if not exists stock_movements (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references inventory_items(id) on delete cascade,
  quantity_change integer not null check (quantity_change <> 0),
  reason text not null check (reason in ('received','dispensed','adjustment','expired','damaged')),
  note text,
  recorded_by uuid references staff(id),
  recorded_at timestamptz not null default now()
);
create index if not exists idx_stock_movements_item on stock_movements (inventory_item_id);

create or replace function check_stock_not_negative()
returns trigger
language plpgsql
as $$
declare
  v_on_hand bigint;
begin
  select coalesce(sum(quantity_change), 0) into v_on_hand
    from stock_movements where inventory_item_id = new.inventory_item_id;
  if v_on_hand + new.quantity_change < 0 then
    raise exception 'Not enough stock: % on hand', v_on_hand;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_check_stock on stock_movements;
create trigger trg_check_stock
  before insert on stock_movements
  for each row execute function check_stock_not_negative();

create or replace view stock_levels with (security_invoker = on) as
select
  it.id as inventory_item_id,
  it.facility_id,
  case when it.medication_id is not null then 'medicine' else 'supply' end as category,
  coalesce(m.name || ' (' || m.form || ', ' || m.strength || ')', it.supply_name) as item_name,
  it.unit,
  it.reorder_level,
  coalesce(s.on_hand, 0) as on_hand,
  coalesce(s.on_hand, 0) <= it.reorder_level as is_low
from inventory_items it
left join medications m on m.id = it.medication_id
left join (select inventory_item_id, sum(quantity_change) as on_hand from stock_movements group by inventory_item_id) s
  on s.inventory_item_id = it.id;

alter table inventory_items enable row level security;
alter table stock_movements enable row level security;

drop policy if exists "admin manages inventory items" on inventory_items;
create policy "admin manages inventory items" on inventory_items for all
  using (is_admin() and facility_id = my_facility_id())
  with check (is_admin() and facility_id = my_facility_id());

drop policy if exists "admin manages stock movements" on stock_movements;
create policy "admin manages stock movements" on stock_movements for all
  using (is_admin() and exists (select 1 from inventory_items i where i.id = stock_movements.inventory_item_id and i.facility_id = my_facility_id()))
  with check (is_admin() and exists (select 1 from inventory_items i where i.id = stock_movements.inventory_item_id and i.facility_id = my_facility_id()));

-- ---------------------------------------------------------------------
-- H. AUDIT LOG: admin-only reads, plus triggers for the new tables
-- ---------------------------------------------------------------------

drop policy if exists "own facility audit read" on audit_log;
create policy "own facility audit read" on audit_log for select using (
  is_admin() and staff_id in (select id from staff where facility_id = my_facility_id()));

-- audit helper for tables keyed by several columns: the key column names
-- are passed as trigger arguments
create or replace function log_audit_event_keys()
returns trigger
language plpgsql
security definer
as $$
declare
  j jsonb;
  rec_id text;
begin
  if (tg_op = 'DELETE') then j := to_jsonb(old); else j := to_jsonb(new); end if;
  select string_agg(j ->> k, ':') into rec_id from unnest(tg_argv) as k;

  insert into audit_log (staff_id, table_name, record_id, action)
  values (auth.uid(), tg_table_name, rec_id, lower(tg_op));

  if (tg_op = 'DELETE') then return old; end if;
  return new;
end;
$$;

drop trigger if exists audit_staff on staff;
create trigger audit_staff after update on staff
  for each row execute function log_audit_event();

drop trigger if exists audit_departments on departments;
create trigger audit_departments after insert or update or delete on departments
  for each row execute function log_audit_event();

drop trigger if exists audit_appointments on appointments;
create trigger audit_appointments after insert or update or delete on appointments
  for each row execute function log_audit_event();

drop trigger if exists audit_services on services;
create trigger audit_services after insert or update or delete on services
  for each row execute function log_audit_event();

drop trigger if exists audit_bills on bills;
create trigger audit_bills after insert or update on bills
  for each row execute function log_audit_event();

drop trigger if exists audit_payments on payments;
create trigger audit_payments after insert on payments
  for each row execute function log_audit_event();

drop trigger if exists audit_inventory_items on inventory_items;
create trigger audit_inventory_items after insert or update or delete on inventory_items
  for each row execute function log_audit_event();

drop trigger if exists audit_stock_movements on stock_movements;
create trigger audit_stock_movements after insert on stock_movements
  for each row execute function log_audit_event();

drop trigger if exists audit_role_permissions on role_permissions;
create trigger audit_role_permissions after insert or delete on role_permissions
  for each row execute function log_audit_event_keys('role_id', 'permission_code');

drop trigger if exists audit_facility_settings on facility_settings;
create trigger audit_facility_settings after insert or update on facility_settings
  for each row execute function log_audit_event_keys('facility_id', 'key');

-- ---------------------------------------------------------------------
-- I. CLINICAL POLICIES NOW DRIVEN BY CONFIGURABLE PERMISSIONS
--    (replaces the hard-coded my_role_id() in (1,2,3,4) checks)
-- ---------------------------------------------------------------------

drop policy if exists "facility scoped insert" on patients;
create policy "facility scoped insert" on patients for insert with check (
  registered_facility_id = my_facility_id() and has_permission('patients.register'));

drop policy if exists "facility scoped update" on patients;
create policy "facility scoped update" on patients for update
  using (registered_facility_id = my_facility_id() and has_permission('patients.update'))
  with check (registered_facility_id = my_facility_id() and has_permission('patients.update'));

drop policy if exists "facility scoped insert" on visits;
create policy "facility scoped insert" on visits for insert with check (
  facility_id = my_facility_id() and has_permission('clinical.record'));

drop policy if exists "facility scoped update" on visits;
create policy "facility scoped update" on visits for update
  using (facility_id = my_facility_id() and has_permission('clinical.record'));

drop policy if exists "via visit facility insert" on vitals;
create policy "via visit facility insert" on vitals for insert with check (
  exists (select 1 from visits v where v.id = vitals.visit_id and v.facility_id = my_facility_id())
  and has_permission('clinical.record'));

drop policy if exists "via visit facility insert" on visit_diagnoses;
create policy "via visit facility insert" on visit_diagnoses for insert with check (
  exists (select 1 from visits v where v.id = visit_diagnoses.visit_id and v.facility_id = my_facility_id())
  and has_permission('clinical.record'));

drop policy if exists "via visit facility insert" on prescriptions;
create policy "via visit facility insert" on prescriptions for insert with check (
  exists (select 1 from visits v where v.id = prescriptions.visit_id and v.facility_id = my_facility_id())
  and has_permission('clinical.record'));

drop policy if exists "sender can insert" on referrals;
create policy "sender can insert" on referrals for insert with check (
  referring_facility_id = my_facility_id() and has_permission('referrals.send'));

-- ---------------------------------------------------------------------
-- J. SEED DATA (idempotent)
-- ---------------------------------------------------------------------

insert into permissions (code, description) values
  ('patients.register', 'Register new patients'),
  ('patients.update',   'Update patient demographic details'),
  ('clinical.record',   'Open encounters and record vitals, diagnoses and prescriptions'),
  ('referrals.send',    'Send referrals to other facilities'),
  ('reports.view',      'View and export reports')
on conflict (code) do nothing;

insert into role_permissions (role_id, permission_code) values
  (1,'patients.register'), (2,'patients.register'), (3,'patients.register'), (4,'patients.register'), (5,'patients.register'),
  (1,'patients.update'), (5,'patients.update'),
  (1,'clinical.record'), (2,'clinical.record'), (3,'clinical.record'), (4,'clinical.record'),
  (1,'referrals.send'), (2,'referrals.send'), (3,'referrals.send'), (4,'referrals.send'),
  (1,'reports.view')
on conflict (role_id, permission_code) do nothing;

insert into setting_definitions (key, label, default_value, description) values
  ('currency_code', 'Currency', 'BWP', 'Currency shown on bills and payments'),
  ('appointment_slot_minutes', 'Default appointment length (minutes)', '30', 'Pre-filled when scheduling an appointment'),
  ('clinic_opening_time', 'Opening time', '07:30', 'Start of the working day'),
  ('clinic_closing_time', 'Closing time', '16:30', 'End of the working day')
on conflict (key) do nothing;

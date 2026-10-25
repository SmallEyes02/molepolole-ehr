-- =====================================================================
-- Migration 0014: pharmacy (dispensing)
--
-- Adds a Pharmacist role and a dispensing workflow:
--   * pharmacists see prescriptions waiting at their facility
--   * dispensing records who handed over how much, and reduces stock in
--     the same step (stock can never go negative)
--   * a mistake can be reversed with a reason; stock is restored
--   * patients see whether each medicine is waiting or collected
--
-- Design notes
--   * The quantity dispensed is stored once, in `dispensings`. Stock on
--     hand is calculated (received/adjusted minus dispensed), never stored.
--   * The facility, patient and medicine are NOT copied into `dispensings`;
--     they follow from the prescription.
--   * Dispensing goes through one function (dispense_prescription), which
--     checks permission, facility, stock and locks the stock row so two
--     pharmacists cannot sell the same last box.
--   * Stock receiving and adjustments stay with the administrator.
--
-- Safe to run more than once.
-- =====================================================================

-- ---------------------------------------------------------------------
-- A. ROLE AND PERMISSION
-- ---------------------------------------------------------------------

insert into roles (id, name) values (6, 'Pharmacist') on conflict (id) do nothing;

insert into permissions (code, description) values
  ('dispensing.manage', 'Dispense medicines and view pharmacy stock')
on conflict (code) do nothing;

insert into role_permissions (role_id, permission_code) values
  (1, 'dispensing.manage'), (6, 'dispensing.manage')
on conflict (role_id, permission_code) do nothing;

-- ---------------------------------------------------------------------
-- B. DISPENSINGS
-- ---------------------------------------------------------------------

create table if not exists dispensings (
  id uuid primary key default gen_random_uuid(),
  prescription_id uuid not null references prescriptions(id) on delete cascade,
  quantity integer not null check (quantity > 0),
  is_partial boolean not null default false,        -- true = balance still owed to the patient
  note text,
  dispensed_by uuid references staff(id),
  dispensed_at timestamptz not null default now(),
  reversed_at timestamptz,
  reversed_by uuid references staff(id),
  reversal_reason text,
  check ((reversed_at is null) = (reversed_by is null) and (reversed_at is null) = (reversal_reason is null))
);
create index if not exists idx_dispensings_prescription on dispensings (prescription_id);
create index if not exists idx_dispensings_time on dispensings (dispensed_at desc);

-- a prescription can only be fully dispensed once (reversals free it up again)
create unique index if not exists uq_dispensing_final
  on dispensings (prescription_id) where is_partial = false and reversed_at is null;

-- ---------------------------------------------------------------------
-- C. STOCK ON HAND FOR A MEDICINE (calculated, never stored)
--    Runs with owner rights so a pharmacist can see the number without
--    being able to read the administrator-only inventory tables. It only
--    answers for the caller's own facility, and only for administrators
--    and pharmacists.
-- ---------------------------------------------------------------------

create or replace function medicine_stock(p_facility uuid, p_medication integer)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select case when it.id is null then null else
           coalesce((select sum(sm.quantity_change) from stock_movements sm where sm.inventory_item_id = it.id), 0)
           - coalesce((select sum(d.quantity)
                         from dispensings d
                         join prescriptions p on p.id = d.prescription_id
                         join visits v on v.id = p.visit_id
                        where d.reversed_at is null
                          and p.medication_id = it.medication_id
                          and v.facility_id = it.facility_id), 0)
         end
    from (select 1) x
    left join inventory_items it on it.facility_id = p_facility and it.medication_id = p_medication
   where p_facility = my_facility_id()
     and (is_admin() or has_permission('dispensing.manage'));
$$;

-- the administrator's stock list now takes dispensing into account
create or replace view stock_levels with (security_invoker = on) as
select
  inventory_item_id, facility_id, category, item_name, unit, reorder_level, on_hand,
  on_hand <= reorder_level as is_low
from (
  select
    it.id as inventory_item_id,
    it.facility_id,
    case when it.medication_id is not null then 'medicine' else 'supply' end as category,
    coalesce(m.name || ' (' || m.form || ', ' || m.strength || ')', it.supply_name) as item_name,
    it.unit,
    it.reorder_level,
    coalesce(
      case when it.medication_id is not null then medicine_stock(it.facility_id, it.medication_id) else s.on_hand end,
      0)::bigint as on_hand
  from inventory_items it
  left join medications m on m.id = it.medication_id
  left join (select inventory_item_id, sum(quantity_change) as on_hand from stock_movements group by inventory_item_id) s
    on s.inventory_item_id = it.id
) q;

-- an administrator's manual adjustment must not push a medicine below what has been dispensed
create or replace function check_stock_not_negative()
returns trigger
language plpgsql
as $$
declare
  v_on_hand bigint;
  v_med integer;
  v_fac uuid;
begin
  select medication_id, facility_id into v_med, v_fac
    from inventory_items where id = new.inventory_item_id for update;   -- serialises with dispensing

  if v_med is not null then
    v_on_hand := medicine_stock(v_fac, v_med);
  else
    select coalesce(sum(quantity_change), 0) into v_on_hand
      from stock_movements where inventory_item_id = new.inventory_item_id;
  end if;

  if coalesce(v_on_hand, 0) + new.quantity_change < 0 then
    raise exception 'Not enough stock: % on hand', coalesce(v_on_hand, 0);
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- D. DISPENSING AND REVERSING (the only ways to write to dispensings)
-- ---------------------------------------------------------------------

create or replace function dispense_prescription(
  p_prescription_id uuid,
  p_quantity integer,
  p_is_partial boolean default false,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rx record;
  v_item uuid;
  v_on_hand bigint;
  v_id uuid;
begin
  if not has_permission('dispensing.manage') then
    raise exception 'You do not have permission to dispense medicines';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Enter a quantity above zero';
  end if;

  select p.id, p.medication_id, v.facility_id into v_rx
    from prescriptions p join visits v on v.id = p.visit_id
   where p.id = p_prescription_id and v.facility_id = my_facility_id()
     for update of p;
  if not found then
    raise exception 'Prescription not found at your facility';
  end if;

  if exists (select 1 from dispensings
              where prescription_id = p_prescription_id and is_partial = false and reversed_at is null) then
    raise exception 'This prescription has already been dispensed';
  end if;

  select id into v_item from inventory_items
   where facility_id = v_rx.facility_id and medication_id = v_rx.medication_id
     for update;
  if v_item is null then
    raise exception 'This medicine is not in the stock list. Ask an administrator to add it under Inventory.';
  end if;

  v_on_hand := medicine_stock(v_rx.facility_id, v_rx.medication_id);
  if v_on_hand < p_quantity then
    raise exception 'Not enough stock: % on hand', v_on_hand;
  end if;

  insert into dispensings (prescription_id, quantity, is_partial, note, dispensed_by)
  values (p_prescription_id, p_quantity, coalesce(p_is_partial, false), nullif(trim(coalesce(p_note, '')), ''), auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function reverse_dispensing(p_dispensing_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
begin
  if not has_permission('dispensing.manage') then
    raise exception 'You do not have permission to dispense medicines';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Give a reason for reversing this dispensing';
  end if;

  select d.id, d.reversed_at into v_row
    from dispensings d
    join prescriptions p on p.id = d.prescription_id
    join visits v on v.id = p.visit_id
   where d.id = p_dispensing_id and v.facility_id = my_facility_id()
     for update of d;
  if not found then
    raise exception 'Dispensing record not found at your facility';
  end if;
  if v_row.reversed_at is not null then
    raise exception 'This dispensing has already been reversed';
  end if;

  update dispensings
     set reversed_at = now(), reversed_by = auth.uid(), reversal_reason = trim(p_reason)
   where id = p_dispensing_id;
end;
$$;

-- ---------------------------------------------------------------------
-- E. WHO CAN SEE WHAT
-- ---------------------------------------------------------------------

alter table dispensings enable row level security;

-- clinical staff can see what has been dispensed for prescriptions at their facility
drop policy if exists "staff read dispensings" on dispensings;
create policy "staff read dispensings" on dispensings for select using (
  exists (select 1 from prescriptions p join visits v on v.id = p.visit_id
           where p.id = dispensings.prescription_id and v.facility_id = my_facility_id()));

-- patients can see the status of their own medicines
drop policy if exists "patient reads own dispensings" on dispensings;
create policy "patient reads own dispensings" on dispensings for select using (
  exists (select 1 from prescriptions p join visits v on v.id = p.visit_id
           where p.id = dispensings.prescription_id and v.patient_id = my_patient_id()));
-- (no insert/update/delete policies: writes happen only through the two functions above)

-- Prescriptions waiting at the pharmacy, with how much has been given and stock on hand.
-- security_invoker: the caller's own access rules apply, so it is limited to their facility.
create or replace view pharmacy_queue with (security_invoker = on) as
select
  p.id as prescription_id,
  p.created_at,
  v.facility_id,
  pt.id as patient_id,
  pt.first_name,
  pt.last_name,
  pt.card_number,
  m.id as medication_id,
  m.name as medication_name,
  m.form,
  m.strength,
  p.dosage,
  p.frequency,
  p.duration_days,
  p.instructions,
  case when s.id is null then null else s.first_name || ' ' || s.last_name end as prescribed_by_name,
  coalesce(d.dispensed_quantity, 0) as dispensed_quantity,
  case when coalesce(d.is_complete, false) then 'dispensed'
       when coalesce(d.dispensed_quantity, 0) > 0 then 'partial'
       else 'pending' end as status,
  medicine_stock(v.facility_id, p.medication_id) as on_hand
from prescriptions p
join visits v on v.id = p.visit_id
join patients pt on pt.id = v.patient_id
join medications m on m.id = p.medication_id
left join staff s on s.id = p.prescribed_by
left join lateral (
  select sum(x.quantity) as dispensed_quantity, bool_or(not x.is_partial) as is_complete
    from dispensings x
   where x.prescription_id = p.id and x.reversed_at is null
) d on true;

create or replace view dispensing_history with (security_invoker = on) as
select
  d.id as dispensing_id,
  d.prescription_id,
  d.dispensed_at,
  d.quantity,
  d.is_partial,
  d.note,
  d.reversed_at,
  d.reversal_reason,
  v.facility_id,
  pt.first_name,
  pt.last_name,
  pt.card_number,
  m.name as medication_name,
  m.form,
  m.strength,
  p.dosage,
  p.frequency,
  case when sb.id is null then null else sb.first_name || ' ' || sb.last_name end as dispensed_by_name,
  case when sr.id is null then null else sr.first_name || ' ' || sr.last_name end as reversed_by_name
from dispensings d
join prescriptions p on p.id = d.prescription_id
join visits v on v.id = p.visit_id
join patients pt on pt.id = v.patient_id
join medications m on m.id = p.medication_id
left join staff sb on sb.id = d.dispensed_by
left join staff sr on sr.id = d.reversed_by;

-- Medicine stock for the pharmacy (read-only). A plain view so a pharmacist can
-- read it without access to the administrator-only inventory tables; it only
-- ever returns the caller's own facility, and only to pharmacists and administrators.
create or replace view pharmacy_stock as
select
  it.id as inventory_item_id,
  m.id as medication_id,
  m.name || ' (' || m.form || ', ' || m.strength || ')' as item_name,
  it.unit,
  it.reorder_level,
  medicine_stock(it.facility_id, it.medication_id) as on_hand,
  medicine_stock(it.facility_id, it.medication_id) <= it.reorder_level as is_low
from inventory_items it
join medications m on m.id = it.medication_id
where it.facility_id = my_facility_id()
  and (is_admin() or has_permission('dispensing.manage'));

-- ---------------------------------------------------------------------
-- F. FUNCTION PERMISSIONS AND AUDIT
-- ---------------------------------------------------------------------

do $$
declare
  r text;
begin
  revoke execute on function medicine_stock(uuid, integer) from public;
  revoke execute on function dispense_prescription(uuid, integer, boolean, text) from public;
  revoke execute on function reverse_dispensing(uuid, text) from public;
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke execute on function medicine_stock(uuid, integer) from %I', r);
      execute format('revoke execute on function dispense_prescription(uuid, integer, boolean, text) from %I', r);
      execute format('revoke execute on function reverse_dispensing(uuid, text) from %I', r);
    end if;
  end loop;
  foreach r in array array['authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('grant execute on function medicine_stock(uuid, integer) to %I', r);
      execute format('grant execute on function dispense_prescription(uuid, integer, boolean, text) to %I', r);
      execute format('grant execute on function reverse_dispensing(uuid, text) to %I', r);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on pharmacy_stock from anon;
  end if;
end $$;

drop trigger if exists audit_dispensings on dispensings;
create trigger audit_dispensings after insert or update on dispensings
  for each row execute function log_audit_event();

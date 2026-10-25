-- =====================================================================
-- Migration 0012: patient portal
--
-- Lets a patient sign in and see ONLY their own medical history and
-- appointments, and receive in-app notifications about appointments.
--
-- How a patient gets access (no guessing of names or Omang numbers):
--   1. A staff member with the portal.manage permission confirms the
--      patient in person and generates a one-time activation code.
--   2. The patient creates a login and enters the code once.
--   3. The code is stored only as a hash, expires in 7 days, works once,
--      and wrong guesses are throttled.
--
-- Patients get read-only access to their own rows through RLS. They
-- cannot see staff, finance, inventory, other patients or the audit log.
-- Safe to run more than once.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- A. ACCOUNTS AND ACTIVATION CODES
-- ---------------------------------------------------------------------

create table if not exists patient_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  patient_id uuid not null unique references patients(id) on delete cascade,
  created_by uuid references staff(id),
  created_at timestamptz not null default now()
);

create table if not exists portal_invites (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  code_hash bytea not null unique,
  created_by uuid references staff(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references auth.users(id)
);
create index if not exists idx_portal_invites_patient on portal_invites (patient_id);

create table if not exists portal_claim_attempts (
  id bigserial primary key,
  user_id uuid not null,
  attempted_at timestamptz not null default now()
);
create index if not exists idx_claim_attempts_user on portal_claim_attempts (user_id, attempted_at);

create or replace function my_patient_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select patient_id from patient_accounts where user_id = auth.uid();
$$;

insert into permissions (code, description) values
  ('portal.manage', 'Give patients portal access and revoke it')
on conflict (code) do nothing;

insert into role_permissions (role_id, permission_code) values
  (1, 'portal.manage'), (5, 'portal.manage')
on conflict (role_id, permission_code) do nothing;

-- staff create a code for a patient at their own facility
create or replace function create_portal_invite(p_patient_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   -- no 0/O/1/I
  v_bytes bytea;
  v_code text := '';
  v_expires timestamptz := now() + interval '7 days';
  i int;
begin
  if not has_permission('portal.manage') then
    raise exception 'You do not have permission to manage portal access';
  end if;

  if not exists (select 1 from patients where id = p_patient_id and registered_facility_id = my_facility_id()) then
    raise exception 'Patient not found at your facility';
  end if;

  if exists (select 1 from patient_accounts where patient_id = p_patient_id) then
    raise exception 'This patient already has portal access';
  end if;

  -- a new code replaces any earlier unused one
  update portal_invites set expires_at = now()
   where patient_id = p_patient_id and used_at is null and expires_at > now();

  v_bytes := gen_random_bytes(8);
  for i in 0..7 loop
    v_code := v_code || substr(alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;

  insert into portal_invites (patient_id, code_hash, created_by, expires_at)
  values (p_patient_id, digest(v_code, 'sha256'), auth.uid(), v_expires);

  return jsonb_build_object('code', substr(v_code, 1, 4) || '-' || substr(v_code, 5, 4), 'expires_at', v_expires);
end;
$$;

-- a signed-in user redeems a code to link their login to a patient record.
-- Returns a status text instead of raising, so failed attempts are recorded.
create or replace function claim_portal_invite(p_code text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_norm text;
  v_invite portal_invites%rowtype;
begin
  if v_uid is null then return 'not_signed_in'; end if;
  if exists (select 1 from staff where id = v_uid) then return 'not_allowed'; end if;
  if exists (select 1 from patient_accounts where user_id = v_uid) then return 'already_linked'; end if;

  if (select count(*) from portal_claim_attempts
       where user_id = v_uid and attempted_at > now() - interval '15 minutes') >= 5 then
    return 'locked';
  end if;

  v_norm := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));

  select * into v_invite from portal_invites
   where code_hash = digest(v_norm, 'sha256') and used_at is null and expires_at > now()
   for update;

  if not found or exists (select 1 from patient_accounts where patient_id = v_invite.patient_id) then
    insert into portal_claim_attempts (user_id) values (v_uid);
    return 'invalid';
  end if;

  insert into patient_accounts (user_id, patient_id, created_by)
  values (v_uid, v_invite.patient_id, v_invite.created_by);

  update portal_invites set used_at = now(), used_by = v_uid where id = v_invite.id;
  return 'ok';
end;
$$;

alter table patient_accounts enable row level security;
alter table portal_invites enable row level security;
alter table portal_claim_attempts enable row level security;   -- no policies: only the functions touch it

drop policy if exists "patient reads own account" on patient_accounts;
create policy "patient reads own account" on patient_accounts for select using (user_id = auth.uid());

drop policy if exists "staff read portal accounts" on patient_accounts;
create policy "staff read portal accounts" on patient_accounts for select using (
  has_permission('portal.manage')
  and patient_id in (select id from patients where registered_facility_id = my_facility_id()));

drop policy if exists "staff revoke portal access" on patient_accounts;
create policy "staff revoke portal access" on patient_accounts for delete using (
  has_permission('portal.manage')
  and patient_id in (select id from patients where registered_facility_id = my_facility_id()));

drop policy if exists "staff read portal invites" on portal_invites;
create policy "staff read portal invites" on portal_invites for select using (
  has_permission('portal.manage')
  and patient_id in (select id from patients where registered_facility_id = my_facility_id()));

-- ---------------------------------------------------------------------
-- B. PATIENTS READ THEIR OWN RECORD (read-only)
-- ---------------------------------------------------------------------

drop policy if exists "patient reads own record" on patients;
create policy "patient reads own record" on patients for select using (id = my_patient_id());

drop policy if exists "patient reads own visits" on visits;
create policy "patient reads own visits" on visits for select using (patient_id = my_patient_id());

drop policy if exists "patient reads own vitals" on vitals;
create policy "patient reads own vitals" on vitals for select using (
  exists (select 1 from visits v where v.id = vitals.visit_id and v.patient_id = my_patient_id()));

drop policy if exists "patient reads own diagnoses" on visit_diagnoses;
create policy "patient reads own diagnoses" on visit_diagnoses for select using (
  exists (select 1 from visits v where v.id = visit_diagnoses.visit_id and v.patient_id = my_patient_id()));

drop policy if exists "patient reads own prescriptions" on prescriptions;
create policy "patient reads own prescriptions" on prescriptions for select using (
  exists (select 1 from visits v where v.id = prescriptions.visit_id and v.patient_id = my_patient_id()));

-- Appointments stay administrator-only at the table level. Patients see
-- their own through this view, which adds the clinician and department
-- names they could not otherwise read. It only ever returns the signed-in
-- patient's rows.
create or replace view my_appointments as
select
  a.id as appointment_id,
  a.scheduled_at,
  a.duration_minutes,
  a.reason,
  a.status,
  a.cancellation_reason,
  f.name as facility_name,
  d.name as department_name,
  case when s.id is null then null else s.first_name || ' ' || s.last_name end as clinician_name
from appointments a
join facilities f on f.id = a.facility_id
left join departments d on d.id = a.department_id
left join staff s on s.id = a.staff_id
where a.patient_id = my_patient_id();

-- ---------------------------------------------------------------------
-- C. NOTIFICATIONS
--    Stored as facts (what happened, to which appointment, for which
--    time). The wording is produced when displayed, so nothing is
--    duplicated and a changed clinic name never leaves stale text.
-- ---------------------------------------------------------------------

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  appointment_id uuid not null references appointments(id) on delete cascade,
  kind text not null check (kind in ('scheduled','rescheduled','cancelled','reminder')),
  for_time timestamptz not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists idx_notifications_patient on notifications (patient_id, created_at desc);
-- the same event is never recorded twice (this is what makes reminders safe to generate repeatedly)
create unique index if not exists uq_notification_event on notifications (appointment_id, kind, for_time);

alter table notifications enable row level security;
drop policy if exists "patient reads own notifications" on notifications;
create policy "patient reads own notifications" on notifications for select using (patient_id = my_patient_id());

-- booking, moving or cancelling an appointment notifies patients who have portal access
create or replace function notify_appointment_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from patient_accounts where patient_id = new.patient_id) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status = 'scheduled' then
      insert into notifications (patient_id, appointment_id, kind, for_time)
      values (new.patient_id, new.id, 'scheduled', new.scheduled_at)
      on conflict do nothing;
    end if;
  elsif tg_op = 'UPDATE' then
    if new.status = 'cancelled' and old.status <> 'cancelled' then
      insert into notifications (patient_id, appointment_id, kind, for_time)
      values (new.patient_id, new.id, 'cancelled', new.scheduled_at)
      on conflict do nothing;
    elsif new.status = 'scheduled' and new.scheduled_at <> old.scheduled_at then
      insert into notifications (patient_id, appointment_id, kind, for_time)
      values (new.patient_id, new.id, 'rescheduled', new.scheduled_at)
      on conflict do nothing;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_appointment on appointments;
create trigger trg_notify_appointment
  after insert or update on appointments
  for each row execute function notify_appointment_change();

-- Creates a reminder for every scheduled appointment starting within the
-- facility's "reminder_hours_before" setting. Safe to run as often as you
-- like. p_patient limits it to one patient. Not callable by app users.
create or replace function generate_appointment_reminders(p_patient uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into notifications (patient_id, appointment_id, kind, for_time)
  select a.patient_id, a.id, 'reminder', a.scheduled_at
  from appointments a
  join patient_accounts pa on pa.patient_id = a.patient_id
  cross join lateral (
    select coalesce(
      (select case when fs.value ~ '^[0-9]{1,3}$' then fs.value::int end
         from facility_settings fs where fs.facility_id = a.facility_id and fs.key = 'reminder_hours_before'),
      (select case when sd.default_value ~ '^[0-9]{1,3}$' then sd.default_value::int end
         from setting_definitions sd where sd.key = 'reminder_hours_before'),
      24) as hrs
  ) h
  where a.status = 'scheduled'
    and a.scheduled_at > now()
    and a.scheduled_at <= now() + make_interval(hours => h.hrs)
    and (p_patient is null or a.patient_id = p_patient)
  on conflict do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- what the portal calls on load: reminders for the signed-in patient only
create or replace function refresh_my_reminders()
returns integer
language sql
security definer
set search_path = public
as $$
  select case when my_patient_id() is null then 0 else generate_appointment_reminders(my_patient_id()) end;
$$;

create or replace function mark_notifications_read()
returns void
language sql
security definer
set search_path = public
as $$
  update notifications set read_at = now()
   where patient_id = my_patient_id() and read_at is null;
$$;

-- function permissions: nobody but the database owner may generate reminders
-- for everyone; the portal functions are for signed-in users only
do $$
declare
  r text;
begin
  revoke execute on function generate_appointment_reminders(uuid) from public;
  revoke execute on function create_portal_invite(uuid) from public;
  revoke execute on function claim_portal_invite(text) from public;
  revoke execute on function refresh_my_reminders() from public;
  revoke execute on function mark_notifications_read() from public;
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke execute on function generate_appointment_reminders(uuid) from %I', r);
    end if;
  end loop;
  foreach r in array array['authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('grant execute on function create_portal_invite(uuid) to %I', r);
      execute format('grant execute on function claim_portal_invite(text) to %I', r);
      execute format('grant execute on function refresh_my_reminders() to %I', r);
      execute format('grant execute on function mark_notifications_read() to %I', r);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on my_appointments from anon;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- D. AUDIT AND SETTINGS
--    (claims by patients are recorded in portal_invites.used_at/used_by;
--     the audit log only records staff, so it is not triggered by patients)
-- ---------------------------------------------------------------------

drop trigger if exists audit_portal_invites on portal_invites;
create trigger audit_portal_invites after insert on portal_invites
  for each row execute function log_audit_event();

drop trigger if exists audit_patient_accounts_revoke on patient_accounts;
create trigger audit_patient_accounts_revoke after delete on patient_accounts
  for each row execute function log_audit_event_keys('user_id');

insert into setting_definitions (key, label, default_value, description) values
  ('reminder_hours_before', 'Appointment reminder (hours before)', '24', 'Patients with portal access are reminded this many hours before an appointment')
on conflict (key) do nothing;

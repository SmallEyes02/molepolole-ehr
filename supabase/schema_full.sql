-- =====================================================================
-- Molepolole Primary Health EHR — FULL CONSOLIDATED SCHEMA
-- PostgreSQL / Supabase
--
-- This single file reflects the complete, current state of the
-- database after applying migrations 0001 through 0008. It exists so
-- a brand-new Supabase project can be set up with one script instead
-- of running eight files in order.
--
-- It is SAFE TO RUN MORE THAN ONCE:
--   - tables/indexes use IF NOT EXISTS
--   - functions use CREATE OR REPLACE
--   - policies are DROPped (if present) then recreated
--   - triggers are DROPped (if present) then recreated
--   - seed data uses ON CONFLICT DO NOTHING against each table's
--     natural unique key, so re-running never creates duplicate rows
--
-- Normalized to Third Normal Form (3NF): every non-key column depends
-- on the whole primary key, and repeating descriptive data (diagnoses,
-- medications, labs, villages, allergies) lives once in its own
-- reference table, referenced by id, never duplicated into clinical
-- records.
--
-- NOTE: the section at the bottom of this file ("ADMINISTRATOR MODULE",
-- migration 0010) supersedes some earlier policies and functions above
-- (clinical write checks now use has_permission(), the staff self-update
-- hole is closed, helper functions ignore inactive accounts). Policies
-- are dropped and recreated, so the final state is what the later
-- section defines.
--
-- If you are setting up a fresh project: run ONLY this file.
-- The numbered files in supabase/migrations/ are kept for history —
-- do not also run them, since this file already contains every change
-- they made.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- 1. ORGANIZATION
-- ---------------------------------------------------------------------

create table if not exists facilities (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  facility_type text not null check (facility_type in ('clinic','health_post','hospital')),
  district text not null default 'Kweneng',
  phone text,
  created_at timestamptz not null default now()
);

create table if not exists departments (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references facilities(id) on delete cascade,
  name text not null,
  unique (facility_id, name)
);

create table if not exists roles (
  id smallint primary key,
  name text not null unique
);

-- staff.id mirrors auth.users.id — one row per authenticated account
create table if not exists staff (
  id uuid primary key references auth.users(id) on delete cascade,
  facility_id uuid not null references facilities(id),
  department_id uuid references departments(id),
  role_id smallint not null references roles(id),
  first_name text not null,
  last_name text not null,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2. LOOKUP / REFERENCE TABLES (no duplication of descriptive text)
-- ---------------------------------------------------------------------

create table if not exists villages (
  id serial primary key,
  name text not null,
  district text not null default 'Kweneng',
  unique (name, district)
);

create table if not exists allergies (
  id serial primary key,
  name text not null unique
);

create table if not exists icd_codes (
  id serial primary key,
  code text not null unique,
  description text not null
);

create table if not exists medications (
  id serial primary key,
  name text not null,
  form text not null,        -- tablet, syrup, injection...
  strength text not null,
  unique (name, form, strength)
);

create table if not exists lab_tests (
  id serial primary key,
  name text not null unique,
  unit text
);

create table if not exists immunizations (
  id serial primary key,
  name text not null unique
);

-- ---------------------------------------------------------------------
-- 3. PATIENTS
-- ---------------------------------------------------------------------

create table if not exists patients (
  id uuid primary key default gen_random_uuid(),
  omang_number text unique,               -- national ID, nullable for minors/undocumented
  first_name text not null,
  last_name text not null,
  date_of_birth date not null,
  sex text not null check (sex in ('M','F')),
  phone text,
  village_id integer references villages(id),
  next_of_kin_name text,
  next_of_kin_phone text,
  registered_facility_id uuid not null references facilities(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_patients_names on patients (last_name, first_name);
create index if not exists idx_patients_facility on patients (registered_facility_id);

-- many-to-many: patient <-> allergy, with attributes specific to the pairing
create table if not exists patient_allergies (
  patient_id uuid not null references patients(id) on delete cascade,
  allergy_id integer not null references allergies(id),
  severity text check (severity in ('mild','moderate','severe')),
  noted_date date not null default current_date,
  primary key (patient_id, allergy_id)
);

-- ---------------------------------------------------------------------
-- 4. VISITS / ENCOUNTERS
-- ---------------------------------------------------------------------

create table if not exists visits (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  facility_id uuid not null references facilities(id),
  attending_staff_id uuid references staff(id),
  visit_date timestamptz not null default now(),
  visit_type text not null check (visit_type in ('outpatient','antenatal','under_five','chronic_care','emergency')),
  chief_complaint text,
  status text not null default 'open' check (status in ('open','closed','referred')),
  created_at timestamptz not null default now()
);
create index if not exists idx_visits_patient on visits (patient_id, visit_date desc);
create index if not exists idx_visits_facility on visits (facility_id, visit_date desc);

-- one-to-one with visit: vitals recorded once per encounter
create table if not exists vitals (
  visit_id uuid primary key references visits(id) on delete cascade,
  height_cm numeric(5,1),
  weight_kg numeric(5,1),
  bp_systolic smallint,
  bp_diastolic smallint,
  temperature_c numeric(3,1),
  pulse_bpm smallint,
  respiratory_rate smallint,
  spo2 smallint,
  recorded_by uuid references staff(id),
  recorded_at timestamptz not null default now()
);

-- many-to-many: visit <-> icd_code
create table if not exists visit_diagnoses (
  visit_id uuid not null references visits(id) on delete cascade,
  icd_code_id integer not null references icd_codes(id),
  is_primary boolean not null default false,
  primary key (visit_id, icd_code_id)
);

create table if not exists prescriptions (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references visits(id) on delete cascade,
  medication_id integer not null references medications(id),
  dosage text not null,
  frequency text not null,
  duration_days smallint,
  instructions text,
  prescribed_by uuid references staff(id),
  created_at timestamptz not null default now()
);

create table if not exists lab_orders (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references visits(id) on delete cascade,
  lab_test_id integer not null references lab_tests(id),
  ordered_by uuid references staff(id),
  ordered_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','completed','cancelled'))
);

-- one-to-one with lab_orders: a result belongs to exactly one order
create table if not exists lab_results (
  lab_order_id uuid primary key references lab_orders(id) on delete cascade,
  result_value text not null,
  result_flag text check (result_flag in ('normal','low','high','critical')),
  resulted_by uuid references staff(id),
  resulted_at timestamptz not null default now()
);

create table if not exists patient_immunizations (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  immunization_id integer not null references immunizations(id),
  dose_number smallint not null default 1,
  administered_date date not null default current_date,
  administered_by uuid references staff(id),
  unique (patient_id, immunization_id, dose_number)
);

-- ---------------------------------------------------------------------
-- 5. REFERRALS BETWEEN FACILITIES
-- ---------------------------------------------------------------------

create table if not exists referrals (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  visit_id uuid references visits(id),
  referring_facility_id uuid not null references facilities(id),
  receiving_facility_id uuid not null references facilities(id),
  referred_by uuid references staff(id),
  reason text not null,
  status text not null default 'pending' check (status in ('pending','accepted','completed','declined')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (referring_facility_id <> receiving_facility_id)
);
create index if not exists idx_referrals_receiving on referrals (receiving_facility_id, status);
create index if not exists idx_referrals_patient on referrals (patient_id);

-- ---------------------------------------------------------------------
-- 6. AUDIT TRAIL
-- ---------------------------------------------------------------------

create table if not exists audit_log (
  id bigserial primary key,
  staff_id uuid references staff(id),
  table_name text not null,
  record_id text not null,
  action text not null check (action in ('insert','update','delete')),
  occurred_at timestamptz not null default now()
);

-- =====================================================================
-- FUNCTIONS
-- =====================================================================

create or replace function my_facility_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select facility_id from staff where id = auth.uid();
$$;

create or replace function my_role_id()
returns smallint
language sql
stable
security definer
set search_path = public
as $$
  select role_id from staff where id = auth.uid();
$$;

-- for tables with a single `id` primary key
create or replace function log_audit_event()
returns trigger
language plpgsql
security definer
as $$
declare
  rec_id text;
begin
  if (tg_op = 'DELETE') then
    rec_id := old.id::text;
  else
    rec_id := new.id::text;
  end if;

  insert into audit_log (staff_id, table_name, record_id, action)
  values (auth.uid(), tg_table_name, rec_id, lower(tg_op));

  if (tg_op = 'DELETE') then
    return old;
  end if;
  return new;
end;
$$;

-- for junction tables keyed by a composite primary key (no `id` column)
create or replace function log_audit_event_visit_diagnoses()
returns trigger
language plpgsql
security definer
as $$
declare
  rec_id text;
begin
  if (tg_op = 'DELETE') then
    rec_id := old.visit_id::text || ':' || old.icd_code_id::text;
  else
    rec_id := new.visit_id::text || ':' || new.icd_code_id::text;
  end if;

  insert into audit_log (staff_id, table_name, record_id, action)
  values (auth.uid(), tg_table_name, rec_id, lower(tg_op));

  if (tg_op = 'DELETE') then
    return old;
  end if;
  return new;
end;
$$;

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================

alter table facilities enable row level security;
alter table departments enable row level security;
alter table staff enable row level security;
alter table patients enable row level security;
alter table patient_allergies enable row level security;
alter table visits enable row level security;
alter table vitals enable row level security;
alter table visit_diagnoses enable row level security;
alter table prescriptions enable row level security;
alter table lab_orders enable row level security;
alter table lab_results enable row level security;
alter table patient_immunizations enable row level security;
alter table audit_log enable row level security;
alter table villages enable row level security;
alter table allergies enable row level security;
alter table icd_codes enable row level security;
alter table medications enable row level security;
alter table lab_tests enable row level security;
alter table immunizations enable row level security;
alter table roles enable row level security;
alter table referrals enable row level security;

-- reference data: readable by any authenticated staff member
drop policy if exists "read reference" on villages;
create policy "read reference" on villages for select using (auth.role() = 'authenticated');

drop policy if exists "read reference" on allergies;
create policy "read reference" on allergies for select using (auth.role() = 'authenticated');

drop policy if exists "read reference" on icd_codes;
create policy "read reference" on icd_codes for select using (auth.role() = 'authenticated');

drop policy if exists "read reference" on medications;
create policy "read reference" on medications for select using (auth.role() = 'authenticated');

drop policy if exists "read reference" on lab_tests;
create policy "read reference" on lab_tests for select using (auth.role() = 'authenticated');

drop policy if exists "read reference" on immunizations;
create policy "read reference" on immunizations for select using (auth.role() = 'authenticated');

drop policy if exists "read reference" on roles;
create policy "read reference" on roles for select using (auth.role() = 'authenticated');

drop policy if exists "read facilities" on facilities;
create policy "read facilities" on facilities for select using (auth.role() = 'authenticated');

drop policy if exists "read own facility departments" on departments;
create policy "read own facility departments" on departments for select using (facility_id = my_facility_id());

drop policy if exists "read own facility staff" on staff;
create policy "read own facility staff" on staff for select using (facility_id = my_facility_id());

drop policy if exists "update own staff row" on staff;
create policy "update own staff row" on staff for update using (id = auth.uid());

-- patients: registration is a front-desk task open to every role, so no
-- role restriction here — only facility scoping
drop policy if exists "facility scoped select" on patients;
create policy "facility scoped select" on patients for select using (registered_facility_id = my_facility_id());

drop policy if exists "facility scoped insert" on patients;
create policy "facility scoped insert" on patients for insert with check (registered_facility_id = my_facility_id());

drop policy if exists "facility scoped update" on patients;
create policy "facility scoped update" on patients for update using (registered_facility_id = my_facility_id());

-- a facility with an open referral for a patient gets read access to
-- that patient's record and visit history, even if registered elsewhere
drop policy if exists "referred patient visible to receiving facility" on patients;
create policy "referred patient visible to receiving facility" on patients for select using (
  id in (select patient_id from referrals where receiving_facility_id = my_facility_id())
);

-- visits: opening an encounter is a clinical action — restricted to
-- clinical roles (1=Administrator, 2=Doctor, 3=Nurse, 4=Clinician)
drop policy if exists "facility scoped select" on visits;
create policy "facility scoped select" on visits for select using (facility_id = my_facility_id());

drop policy if exists "facility scoped insert" on visits;
create policy "facility scoped insert" on visits for insert with check (
  facility_id = my_facility_id() and my_role_id() in (1,2,3,4)
);

drop policy if exists "facility scoped update" on visits;
create policy "facility scoped update" on visits for update using (facility_id = my_facility_id());

drop policy if exists "referred patient visits visible to receiving facility" on visits;
create policy "referred patient visits visible to receiving facility" on visits for select using (
  patient_id in (select patient_id from referrals where receiving_facility_id = my_facility_id())
);

-- vitals: clinical roles only
drop policy if exists "via visit facility" on vitals;
create policy "via visit facility" on vitals for select using (
  exists (select 1 from visits v where v.id = vitals.visit_id and v.facility_id = my_facility_id()));

drop policy if exists "via visit facility insert" on vitals;
create policy "via visit facility insert" on vitals for insert with check (
  exists (select 1 from visits v where v.id = vitals.visit_id and v.facility_id = my_facility_id())
  and my_role_id() in (1,2,3,4)
);

-- diagnoses: clinical roles only
drop policy if exists "via visit facility" on visit_diagnoses;
create policy "via visit facility" on visit_diagnoses for select using (
  exists (select 1 from visits v where v.id = visit_diagnoses.visit_id and v.facility_id = my_facility_id()));

drop policy if exists "via visit facility insert" on visit_diagnoses;
create policy "via visit facility insert" on visit_diagnoses for insert with check (
  exists (select 1 from visits v where v.id = visit_diagnoses.visit_id and v.facility_id = my_facility_id())
  and my_role_id() in (1,2,3,4)
);

-- prescriptions: clinical roles only
drop policy if exists "via visit facility" on prescriptions;
create policy "via visit facility" on prescriptions for select using (
  exists (select 1 from visits v where v.id = prescriptions.visit_id and v.facility_id = my_facility_id()));

drop policy if exists "via visit facility insert" on prescriptions;
create policy "via visit facility insert" on prescriptions for insert with check (
  exists (select 1 from visits v where v.id = prescriptions.visit_id and v.facility_id = my_facility_id())
  and my_role_id() in (1,2,3,4)
);

-- lab orders / results: not yet role-restricted at this stage of the build
drop policy if exists "via visit facility" on lab_orders;
create policy "via visit facility" on lab_orders for select using (
  exists (select 1 from visits v where v.id = lab_orders.visit_id and v.facility_id = my_facility_id()));

drop policy if exists "via visit facility insert" on lab_orders;
create policy "via visit facility insert" on lab_orders for insert with check (
  exists (select 1 from visits v where v.id = lab_orders.visit_id and v.facility_id = my_facility_id()));

drop policy if exists "via order facility" on lab_results;
create policy "via order facility" on lab_results for select using (
  exists (select 1 from lab_orders o join visits v on v.id = o.visit_id
          where o.id = lab_results.lab_order_id and v.facility_id = my_facility_id()));

drop policy if exists "via order facility insert" on lab_results;
create policy "via order facility insert" on lab_results for insert with check (
  exists (select 1 from lab_orders o join visits v on v.id = o.visit_id
          where o.id = lab_results.lab_order_id and v.facility_id = my_facility_id()));

drop policy if exists "via patient facility" on patient_allergies;
create policy "via patient facility" on patient_allergies for select using (
  exists (select 1 from patients p where p.id = patient_allergies.patient_id and p.registered_facility_id = my_facility_id()));

drop policy if exists "via patient facility insert" on patient_allergies;
create policy "via patient facility insert" on patient_allergies for insert with check (
  exists (select 1 from patients p where p.id = patient_allergies.patient_id and p.registered_facility_id = my_facility_id()));

drop policy if exists "via patient facility" on patient_immunizations;
create policy "via patient facility" on patient_immunizations for select using (
  exists (select 1 from patients p where p.id = patient_immunizations.patient_id and p.registered_facility_id = my_facility_id()));

drop policy if exists "via patient facility insert" on patient_immunizations;
create policy "via patient facility insert" on patient_immunizations for insert with check (
  exists (select 1 from patients p where p.id = patient_immunizations.patient_id and p.registered_facility_id = my_facility_id()));

drop policy if exists "own facility audit read" on audit_log;
create policy "own facility audit read" on audit_log for select using (
  staff_id in (select id from staff where facility_id = my_facility_id()));

-- referrals: sending is a clinical action; receiving-side triage
-- (accept/decline/complete) is open to any staff at that facility
drop policy if exists "sender can select" on referrals;
create policy "sender can select" on referrals for select using (referring_facility_id = my_facility_id());

drop policy if exists "sender can insert" on referrals;
create policy "sender can insert" on referrals for insert with check (
  referring_facility_id = my_facility_id() and my_role_id() in (1,2,3,4)
);

drop policy if exists "receiver can select" on referrals;
create policy "receiver can select" on referrals for select using (receiving_facility_id = my_facility_id());

drop policy if exists "receiver can update status" on referrals;
create policy "receiver can update status" on referrals for update using (receiving_facility_id = my_facility_id());

-- =====================================================================
-- TRIGGERS
-- =====================================================================

drop trigger if exists audit_patients on patients;
create trigger audit_patients
  after insert or update or delete on patients
  for each row execute function log_audit_event();

drop trigger if exists audit_visits on visits;
create trigger audit_visits
  after insert or update or delete on visits
  for each row execute function log_audit_event();

drop trigger if exists audit_visit_diagnoses on visit_diagnoses;
create trigger audit_visit_diagnoses
  after insert or delete on visit_diagnoses
  for each row execute function log_audit_event_visit_diagnoses();

drop trigger if exists audit_referrals on referrals;
create trigger audit_referrals
  after insert or update on referrals
  for each row execute function log_audit_event();

-- =====================================================================
-- SEED / REFERENCE DATA
-- Every insert targets that table's natural unique key with
-- ON CONFLICT DO NOTHING, so re-running this file never creates
-- duplicate rows.
-- =====================================================================

insert into roles (id, name) values
  (1,'Administrator'), (2,'Doctor'), (3,'Nurse'), (4,'Clinician'), (5,'Records Officer')
on conflict (id) do nothing;

insert into facilities (name, facility_type, district, phone) values
  ('Scottish Livingstone Hospital', 'hospital', 'Kweneng', '3910333'),
  ('Molepolole Clinic', 'clinic', 'Kweneng', null),
  ('Borakalalo Clinic', 'clinic', 'Kweneng', null)
on conflict (name) do nothing;

insert into icd_codes (code, description) values
  ('A00', 'Cholera'),
  ('A09', 'Diarrhoea and gastroenteritis of presumed infectious origin'),
  ('A15', 'Respiratory tuberculosis'),
  ('B50', 'Plasmodium falciparum malaria'),
  ('B20', 'HIV disease resulting in infectious/parasitic disease'),
  ('B24', 'HIV disease, unspecified'),
  ('E10', 'Type 1 diabetes mellitus'),
  ('E11', 'Type 2 diabetes mellitus'),
  ('I10', 'Essential (primary) hypertension'),
  ('J00', 'Acute nasopharyngitis (common cold)'),
  ('J02', 'Acute pharyngitis'),
  ('J18', 'Pneumonia, organism unspecified'),
  ('J45', 'Asthma'),
  ('K29', 'Gastritis and duodenitis'),
  ('L03', 'Cellulitis'),
  ('N39', 'Urinary tract infection, site not specified'),
  ('O26', 'Maternal care for other conditions related to pregnancy'),
  ('R50', 'Fever, unspecified'),
  ('R51', 'Headache'),
  ('T14', 'Injury, unspecified')
on conflict (code) do nothing;

insert into villages (name, district) values
  ('Kgosing Ward', 'Kweneng'),
  ('Borakalalo Ward', 'Kweneng'),
  ('Ntsweng Ward', 'Kweneng'),
  ('Lorwana Ward', 'Kweneng'),
  ('Boiketlo Ward', 'Kweneng'),
  ('Matlhako Ward', 'Kweneng'),
  ('Magopye Ward', 'Kweneng'),
  ('Suping Ward', 'Kweneng'),
  ('Basaje Ward', 'Kweneng'),
  ('Lekgwapheng Ward', 'Kweneng'),
  ('Lentsweletau', 'Kweneng'),
  ('Mmankgodi', 'Kweneng'),
  ('Gabane', 'Kweneng'),
  ('Thamaga', 'Kweneng'),
  ('Metsimotlhabe', 'Kweneng'),
  ('Kumakwane', 'Kweneng'),
  ('Kopong', 'Kweneng'),
  ('Mogoditshane', 'Kweneng'),
  ('Other / not listed', 'Kweneng')
on conflict (name, district) do nothing;

insert into medications (name, form, strength) values
  ('Paracetamol', 'tablet', '500mg'),
  ('Ibuprofen', 'tablet', '400mg'),
  ('Amoxicillin', 'capsule', '500mg'),
  ('Amoxicillin', 'suspension', '125mg/5ml'),
  ('Metronidazole', 'tablet', '400mg'),
  ('Oral Rehydration Salts', 'sachet', '20.5g'),
  ('Artemether-Lumefantrine (Coartem)', 'tablet', '20mg/120mg'),
  ('Tenofovir-Lamivudine-Dolutegravir (TLD)', 'tablet', '300mg/300mg/50mg'),
  ('Isoniazid', 'tablet', '300mg'),
  ('Rifampicin-Isoniazid-Pyrazinamide-Ethambutol (RIPE)', 'tablet', 'fixed-dose combination'),
  ('Metformin', 'tablet', '500mg'),
  ('Amlodipine', 'tablet', '5mg'),
  ('Hydrochlorothiazide', 'tablet', '25mg'),
  ('Salbutamol inhaler', 'inhaler', '100mcg/dose'),
  ('Omeprazole', 'capsule', '20mg'),
  ('Cetirizine', 'tablet', '10mg'),
  ('Ferrous sulphate', 'tablet', '200mg'),
  ('Folic acid', 'tablet', '5mg'),
  ('Multivitamin', 'tablet', 'standard'),
  ('Chlorhexidine antiseptic', 'solution', '5% w/v')
on conflict (name, form, strength) do nothing;

-- =====================================================================
-- ADMINISTRATOR MODULE (migration 0010)
-- =====================================================================

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

-- =====================================================================
-- LINK EXISTING LOGIN (migration 0011)
-- =====================================================================


create or replace function link_staff_account(
  p_email text,
  p_first_name text,
  p_last_name text,
  p_role_id smallint,
  p_department_id uuid default null,
  p_phone text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user uuid;
begin
  if not is_admin() then
    raise exception 'Administrator access is required';
  end if;

  if coalesce(trim(p_first_name), '') = '' or coalesce(trim(p_last_name), '') = '' then
    raise exception 'First and last name are required';
  end if;

  if not exists (select 1 from roles where id = p_role_id) then
    raise exception 'Choose a valid role';
  end if;

  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'No login exists for that email. Create it first under Authentication, Users in Supabase.';
  end if;

  if exists (select 1 from staff where id = v_user) then
    raise exception 'That login is already linked to a staff member';
  end if;

  if p_department_id is not null and not exists (
    select 1 from departments where id = p_department_id and facility_id = my_facility_id()
  ) then
    raise exception 'That department does not belong to your facility';
  end if;

  insert into staff (id, facility_id, role_id, department_id, first_name, last_name, phone)
  values (v_user, my_facility_id(), p_role_id, p_department_id, trim(p_first_name), trim(p_last_name), nullif(trim(coalesce(p_phone, '')), ''));

  return v_user;
end;
$$;

revoke execute on function link_staff_account(text, text, text, smallint, uuid, text) from public, anon;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function link_staff_account(text, text, text, smallint, uuid, text) to authenticated;
  end if;
end $$;

drop trigger if exists audit_staff on staff;
create trigger audit_staff after insert or update on staff
  for each row execute function log_audit_event();

-- =====================================================================
-- PATIENT PORTAL (migration 0012)
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

-- =====================================================================
-- DIGITAL HEALTH CARD (migration 0013)
-- =====================================================================


-- ---------------------------------------------------------------------
-- A. ACTIVATION CODES: NO EXPIRY, BUT CANCELLABLE
-- ---------------------------------------------------------------------

alter table portal_invites alter column expires_at drop not null;   -- NULL = never expires
alter table portal_invites add column if not exists cancelled_at timestamptz;

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
  update portal_invites set cancelled_at = now()
   where patient_id = p_patient_id and used_at is null and cancelled_at is null;

  v_bytes := gen_random_bytes(8);
  for i in 0..7 loop
    v_code := v_code || substr(alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;

  insert into portal_invites (patient_id, code_hash, created_by, expires_at)
  values (p_patient_id, digest(v_code, 'sha256'), auth.uid(), null);

  return jsonb_build_object('code', substr(v_code, 1, 4) || '-' || substr(v_code, 5, 4), 'expires_at', null);
end;
$$;

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
   where code_hash = digest(v_norm, 'sha256')
     and used_at is null
     and cancelled_at is null
     and (expires_at is null or expires_at > now())
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

-- staff can withdraw a code that has not been used (for example one that was lost)
create or replace function cancel_portal_invite(p_patient_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not has_permission('portal.manage') then
    raise exception 'You do not have permission to manage portal access';
  end if;

  if not exists (select 1 from patients where id = p_patient_id and registered_facility_id = my_facility_id()) then
    raise exception 'Patient not found at your facility';
  end if;

  update portal_invites set cancelled_at = now()
   where patient_id = p_patient_id and used_at is null and cancelled_at is null;
  get diagnostics v_count = row_count;

  if v_count > 0 then
    insert into audit_log (staff_id, table_name, record_id, action)
    values (auth.uid(), 'portal_invites', p_patient_id::text, 'delete');
  end if;
  return v_count;
end;
$$;

do $$
declare
  r text;
begin
  revoke execute on function cancel_portal_invite(uuid) from public;
  foreach r in array array['authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('grant execute on function cancel_portal_invite(uuid) to %I', r);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- B. CARD NUMBER
-- ---------------------------------------------------------------------

create sequence if not exists patient_card_seq;
alter table patients add column if not exists card_number text;

-- number existing patients in the order they were registered
do $$
declare
  r record;
begin
  for r in select id from patients where card_number is null order by created_at, id loop
    update patients
       set card_number = 'MP' || lpad(nextval('patient_card_seq')::text, 6, '0')
     where id = r.id;
  end loop;
end $$;

alter table patients alter column card_number set default ('MP' || lpad(nextval('patient_card_seq')::text, 6, '0'));
alter table patients alter column card_number set not null;
create unique index if not exists uq_patients_card_number on patients (card_number);

-- a card number is printed and handed to the patient, so it can never be changed
create or replace function guard_card_number()
returns trigger
language plpgsql
as $$
begin
  if new.card_number is distinct from old.card_number then
    raise exception 'A patient card number cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_card_number on patients;
create trigger trg_guard_card_number
  before update on patients
  for each row execute function guard_card_number();

-- =====================================================================
-- PHARMACY (migration 0014)
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


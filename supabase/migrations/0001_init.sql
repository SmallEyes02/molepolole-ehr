-- =====================================================================
-- Molepolole Primary Health EHR — Database Schema
-- PostgreSQL / Supabase
-- Normalized to Third Normal Form (3NF):
--   - every non-key column depends on the whole primary key
--   - no column depends on another non-key column (no transitive deps)
--   - repeating data (diagnoses, medications, labs, villages, allergies)
--     lives in its own reference table, referenced by id, never duplicated
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- 1. ORGANIZATION
-- ---------------------------------------------------------------------

create table facilities (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  facility_type text not null check (facility_type in ('clinic','health_post','hospital')),
  district text not null default 'Kweneng',
  phone text,
  created_at timestamptz not null default now()
);

create table departments (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references facilities(id) on delete cascade,
  name text not null,
  unique (facility_id, name)
);

create table roles (
  id smallint primary key,
  name text not null unique
);
insert into roles (id, name) values
  (1,'Administrator'), (2,'Doctor'), (3,'Nurse'), (4,'Clinician'), (5,'Records Officer');

-- staff.id mirrors auth.users.id — one row per authenticated account
create table staff (
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

create table villages (
  id serial primary key,
  name text not null,
  district text not null default 'Kweneng',
  unique (name, district)
);

create table allergies (
  id serial primary key,
  name text not null unique
);

create table icd_codes (
  id serial primary key,
  code text not null unique,
  description text not null
);

create table medications (
  id serial primary key,
  name text not null,
  form text not null,        -- tablet, syrup, injection...
  strength text not null,
  unique (name, form, strength)
);

create table lab_tests (
  id serial primary key,
  name text not null unique,
  unit text
);

create table immunizations (
  id serial primary key,
  name text not null unique
);

-- ---------------------------------------------------------------------
-- 3. PATIENTS
-- ---------------------------------------------------------------------

create table patients (
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
create index idx_patients_names on patients (last_name, first_name);
create index idx_patients_facility on patients (registered_facility_id);

-- many-to-many: patient <-> allergy, with attributes specific to the pairing
create table patient_allergies (
  patient_id uuid not null references patients(id) on delete cascade,
  allergy_id integer not null references allergies(id),
  severity text check (severity in ('mild','moderate','severe')),
  noted_date date not null default current_date,
  primary key (patient_id, allergy_id)
);

-- ---------------------------------------------------------------------
-- 4. VISITS / ENCOUNTERS
-- ---------------------------------------------------------------------

create table visits (
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
create index idx_visits_patient on visits (patient_id, visit_date desc);
create index idx_visits_facility on visits (facility_id, visit_date desc);

-- one-to-one with visit: vitals recorded once per encounter
create table vitals (
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
create table visit_diagnoses (
  visit_id uuid not null references visits(id) on delete cascade,
  icd_code_id integer not null references icd_codes(id),
  is_primary boolean not null default false,
  primary key (visit_id, icd_code_id)
);

create table prescriptions (
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

create table lab_orders (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references visits(id) on delete cascade,
  lab_test_id integer not null references lab_tests(id),
  ordered_by uuid references staff(id),
  ordered_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','completed','cancelled'))
);

-- one-to-one with lab_orders: a result belongs to exactly one order
create table lab_results (
  lab_order_id uuid primary key references lab_orders(id) on delete cascade,
  result_value text not null,
  result_flag text check (result_flag in ('normal','low','high','critical')),
  resulted_by uuid references staff(id),
  resulted_at timestamptz not null default now()
);

create table patient_immunizations (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  immunization_id integer not null references immunizations(id),
  dose_number smallint not null default 1,
  administered_date date not null default current_date,
  administered_by uuid references staff(id),
  unique (patient_id, immunization_id, dose_number)
);

-- ---------------------------------------------------------------------
-- 5. AUDIT TRAIL
-- ---------------------------------------------------------------------

create table audit_log (
  id bigserial primary key,
  staff_id uuid references staff(id),
  table_name text not null,
  record_id text not null,
  action text not null check (action in ('insert','update','delete')),
  occurred_at timestamptz not null default now()
);

-- =====================================================================
-- ROW LEVEL SECURITY
-- Staff can only see/write clinical data that belongs to their own
-- facility. Reference/lookup tables are readable by any signed-in staff.
-- =====================================================================

create or replace function my_facility_id()
returns uuid
language sql stable
as $$
  select facility_id from staff where id = auth.uid();
$$;

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

-- reference data: readable by any authenticated staff member
create policy "read reference" on villages for select using (auth.role() = 'authenticated');
create policy "read reference" on allergies for select using (auth.role() = 'authenticated');
create policy "read reference" on icd_codes for select using (auth.role() = 'authenticated');
create policy "read reference" on medications for select using (auth.role() = 'authenticated');
create policy "read reference" on lab_tests for select using (auth.role() = 'authenticated');
create policy "read reference" on immunizations for select using (auth.role() = 'authenticated');
create policy "read reference" on roles for select using (auth.role() = 'authenticated');
create policy "read facilities" on facilities for select using (auth.role() = 'authenticated');
create policy "read own facility departments" on departments for select using (facility_id = my_facility_id());
create policy "read own facility staff" on staff for select using (facility_id = my_facility_id());
create policy "update own staff row" on staff for update using (id = auth.uid());

create policy "facility scoped select" on patients for select using (registered_facility_id = my_facility_id());
create policy "facility scoped insert" on patients for insert with check (registered_facility_id = my_facility_id());
create policy "facility scoped update" on patients for update using (registered_facility_id = my_facility_id());

create policy "facility scoped select" on visits for select using (facility_id = my_facility_id());
create policy "facility scoped insert" on visits for insert with check (facility_id = my_facility_id());
create policy "facility scoped update" on visits for update using (facility_id = my_facility_id());

create policy "via visit facility" on vitals for select using (
  exists (select 1 from visits v where v.id = vitals.visit_id and v.facility_id = my_facility_id()));
create policy "via visit facility insert" on vitals for insert with check (
  exists (select 1 from visits v where v.id = vitals.visit_id and v.facility_id = my_facility_id()));

create policy "via visit facility" on visit_diagnoses for select using (
  exists (select 1 from visits v where v.id = visit_diagnoses.visit_id and v.facility_id = my_facility_id()));
create policy "via visit facility insert" on visit_diagnoses for insert with check (
  exists (select 1 from visits v where v.id = visit_diagnoses.visit_id and v.facility_id = my_facility_id()));

create policy "via visit facility" on prescriptions for select using (
  exists (select 1 from visits v where v.id = prescriptions.visit_id and v.facility_id = my_facility_id()));
create policy "via visit facility insert" on prescriptions for insert with check (
  exists (select 1 from visits v where v.id = prescriptions.visit_id and v.facility_id = my_facility_id()));

create policy "via visit facility" on lab_orders for select using (
  exists (select 1 from visits v where v.id = lab_orders.visit_id and v.facility_id = my_facility_id()));
create policy "via visit facility insert" on lab_orders for insert with check (
  exists (select 1 from visits v where v.id = lab_orders.visit_id and v.facility_id = my_facility_id()));

create policy "via order facility" on lab_results for select using (
  exists (select 1 from lab_orders o join visits v on v.id = o.visit_id
          where o.id = lab_results.lab_order_id and v.facility_id = my_facility_id()));
create policy "via order facility insert" on lab_results for insert with check (
  exists (select 1 from lab_orders o join visits v on v.id = o.visit_id
          where o.id = lab_results.lab_order_id and v.facility_id = my_facility_id()));

create policy "via patient facility" on patient_allergies for select using (
  exists (select 1 from patients p where p.id = patient_allergies.patient_id and p.registered_facility_id = my_facility_id()));
create policy "via patient facility insert" on patient_allergies for insert with check (
  exists (select 1 from patients p where p.id = patient_allergies.patient_id and p.registered_facility_id = my_facility_id()));

create policy "via patient facility" on patient_immunizations for select using (
  exists (select 1 from patients p where p.id = patient_immunizations.patient_id and p.registered_facility_id = my_facility_id()));
create policy "via patient facility insert" on patient_immunizations for insert with check (
  exists (select 1 from patients p where p.id = patient_immunizations.patient_id and p.registered_facility_id = my_facility_id()));

create policy "own facility audit read" on audit_log for select using (
  staff_id in (select id from staff where facility_id = my_facility_id()));

-- seed a Molepolole facility so the app has somewhere to attach the first staff account
insert into facilities (name, facility_type, district, phone) values
  ('Scottish Livingstone Hospital', 'hospital', 'Kweneng', '3910333'),
  ('Molepolole Clinic', 'clinic', 'Kweneng', null),
  ('Borakalalo Clinic', 'clinic', 'Kweneng', null);

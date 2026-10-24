-- =====================================================================
-- Migration 0004: referrals between facilities
-- Solves FR4: a patient treated at one facility can be referred to
-- another (e.g. clinic -> Scottish Livingstone Hospital) and the
-- receiving facility gets read access to exactly that patient's
-- clinical record, without gaining blanket access to the sending
-- facility's other patients.
-- =====================================================================

create table referrals (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  visit_id uuid references visits(id),                 -- the encounter that triggered the referral, if any
  referring_facility_id uuid not null references facilities(id),
  receiving_facility_id uuid not null references facilities(id),
  referred_by uuid references staff(id),
  reason text not null,
  status text not null default 'pending' check (status in ('pending','accepted','completed','declined')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (referring_facility_id <> receiving_facility_id)
);
create index idx_referrals_receiving on referrals (receiving_facility_id, status);
create index idx_referrals_patient on referrals (patient_id);

alter table referrals enable row level security;

-- the sending facility can see and create its own referrals
create policy "sender can select" on referrals for select using (referring_facility_id = my_facility_id());
create policy "sender can insert" on referrals for insert with check (referring_facility_id = my_facility_id());

-- the receiving facility can see referrals sent to it, and update status
create policy "receiver can select" on referrals for select using (receiving_facility_id = my_facility_id());
create policy "receiver can update status" on referrals for update using (receiving_facility_id = my_facility_id());

-- a facility that has an open referral for a patient gets read access to
-- that patient's record and visit history, even if registered elsewhere
create policy "referred patient visible to receiving facility" on patients for select using (
  id in (select patient_id from referrals where receiving_facility_id = my_facility_id())
);

create policy "referred patient visits visible to receiving facility" on visits for select using (
  patient_id in (select patient_id from referrals where receiving_facility_id = my_facility_id())
);

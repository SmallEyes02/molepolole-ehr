-- =====================================================================
-- Migration 0006: role-based access control
-- Solves FR5. Previously RLS only checked facility_id, so any signed-in
-- staff member (including a Records Officer) could create a clinical
-- encounter. This restricts clinical write actions to clinical roles:
-- Administrator(1), Doctor(2), Nurse(3), Clinician(4) — not
-- Records Officer(5), who registers patients but does not treat them.
-- =====================================================================

create or replace function my_role_id()
returns smallint
language sql stable
as $$
  select role_id from staff where id = auth.uid();
$$;

-- visits: only clinical roles may open an encounter
drop policy if exists "facility scoped insert" on visits;
create policy "facility scoped insert" on visits for insert with check (
  facility_id = my_facility_id() and my_role_id() in (1,2,3,4)
);

-- vitals: only clinical roles may record them
drop policy if exists "via visit facility insert" on vitals;
create policy "via visit facility insert" on vitals for insert with check (
  exists (select 1 from visits v where v.id = vitals.visit_id and v.facility_id = my_facility_id())
  and my_role_id() in (1,2,3,4)
);

-- diagnoses: only clinical roles may record them
drop policy if exists "via visit facility insert" on visit_diagnoses;
create policy "via visit facility insert" on visit_diagnoses for insert with check (
  exists (select 1 from visits v where v.id = visit_diagnoses.visit_id and v.facility_id = my_facility_id())
  and my_role_id() in (1,2,3,4)
);

-- referrals: only clinical roles may initiate a referral (it requires clinical judgement);
-- any staff at the receiving facility may accept/decline/complete it (front-desk coordination)
drop policy if exists "sender can insert" on referrals;
create policy "sender can insert" on referrals for insert with check (
  referring_facility_id = my_facility_id() and my_role_id() in (1,2,3,4)
);

-- =====================================================================
-- Migration 0008: role-based restriction on prescriptions
-- Prescriptions were left out of 0006's role check. A prescription is
-- as much a clinical action as a diagnosis, so it gets the same rule:
-- only clinical roles (Administrator, Doctor, Nurse, Clinician) may
-- write one.
-- =====================================================================

drop policy if exists "via visit facility insert" on prescriptions;
create policy "via visit facility insert" on prescriptions for insert with check (
  exists (select 1 from visits v where v.id = prescriptions.visit_id and v.facility_id = my_facility_id())
  and my_role_id() in (1,2,3,4)
);

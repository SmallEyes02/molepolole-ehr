-- =====================================================================
-- Migration 0011: link an existing login to a staff record
--
-- Creating a brand-new login needs Supabase's admin API (the
-- manage-staff Edge Function). This gives administrators a path that
-- needs no function deployment: create the login under Authentication,
-- Users in the Supabase dashboard (tick Auto Confirm), then link it
-- here. The function checks the caller is an active administrator and
-- only ever creates staff rows for the caller's own facility.
--
-- Also: staff INSERTs are now audited, not just updates.
-- Safe to run more than once.
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

-- =====================================================================
-- Migration 0013: the portal as a digital health card
--
-- 1. Activation codes no longer expire. A code works until it is used,
--    replaced by a newer one, or cancelled by staff. (Codes issued before
--    this migration keep the expiry they were given.)
-- 2. Every patient gets a permanent card number, like the number on a
--    paper clinic card. It is an identifier for finding a record, not a
--    secret: access still needs the patient's own login.
--
-- Safe to run more than once.
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

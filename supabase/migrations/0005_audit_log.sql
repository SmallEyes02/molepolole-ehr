-- =====================================================================
-- Migration 0005: audit logging
-- Solves FR7: audit_log existed as a table with nothing writing to it.
-- This adds trigger functions and attaches them to the tables where
-- "who touched this record" matters most for a clinical system.
-- =====================================================================

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

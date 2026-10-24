-- Migration 0009: fix infinite recursion in RLS helper functions.
-- my_facility_id() and my_role_id() query `staff`, whose own RLS policy
-- calls my_facility_id(), so evaluation recursed until Postgres aborted
-- with "stack depth limit exceeded". SECURITY DEFINER makes the inner
-- lookup run as the table owner, which bypasses RLS. Safe to run on any
-- project, whatever has already been applied.

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

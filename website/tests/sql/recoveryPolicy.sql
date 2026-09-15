-- Isolated PostgreSQL test only. Never run fixture setup against Supabase.
\set ON_ERROR_STOP on
begin;
create role anon;
create role authenticated;
-- Supabase's backend role bypasses RLS; ordinary signed-in users do not.
create role service_role bypassrls;
create table public.cp_secure_accounts(user_id uuid primary key, roster jsonb not null, encrypted_backup jsonb not null);
-- A small stub isolates the new SQL generation guard from the existing signed
-- roster implementation. Existing crypto tests validate the real protocol.
create function public.cp_secure_authorize_account(p_user uuid,p_roster jsonb,p_hash text,p_backup jsonb)
returns integer language plpgsql as $$
begin
  insert into public.cp_secure_accounts values(p_user,p_roster,p_backup)
  on conflict(user_id) do update set roster=excluded.roster,encrypted_backup=coalesce(excluded.encrypted_backup,cp_secure_accounts.encrypted_backup);
  return 1;
end; $$;
grant select,insert,update on public.cp_secure_accounts to service_role;
\ir ../../supabase/migrations/20260915134209_account_recovery_policy.sql

do $$
begin
  if (select generation from public.cp_secure_recovery_control) <> 0 then raise exception 'Preparation reset users'; end if;
  if has_table_privilege('anon','public.cp_secure_recovery_control','SELECT') then raise exception 'Anonymous policy table access'; end if;
  if has_table_privilege('authenticated','public.cp_secure_recovery_control','UPDATE') then raise exception 'User policy modification'; end if;
  if has_function_privilege('authenticated','public.cp_secure_authorize_account_recovery(uuid,jsonb,text,jsonb,integer)','EXECUTE') then raise exception 'User enrollment RPC access'; end if;
  if not (select relrowsecurity from pg_class where oid='public.cp_secure_recovery_control'::regclass) then raise exception 'RLS missing'; end if;
end; $$;
set local role service_role;
do $$
begin
  perform public.cp_secure_authorize_account('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','{}','fixture','{}');
  if (select count(*) from public.cp_secure_accounts) <> 1 then raise exception 'Generation-zero backend compatibility failed'; end if;
end; $$;
reset role;
update public.cp_secure_recovery_control set generation=1,reset_at=now(),require_passkey=true;
-- Simulate the controlled destructive step in the fixture only.
delete from public.cp_secure_accounts;
set local role service_role;
do $$
begin
  begin
    perform public.cp_secure_authorize_account('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','{}','fixture','{"passkey":{}}');
    raise exception 'An old deployment enrolled after reset';
  exception when serialization_failure then null; end;
  begin
    perform public.cp_secure_authorize_account_recovery('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','{}','fixture','{"passkey":{}}',0);
    raise exception 'An old generation enrolled after reset';
  exception when serialization_failure then null; end;
  begin
    perform public.cp_secure_authorize_account_recovery('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','{}','fixture','{}',1);
    raise exception 'Enrollment accepted a missing passkey';
  exception when invalid_parameter_value then null; end;
  perform public.cp_secure_authorize_account_recovery('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','{}','fixture','{"passkey":{}}',1);
  if (select count(*) from public.cp_secure_accounts) <> 1 then raise exception 'New generation failed to enroll under the backend role'; end if;
  begin
    update public.cp_secure_accounts set encrypted_backup='{}';
    raise exception 'Passkey downgrade was accepted';
  exception when invalid_parameter_value then null; end;
end; $$;
reset role;
select 'recovery SQL policy guard and backend role checks passed' as test_result;
rollback;

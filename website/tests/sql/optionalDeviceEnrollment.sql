-- Disposable PostgreSQL fixture only; never run on the production database.
\set ON_ERROR_STOP on
begin;
create role anon;
create role authenticated;
create role service_role bypassrls;
create table public.cp_secure_accounts(user_id uuid primary key, roster jsonb not null, encrypted_backup jsonb not null);
create function public.cp_secure_authorize_account(p_user uuid,p_roster jsonb,p_hash text,p_backup jsonb)
returns integer language plpgsql as $$ begin
  insert into public.cp_secure_accounts values(p_user,p_roster,coalesce(p_backup,(select encrypted_backup from public.cp_secure_accounts where user_id=p_user)))
  on conflict(user_id) do update set roster=excluded.roster,encrypted_backup=excluded.encrypted_backup;
  return 1;
end; $$;
grant select,insert,update on public.cp_secure_accounts to service_role;
\ir ../../supabase/migrations/20260915134209_account_recovery_policy.sql
\ir ../../supabase/migrations/20260916134702_account_messaging_mode.sql
\ir ../../supabase/migrations/20260927203117_optional_device_enrollment.sql
do $$ begin
  if (select allow_device_setup from public.cp_secure_recovery_control) then raise exception 'Migration enabled rollout prematurely'; end if;
  if (select generation from public.cp_secure_recovery_control) <> 0 then raise exception 'Migration changed generation'; end if;
  if has_function_privilege('authenticated','public.cp_secure_authorize_account_recovery(uuid,jsonb,text,jsonb,integer)','EXECUTE') then raise exception 'User can bypass API proofs'; end if;
  if has_table_privilege('authenticated','public.cp_secure_recovery_control','UPDATE') then raise exception 'User can change policy'; end if;
end; $$;
update public.cp_secure_recovery_control set generation=1,reset_at=now(),require_passkey=true,allow_device_setup=true;
set local role service_role;
do $$ begin
  begin
    perform public.cp_secure_authorize_account('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','{}','fixture','{}');
    raise exception 'Old client enrolled';
  exception when serialization_failure then null; end;
  begin
    perform public.cp_secure_authorize_account_recovery('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','{}','fixture','{}',0);
    raise exception 'Stale generation enrolled';
  exception when serialization_failure then null; end;
  perform public.cp_secure_authorize_account_recovery('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','{}','fixture','{}',1);
  if (select count(*) from public.cp_secure_accounts) <> 1 then raise exception 'Passkey-free enrollment failed'; end if;
  update public.cp_secure_accounts set encrypted_backup='{"password":{"signature":"preserved"}}';
  begin
    update public.cp_secure_accounts set encrypted_backup='{}';
    raise exception 'Password recovery stripped';
  exception when invalid_parameter_value then null; end;
  update public.cp_secure_accounts set encrypted_backup=encrypted_backup||'{"passkey":{"signature":"preserved"}}';
  begin
    update public.cp_secure_accounts set encrypted_backup=encrypted_backup-'passkey';
    raise exception 'Passkey recovery stripped';
  exception when invalid_parameter_value then null; end;
end; $$;
reset role;
update public.cp_secure_recovery_control set messaging_mode='account';
set local role service_role;
do $$ begin
  begin
    perform public.cp_secure_authorize_account_recovery('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','{}','fixture','{}',1);
    raise exception 'Inactive encrypted messaging enrolled';
  exception when object_not_in_prerequisite_state then null; end;
end; $$;
reset role;
select 'Optional setup keeps generation, mode, existing recovery and backend-only authorization guards' as test_result;
rollback;


-- Additive capability. Activation is an explicit release operation, never a reset.
alter table public.cp_secure_recovery_control
  add column allow_device_setup boolean not null default false;
comment on column public.cp_secure_recovery_control.allow_device_setup is
  'Allows generation-aware E2EE enrollment with device-stored keys and optional recovery. Existing roots and recovery methods remain protected.';

create or replace function public.cp_secure_guard_recovery_generation()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare policy public.cp_secure_recovery_control%rowtype;
begin
  select * into strict policy from public.cp_secure_recovery_control where singleton for share;
  if policy.messaging_mode = 'account' then
    raise exception 'Encrypted device enrollment is not active.' using errcode = '55000';
  end if;
  if policy.require_passkey and not policy.allow_device_setup then
    if jsonb_typeof(new.encrypted_backup->'passkey') is distinct from 'object' then
      raise exception 'A client-encrypted passkey backup is required.' using errcode = '22023';
    end if;
  end if;
  -- Making recovery optional must never strip an existing recovery method.
  if tg_op = 'UPDATE' and old.encrypted_backup ? 'passkey'
    and new.encrypted_backup->'passkey' is distinct from old.encrypted_backup->'passkey' then
    raise exception 'Existing account recovery must be preserved.' using errcode = '22023';
  end if;
  if tg_op = 'UPDATE' and old.encrypted_backup ? 'password'
    and new.encrypted_backup->'password' is distinct from old.encrypted_backup->'password' then
    raise exception 'Existing password recovery must be preserved.' using errcode = '22023';
  end if;
  if policy.require_passkey or policy.allow_device_setup then
    if tg_op = 'INSERT' or new.roster is distinct from old.roster then
      if current_setting('cp.recovery_generation', true) is distinct from policy.generation::text then
        raise exception 'Update the account recovery client before authorization.' using errcode = '40001';
      end if;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.cp_secure_guard_recovery_generation() from public, anon, authenticated;

create or replace function public.cp_secure_authorize_account_recovery(
  p_user uuid, p_roster jsonb, p_hash text, p_backup jsonb, p_generation integer
) returns integer language plpgsql security invoker set search_path = '' as $$
declare policy public.cp_secure_recovery_control%rowtype; stored_backup jsonb;
begin
  select * into strict policy from public.cp_secure_recovery_control where singleton for share;
  if p_generation is null or p_generation <> policy.generation then
    raise exception 'Recovery generation changed. Refresh this account.' using errcode = '40001';
  end if;
  if policy.require_passkey and not policy.allow_device_setup then
    select encrypted_backup into stored_backup from public.cp_secure_accounts where user_id = p_user;
    if jsonb_typeof(coalesce(p_backup, stored_backup)->'passkey') is distinct from 'object' then
      raise exception 'A client-encrypted passkey backup is required.' using errcode = '22023';
    end if;
  end if;
  perform set_config('cp.recovery_generation', policy.generation::text, true);
  return public.cp_secure_authorize_account(p_user, p_roster, p_hash, p_backup);
end;
$$;
revoke all on function public.cp_secure_authorize_account_recovery(uuid,jsonb,text,jsonb,integer) from public, anon, authenticated;
grant execute on function public.cp_secure_authorize_account_recovery(uuid,jsonb,text,jsonb,integer) to service_role;

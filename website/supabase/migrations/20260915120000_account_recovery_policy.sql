-- Additive preparation only. Applying this migration DOES NOT reset any user.
create table public.cp_secure_recovery_control (
  singleton boolean primary key default true check (singleton),
  generation integer not null default 0 check (generation >= 0),
  reset_at timestamptz,
  require_passkey boolean not null default false,
  rollout_verified boolean not null default false,
  verified_release jsonb,
  reset_summary jsonb,
  check ((generation = 0 and reset_at is null) or (generation > 0 and reset_at is not null and require_passkey))
);
insert into public.cp_secure_recovery_control(singleton) values (true);
alter table public.cp_secure_recovery_control enable row level security;
revoke all on public.cp_secure_recovery_control from public, anon, authenticated;
grant select, insert, update, delete on public.cp_secure_recovery_control to service_role;

-- An older retained deployment must not re-enroll an old identity after reset.
-- Only the new generation-aware wrapper sets this transaction-local context.
create or replace function public.cp_secure_guard_recovery_generation()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare policy public.cp_secure_recovery_control%rowtype;
begin
  select * into strict policy from public.cp_secure_recovery_control where singleton for share;
  if policy.require_passkey then
    if jsonb_typeof(new.encrypted_backup->'passkey') is distinct from 'object' then
      raise exception 'A client-encrypted passkey backup is required.' using errcode = '22023';
    end if;
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
create trigger cp_secure_recovery_generation_guard before insert or update on public.cp_secure_accounts
for each row execute function public.cp_secure_guard_recovery_generation();

-- Serialize enrollment with the operator reset. Existing cryptographic
-- authorization remains in cp_secure_authorize_account, unchanged.
create or replace function public.cp_secure_authorize_account_recovery(
  p_user uuid, p_roster jsonb, p_hash text, p_backup jsonb, p_generation integer
) returns integer language plpgsql security invoker set search_path = '' as $$
declare policy public.cp_secure_recovery_control%rowtype; stored_backup jsonb;
begin
  select * into strict policy from public.cp_secure_recovery_control where singleton for share;
  if p_generation is null or p_generation <> policy.generation then
    raise exception 'Recovery generation changed. Refresh this account.' using errcode = '40001';
  end if;
  if policy.require_passkey then
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

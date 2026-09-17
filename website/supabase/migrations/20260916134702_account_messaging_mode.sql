-- Additive only: no reset, no mode switch, and no existing identity conversion.
-- The owner explicitly selected server-readable account messaging on 2026-09-16.
alter table public.cp_secure_recovery_control
  add column messaging_mode text not null default 'e2ee'
  check (messaging_mode in ('e2ee', 'account'));

create or replace function public.cp_secure_guard_recovery_generation()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare policy public.cp_secure_recovery_control%rowtype;
begin
  select * into strict policy from public.cp_secure_recovery_control where singleton for share;
  if policy.messaging_mode = 'account' then
    raise exception 'Update ComePlayers. Messages now use account login without device-key enrollment.' using errcode = '55000';
  end if;
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

comment on column public.cp_secure_recovery_control.messaging_mode is
  'Operator-controlled message model. account blocks retired E2EE enrollment; activate only with zero encrypted identities/events.';

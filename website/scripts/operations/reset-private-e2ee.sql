-- OPERATOR-ONLY DRY RUN. Not an automatic migration and not called by the app.
-- User approved resetting E2EE/private encrypted history, NOT login or business data.
-- Complete docs/ACCOUNT_RECOVERY_ROLLOUT_2026-09-15.md before execution.
-- This file intentionally ends with ROLLBACK. Switch to COMMIT only at verified cutover.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$
declare
  policy public.cp_secure_recovery_control%rowtype;
  before_counts jsonb;
  preserved_counts jsonb;
  after_preserved jsonb;
begin
  select * into strict policy from public.cp_secure_recovery_control where singleton for update;
  if policy.generation <> 0 then
    raise exception 'This one-time reset has already run or the generation changed.';
  end if;
  if not policy.rollout_verified
    or coalesce(policy.verified_release->>'webCommit','') !~ '^[0-9a-f]{40}$'
    or coalesce(policy.verified_release->>'webDeployment','') !~ '^dpl_[A-Za-z0-9]+$'
    or coalesce(policy.verified_release->>'androidArtifactSha256','') !~ '^[0-9a-f]{64}$'
    or coalesce(policy.verified_release->>'physicalPasskeyRestore','') <> 'true'
    or coalesce(policy.verified_release->>'desktopPasskeyRestore','') <> 'true' then
    raise exception 'Replacement web, signed Android release and real-device passkey recovery must be verified before reset.';
  end if;
  -- Fixed allowlist, no TRUNCATE/CASCADE and no dynamically named DELETEs.
  lock table public.cp_secure_accounts, public.cp_secure_devices,
    public.cp_secure_rosters, public.cp_secure_epochs, public.cp_secure_events,
    public.cp_secure_event_users, public.cp_secure_blobs, public.cp_secure_usage
    in exclusive mode;
  if exists(select 1 from public.cp_secure_blobs) then
    raise exception 'Encrypted objects exist. Prepare and verify exact-key R2 removal before using a separately reviewed reset. Do not delete the object index first.';
  end if;
  if exists(select 1 from public.cp_secure_epochs e join public.chat_rooms r on r.id=e.room_id where r.room_type='group')
    or exists(select 1 from public.cp_secure_events e join public.chat_rooms r on r.id=e.room_id where r.room_type='group') then
    raise exception 'Encrypted group data found. Community is excluded from this reset.';
  end if;
  select jsonb_build_object(
    'accounts',(select count(*) from public.cp_secure_accounts),
    'devices',(select count(*) from public.cp_secure_devices),
    'rosters',(select count(*) from public.cp_secure_rosters),
    'epochs',(select count(*) from public.cp_secure_epochs),
    'events',(select count(*) from public.cp_secure_events),
    'eventUsers',(select count(*) from public.cp_secure_event_users),
    'blobs',(select count(*) from public.cp_secure_blobs),
    'usage',(select count(*) from public.cp_secure_usage)
  ) into before_counts;
  select jsonb_build_object(
    'loginAccounts',(select count(*) from auth.users),
    'profiles',(select count(*) from public.profiles),
    'rooms',(select count(*) from public.chat_rooms),
    'legacyMessages',(select count(*) from public.chat_messages)
  ) into preserved_counts;
  delete from public.cp_secure_event_users;
  delete from public.cp_secure_events;
  delete from public.cp_secure_blobs;
  delete from public.cp_secure_epochs;
  delete from public.cp_secure_rosters;
  delete from public.cp_secure_devices;
  delete from public.cp_secure_accounts;
  delete from public.cp_secure_usage;
  select jsonb_build_object(
    'loginAccounts',(select count(*) from auth.users),
    'profiles',(select count(*) from public.profiles),
    'rooms',(select count(*) from public.chat_rooms),
    'legacyMessages',(select count(*) from public.chat_messages)
  ) into after_preserved;
  if preserved_counts is distinct from after_preserved then
    raise exception 'Protected data counts changed; the transaction is cancelled.';
  end if;
  update public.cp_secure_recovery_control set generation=1,
    reset_at=clock_timestamp(), require_passkey=true,
    reset_summary=jsonb_build_object('removed',before_counts,'preserved',preserved_counts,'scope','private-e2ee-only')
    where singleton and generation=0;
  raise notice 'Private E2EE reset preview: removed %, preserved %', before_counts, preserved_counts;
end;
$$;
select generation, reset_at, require_passkey, reset_summary
from public.cp_secure_recovery_control where singleton;
rollback;

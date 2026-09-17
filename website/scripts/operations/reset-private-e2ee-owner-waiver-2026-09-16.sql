-- OPERATOR-ONLY DRY RUN. Not an automatic migration and not called by the app.
-- User approved resetting E2EE/private encrypted history, NOT login or business data.
-- Explicit owner waiver: skip the two-physical-device and Windows recovery tests.
-- Released replacement: web 5842748 / Android 18, original signing certificate.
-- Scope is unchanged. No tool approval may be bypassed.
-- This review copy ends with ROLLBACK. A separately authorized execution uses COMMIT.
-- rollout_verified and both device-test booleans remain FALSE.
begin isolation level repeatable read;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$
declare
  policy public.cp_secure_recovery_control%rowtype;
  before_counts jsonb;
  preserved_counts jsonb;
  after_preserved jsonb;
  protected_before jsonb := '{}'::jsonb;
  protected_after jsonb := '{}'::jsonb;
  table_check record;
  table_digest jsonb;
  stale_generation_rejected boolean := false;
  missing_passkey_rejected boolean := false;
begin
  select * into strict policy from public.cp_secure_recovery_control where singleton for update;
  if policy.generation <> 0 then
    raise exception 'This one-time reset has already run or the generation changed.';
  end if;
  -- The owner explicitly waived physical-device and Windows recovery tests
  -- on 2026-09-16. This operator-only exception does not mark those tests passed.
  if policy.rollout_verified or policy.reset_at is not null then
    raise exception 'Unexpected readiness state; review before this one-time exception.';
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

  -- This exception is limited to the exact inspected production inventory.
  if before_counts <> '{"accounts":1,"devices":1,"rosters":1,"epochs":0,"events":0,"eventUsers":0,"blobs":0,"usage":0}'::jsonb
    or not exists(select 1 from public.cp_secure_accounts where user_id='70cc261f-7053-44e0-b41f-dd689b7b74f5'::uuid) then
    raise exception 'E2EE inventory changed; stop and review the new scope.';
  end if;
  if exists(select 1 from pg_trigger where not tgisinternal and tgenabled<>'D'
      and (tgtype::integer & 8)<>0
      and tgrelid in('public.cp_secure_accounts'::regclass,'public.cp_secure_devices'::regclass,
        'public.cp_secure_rosters'::regclass,'public.cp_secure_epochs'::regclass,
        'public.cp_secure_events'::regclass,'public.cp_secure_event_users'::regclass,
        'public.cp_secure_blobs'::regclass,'public.cp_secure_usage'::regclass))
    or exists(select 1 from pg_trigger where not tgisinternal
      and tgrelid='public.cp_secure_recovery_control'::regclass and tgenabled<>'D') then
    raise exception 'An unreviewed mutation trigger exists.';
  end if;
  if not exists(select 1 from pg_trigger where tgrelid='public.cp_secure_accounts'::regclass
      and tgname='cp_secure_recovery_generation_guard' and tgenabled='O') then
    raise exception 'The required enrollment guard is not enabled.';
  end if;

  -- Read-only fingerprints stay inside PostgreSQL; no row contents are returned.
  for table_check in
    select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where c.relkind in ('r','p') and (n.nspname='auth'
      or (n.nspname='public' and c.relname not in ('cp_secure_accounts','cp_secure_devices','cp_secure_rosters','cp_secure_epochs','cp_secure_events','cp_secure_event_users','cp_secure_blobs','cp_secure_usage','cp_secure_recovery_control')))
    order by n.nspname,c.relname
  loop
    execute format(
      'select jsonb_build_object(''rows'',count(*),''digest'',md5(coalesce(string_agg(row_digest,''''
       order by row_digest),''''))) from (select md5(to_jsonb(t)::text) as row_digest from %I.%I t) hashes',
      table_check.nspname,table_check.relname) into table_digest;
    protected_before := protected_before || jsonb_build_object(table_check.nspname||'.'||table_check.relname,table_digest);
  end loop;

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
    reset_at=clock_timestamp(), require_passkey=true, rollout_verified=false,
    verified_release='{"webCommit":"5842748604803bfa14eed26e29bd35c0abfe9cd4","webDeployment":"dpl_wntX269pLvtTbgtqfycD4Gu8R4Vn","androidBuild":"528222d7-3c51-4f66-b21e-e177764ffbb3","androidArtifactSha256":"86e9e45cff6abdbf7b51dee6b2302808cd83684d5e2c75fa41688046d0a8d1a6","androidSigningCertificateSha256":"0a75bc67bf7e34ba4e80a1dbb40cd9b8a3e91c6cb2204a742b5493512bd48cf2","physicalPasskeyRestore":false,"desktopPasskeyRestore":false,"physicalUpdateInstallVerified":false,"testStatus":"Physical update, two-device recovery and Windows recovery are unverified. Owner explicitly requested immediate reset without those device-test results.","ownerWaiver":{"date":"2026-09-16","scope":"physical-and-windows-test-prerequisites-only","instruction":"Skip the two-physical-device and Windows test results and reset immediately."}}'::jsonb,
    reset_summary=jsonb_build_object('removed',before_counts,'preserved',preserved_counts,
      'scope','private-e2ee-only','executionMode','owner-waived-device-tests')
    where singleton and generation=0;

  -- Verify the existing generation/passkey guards without enrolling any account.
  begin
    perform public.cp_secure_authorize_account_recovery(
      '70cc261f-7053-44e0-b41f-dd689b7b74f5'::uuid,null,null,null,0);
    raise exception 'Stale enrollment unexpectedly accepted.';
  exception when sqlstate '40001' then stale_generation_rejected := true;
  end;
  begin
    perform public.cp_secure_authorize_account_recovery(
      '70cc261f-7053-44e0-b41f-dd689b7b74f5'::uuid,null,null,null,1);
    raise exception 'Enrollment without a passkey unexpectedly accepted.';
  exception when sqlstate '22023' then missing_passkey_rejected := true;
  end;

  -- Read-only fingerprints stay inside PostgreSQL; no row contents are returned.
  for table_check in
    select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where c.relkind in ('r','p') and (n.nspname='auth'
      or (n.nspname='public' and c.relname not in ('cp_secure_accounts','cp_secure_devices','cp_secure_rosters','cp_secure_epochs','cp_secure_events','cp_secure_event_users','cp_secure_blobs','cp_secure_usage','cp_secure_recovery_control')))
    order by n.nspname,c.relname
  loop
    execute format(
      'select jsonb_build_object(''rows'',count(*),''digest'',md5(coalesce(string_agg(row_digest,''''
       order by row_digest),''''))) from (select md5(to_jsonb(t)::text) as row_digest from %I.%I t) hashes',
      table_check.nspname,table_check.relname) into table_digest;
    protected_after := protected_after || jsonb_build_object(table_check.nspname||'.'||table_check.relname,table_digest);
  end loop;

  if protected_before is distinct from protected_after then
    raise exception 'Protected Auth/public rows changed; reset rolled back.';
  end if;
  update public.cp_secure_recovery_control
    set reset_summary=reset_summary || jsonb_build_object(
      'protectedTableCount',(select count(*) from jsonb_object_keys(protected_before)),
      'protectedRowsUnchanged',true,'staleGenerationRejected',stale_generation_rejected,
      'missingPasskeyRejected',missing_passkey_rejected)
    where singleton;
  raise notice 'Private E2EE reset: removed %, protected rows verified unchanged.',before_counts;
end;
$$;
rollback;
select generation, reset_at, require_passkey, rollout_verified, reset_summary
from public.cp_secure_recovery_control where singleton;

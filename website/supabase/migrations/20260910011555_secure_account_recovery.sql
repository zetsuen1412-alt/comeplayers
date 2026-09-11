-- Additive foundation for encrypted multi-device recovery. Not the previous
-- delete-on-ACK relay. No legacy message, attachment or call history is deleted.
-- Root/device private keys and recovery secrets never belong in these tables.
create table public.cp_secure_accounts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  encryption_key text not null check(encryption_key ~ '^[0-9a-f]{64}$'),
  signing_key text not null check(signing_key ~ '^[0-9a-f]{64}$'),
  revision integer not null check(revision >= 1),
  roster_hash text not null check(roster_hash ~ '^[0-9a-f]{64}$'),
  roster jsonb not null check(octet_length(roster::text) <= 16384),
  encrypted_backup jsonb not null check(octet_length(encrypted_backup::text) <= 16384),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.cp_secure_rosters (
  user_id uuid not null references public.cp_secure_accounts(user_id) on delete cascade,
  revision integer not null check(revision >= 1),
  roster_hash text not null check(roster_hash ~ '^[0-9a-f]{64}$'),
  roster jsonb not null check(octet_length(roster::text) <= 16384),
  created_at timestamptz not null default now(),
  primary key(user_id,revision)
);
create table public.cp_secure_devices (
  user_id uuid not null references public.cp_secure_accounts(user_id) on delete cascade,
  device_id uuid not null,
  encryption_key text not null check(encryption_key ~ '^[0-9a-f]{64}$'),
  signing_key text not null check(signing_key ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null,
  authorized_revision integer not null,
  revoked_revision integer,
  primary key(user_id,device_id),
  check(revoked_revision is null or revoked_revision > authorized_revision)
);
create index cp_secure_devices_active on public.cp_secure_devices(user_id) where revoked_revision is null;
do $$ declare tab text; begin
  foreach tab in array array['cp_secure_accounts','cp_secure_rosters','cp_secure_devices'] loop
    execute format('alter table public.%I enable row level security',tab);
    -- Requests go through authenticated routes that verify device/root signatures.
    -- A stolen login token alone cannot register devices or replace a backup.
    execute format('revoke all on public.%I from public,anon,authenticated',tab);
    execute format('grant all on public.%I to service_role',tab);
  end loop;
end $$;

create function public.cp_secure_authorize_account(p_user uuid,p_roster jsonb,p_hash text,p_backup jsonb default null)
returns integer language plpgsql security invoker set search_path='' as $$
declare old public.cp_secure_accounts; entry jsonb; device public.cp_secure_devices; next_revision integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('secure-account:'||p_user::text,0));
  if p_roster->>'v' is distinct from '2' or p_roster->'identity'->>'userId' is distinct from p_user::text
    or jsonb_typeof(p_roster->'devices') is distinct from 'array'
    or jsonb_array_length(p_roster->'devices') not between 1 and 8
    or p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid encryption identity'; end if;
  next_revision=(p_roster->>'revision')::integer;
  if next_revision is null or next_revision<1 then raise exception 'Invalid roster revision'; end if;
  select * into old from public.cp_secure_accounts where user_id=p_user for update;
  if found then
    if old.encryption_key is distinct from p_roster->'identity'->>'encryptionKey'
      or old.signing_key is distinct from p_roster->'identity'->>'signingKey' then raise exception 'Identity replacement denied'; end if;
    if old.revision=next_revision and old.roster_hash=p_hash and old.roster=p_roster
      and (p_backup is null or p_backup=old.encrypted_backup) then return old.revision; end if;
    if next_revision<>old.revision+1 or p_roster->>'previous' is distinct from old.roster_hash then raise exception 'Stale roster revision'; end if;
    if (select count(*) from public.cp_secure_rosters where user_id=p_user and created_at>now()-interval '1 hour')>=30 then raise exception 'Device authorization rate limit'; end if;
  else
    if next_revision<>1 or p_roster->'previous' is distinct from 'null'::jsonb or p_backup is null then raise exception 'Initial identity backup required'; end if;
  end if;
  if p_backup is not null and (p_backup->>'v' is distinct from '2' or p_backup->>'userId' is distinct from p_user::text
    or p_backup->>'ciphertext' is null or p_backup->>'ciphertext' !~ '^([0-9a-f]{2})+$'
    or length(p_backup->>'ciphertext') not between 80 and 8192) then raise exception 'Invalid encrypted backup'; end if;
  -- A removed device ID is never resurrected. Recovery generates a new key pair
  -- and ID, while preserving the immutable account root and existing devices.
  for entry in select value from jsonb_array_elements(p_roster->'devices') loop
    if entry->'identity'->>'userId' is distinct from p_user::text then raise exception 'Foreign device'; end if;
    select * into device from public.cp_secure_devices where user_id=p_user and device_id=(entry->>'id')::uuid;
    if found and (device.revoked_revision is not null
      or device.encryption_key is distinct from entry->'identity'->>'encryptionKey'
      or device.signing_key is distinct from entry->'identity'->>'signingKey'
      or device.created_at is distinct from (entry->>'createdAt')::timestamptz) then raise exception 'Device identity cannot be reassigned'; end if;
  end loop;
  insert into public.cp_secure_accounts(user_id,encryption_key,signing_key,revision,roster_hash,roster,encrypted_backup)
    values(p_user,p_roster->'identity'->>'encryptionKey',p_roster->'identity'->>'signingKey',next_revision,p_hash,p_roster,coalesce(p_backup,old.encrypted_backup))
    on conflict(user_id) do update set revision=excluded.revision,roster_hash=excluded.roster_hash,roster=excluded.roster,encrypted_backup=excluded.encrypted_backup,updated_at=now();
  insert into public.cp_secure_rosters(user_id,revision,roster_hash,roster) values(p_user,next_revision,p_hash,p_roster);
  update public.cp_secure_devices set revoked_revision=next_revision where user_id=p_user and revoked_revision is null
    and not exists(select 1 from jsonb_array_elements(p_roster->'devices') item where (item->>'id')::uuid=device_id);
  for entry in select value from jsonb_array_elements(p_roster->'devices') loop
    insert into public.cp_secure_devices(user_id,device_id,encryption_key,signing_key,created_at,authorized_revision)
      values(p_user,(entry->>'id')::uuid,entry->'identity'->>'encryptionKey',entry->'identity'->>'signingKey',(entry->>'createdAt')::timestamptz,next_revision)
      on conflict(user_id,device_id) do nothing;
  end loop;
  return next_revision;
end $$;
revoke all on function public.cp_secure_authorize_account(uuid,jsonb,text,jsonb) from public,anon,authenticated;
grant execute on function public.cp_secure_authorize_account(uuid,jsonb,text,jsonb) to service_role;

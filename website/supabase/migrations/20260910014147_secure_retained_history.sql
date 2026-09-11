-- Retained E2EE history. Rows contain authenticated public metadata and opaque
-- ciphertext only. Durable device sync never deletes a history event.
create table public.cp_secure_epochs (
  id uuid primary key,
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  epoch integer not null check(epoch >= 1),
  epoch_hash text not null check(epoch_hash ~ '^[0-9a-f]{64}$'),
  previous_hash text check(previous_hash is null or previous_hash ~ '^[0-9a-f]{64}$'),
  author_user_id uuid not null references public.profiles(id) on delete cascade,
  author_device_id uuid not null,
  payload jsonb not null check(octet_length(payload::text) <= 196608),
  client_created_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique(room_id,epoch),
  unique(room_id,epoch_hash)
);
create index cp_secure_epochs_room_created on public.cp_secure_epochs(room_id,epoch desc);

create table public.cp_secure_blobs (
  id uuid primary key,
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  epoch_id uuid not null references public.cp_secure_epochs(id) on delete restrict,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  owner_device_id uuid not null,
  object_key text not null unique,
  size_bytes integer not null check(size_bytes between 41 and 4194344),
  attached_event_id uuid unique,
  created_at timestamptz not null default now(),
  prepare_expires_at timestamptz
);
create index cp_secure_blobs_owner on public.cp_secure_blobs(owner_id,created_at);
create index cp_secure_blobs_room on public.cp_secure_blobs(room_id);
create index cp_secure_blobs_epoch on public.cp_secure_blobs(epoch_id);
create index cp_secure_blobs_unattached on public.cp_secure_blobs(prepare_expires_at) where attached_event_id is null;

create table public.cp_secure_events (
  sequence bigint generated always as identity primary key,
  id uuid not null unique,
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  epoch_id uuid not null references public.cp_secure_epochs(id) on delete restrict,
  epoch_hash text not null check(epoch_hash ~ '^[0-9a-f]{64}$'),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  device_id uuid not null,
  event_hash text not null check(event_hash ~ '^[0-9a-f]{64}$'),
  payload jsonb not null check(octet_length(payload::text) <= 75000),
  blob_id uuid references public.cp_secure_blobs(id) on delete restrict,
  client_created_at timestamptz not null,
  notification_sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index cp_secure_events_room_sequence on public.cp_secure_events(room_id,sequence);
create index cp_secure_events_sender_rate on public.cp_secure_events(sender_id,created_at desc);
create index cp_secure_events_epoch on public.cp_secure_events(epoch_id);
create unique index cp_secure_events_blob on public.cp_secure_events(blob_id) where blob_id is not null;

-- Two small routing rows per direct event avoid scanning unrelated global
-- traffic during deep history recovery. Pagination stays index-backed.
create table public.cp_secure_event_users (
  user_id uuid not null references public.profiles(id) on delete cascade,
  sequence bigint not null references public.cp_secure_events(sequence) on delete cascade,
  event_id uuid not null references public.cp_secure_events(id) on delete cascade,
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  primary key(user_id,sequence),
  unique(user_id,event_id)
);
create index cp_secure_event_users_event on public.cp_secure_event_users(event_id);
create index cp_secure_event_users_room on public.cp_secure_event_users(room_id,user_id,sequence);

create table public.cp_secure_usage (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  event_count integer not null default 0 check(event_count between 0 and 200000),
  event_bytes bigint not null default 0 check(event_bytes between 0 and 268435456),
  updated_at timestamptz not null default now()
);

do $$ declare tab text; begin
  foreach tab in array array['cp_secure_epochs','cp_secure_blobs','cp_secure_events','cp_secure_event_users','cp_secure_usage'] loop
    execute format('alter table public.%I enable row level security',tab);
    execute format('revoke all on public.%I from public,anon,authenticated',tab);
    execute format('grant all on public.%I to service_role',tab);
  end loop;
end $$;
revoke all on sequence public.cp_secure_events_sequence_seq from public,anon,authenticated;
grant usage,select on sequence public.cp_secure_events_sequence_seq to service_role;

create function public.cp_secure_put_epoch(p_actor uuid,p_room uuid,p_epoch jsonb,p_hash text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare room public.chat_rooms; latest public.cp_secure_epochs; old public.cp_secure_epochs; member jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('secure-epoch:'||p_room::text,0));
  select * into room from public.chat_rooms where id=p_room and coalesce(room_type,'direct')<>'group' and status='active'
    and p_actor in(buyer_id,seller_id) for update;
  if not found then raise exception 'Private room unavailable'; end if;
  if p_epoch->>'v' is distinct from '2' or p_epoch->>'id' is distinct from (p_epoch->>'id')::uuid::text
    or p_epoch->>'roomId' is distinct from p_room::text or p_epoch->>'authorUserId' is distinct from p_actor::text
    or p_hash !~ '^[0-9a-f]{64}$' or octet_length(p_epoch::text)>196608 then raise exception 'Invalid epoch'; end if;
  select * into old from public.cp_secure_epochs where id=(p_epoch->>'id')::uuid;
  if found then
    if old.room_id<>p_room or old.epoch_hash<>p_hash or old.payload<>p_epoch then raise exception 'Epoch ID collision'; end if;
    return false;
  end if;
  select * into latest from public.cp_secure_epochs where room_id=p_room order by epoch desc limit 1;
  if found then
    if (p_epoch->>'epoch')::integer<>latest.epoch+1 or p_epoch->>'previous' is distinct from latest.epoch_hash then raise exception 'Stale epoch'; end if;
  elsif (p_epoch->>'epoch')::integer<>1 or p_epoch->'previous'<>'null'::jsonb then raise exception 'Invalid genesis epoch';
  end if;
  if jsonb_typeof(p_epoch->'members') is distinct from 'array' or jsonb_array_length(p_epoch->'members')<>2 then raise exception 'Invalid direct membership'; end if;
  if (select count(distinct m->'roster'->'identity'->>'userId') from jsonb_array_elements(p_epoch->'members') m
      where (m->'roster'->'identity'->>'userId')::uuid in(room.buyer_id,room.seller_id))<>2 then raise exception 'Room membership mismatch'; end if;
  for member in select value from jsonb_array_elements(p_epoch->'members') loop
    if not exists(select 1 from public.cp_secure_accounts a where a.user_id=(member->'roster'->'identity'->>'userId')::uuid and a.roster=member->'roster') then raise exception 'Outdated member roster'; end if;
  end loop;
  if not exists(select 1 from public.cp_secure_devices d where d.user_id=p_actor and d.device_id=(p_epoch->>'authorDeviceId')::uuid and d.revoked_revision is null) then raise exception 'Inactive key author'; end if;
  if (select count(*) from public.cp_secure_epochs where author_user_id=p_actor and created_at>now()-interval '1 minute')>=20 then raise exception 'Epoch rate limit'; end if;
  insert into public.cp_secure_epochs(id,room_id,epoch,epoch_hash,previous_hash,author_user_id,author_device_id,payload,client_created_at)
    values((p_epoch->>'id')::uuid,p_room,(p_epoch->>'epoch')::integer,p_hash,nullif(p_epoch->>'previous','')::text,p_actor,(p_epoch->>'authorDeviceId')::uuid,p_epoch,(p_epoch->>'createdAt')::timestamptz);
  return true;
end $$;
revoke all on function public.cp_secure_put_epoch(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.cp_secure_put_epoch(uuid,uuid,jsonb,text) to service_role;

create function public.cp_secure_prepare_blob(p_id uuid,p_actor uuid,p_device uuid,p_room uuid,p_epoch uuid,p_size integer)
returns text language plpgsql security invoker set search_path='' as $$
declare object_path text;
begin
  perform pg_advisory_xact_lock(hashtextextended('secure-blob:'||p_actor::text,0));
  if p_size not between 41 and 4194344 then raise exception 'Invalid blob size'; end if;
  if not exists(select 1 from public.chat_rooms r where r.id=p_room and coalesce(r.room_type,'direct')<>'group' and r.status='active' and p_actor in(r.buyer_id,r.seller_id)) then raise exception 'Private room unavailable'; end if;
  if not exists(select 1 from public.cp_secure_devices d where d.user_id=p_actor and d.device_id=p_device and d.revoked_revision is null) then raise exception 'Inactive device'; end if;
  if not exists(select 1 from public.cp_secure_epochs e where e.id=p_epoch and e.room_id=p_room and e.epoch=(select max(last.epoch) from public.cp_secure_epochs last where last.room_id=p_room)) then raise exception 'Use the current conversation key'; end if;
  if (select count(*) from public.cp_secure_blobs where owner_id=p_actor and created_at>now()-interval '1 hour')>=30 then raise exception 'Attachment rate limit'; end if;
  if (select coalesce(sum(size_bytes),0) from public.cp_secure_blobs where owner_id=p_actor)+p_size>268435456 then raise exception 'Encrypted attachment quota'; end if;
  object_path='secure-history/v2/'||p_actor::text||'/'||p_id::text;
  insert into public.cp_secure_blobs(id,room_id,epoch_id,owner_id,owner_device_id,object_key,size_bytes,prepare_expires_at)
    values(p_id,p_room,p_epoch,p_actor,p_device,object_path,p_size,now()+interval '1 hour');
  return object_path;
end $$;
revoke all on function public.cp_secure_prepare_blob(uuid,uuid,uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.cp_secure_prepare_blob(uuid,uuid,uuid,uuid,uuid,integer) to service_role;

create function public.cp_secure_put_event(p_actor uuid,p_device uuid,p_event jsonb,p_hash text,p_blob uuid default null)
returns bigint language plpgsql security invoker set search_path='' as $$
declare old public.cp_secure_events; current_epoch public.cp_secure_epochs; result bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended('secure-event:'||(p_event->>'id'),0));
  select * into old from public.cp_secure_events where id=(p_event->>'id')::uuid;
  if found then
    if old.sender_id<>p_actor or old.device_id<>p_device or old.event_hash<>p_hash or old.payload<>p_event or old.blob_id is distinct from p_blob then raise exception 'Event ID collision'; end if;
    return old.sequence;
  end if;
  select * into current_epoch from public.cp_secure_epochs where room_id=(p_event->>'roomId')::uuid order by epoch desc limit 1;
  if not found or current_epoch.id<>(p_event->>'epochId')::uuid or current_epoch.epoch_hash<>p_event->>'epochHash' then raise exception 'Use the current conversation key'; end if;
  if p_event->>'v' is distinct from '2' or p_event->>'senderId' is distinct from p_actor::text or p_event->>'deviceId' is distinct from p_device::text
    or p_event->>'blobId' is distinct from coalesce(to_jsonb(p_blob),'null'::jsonb)#>>'{}'
    or p_hash !~ '^[0-9a-f]{64}$' or octet_length(p_event::text)>75000 then raise exception 'Invalid history event'; end if;
  if not exists(select 1 from public.chat_rooms r where r.id=current_epoch.room_id and coalesce(r.room_type,'direct')<>'group' and r.status='active' and p_actor in(r.buyer_id,r.seller_id)) then raise exception 'Private room unavailable'; end if;
  if not exists(select 1 from public.cp_secure_devices d where d.user_id=p_actor and d.device_id=p_device and d.revoked_revision is null) then raise exception 'Inactive device'; end if;
  if exists(select 1 from jsonb_array_elements(current_epoch.payload->'members') m
    where not exists(select 1 from public.cp_secure_accounts a where a.user_id=(m->'roster'->'identity'->>'userId')::uuid and a.roster=m->'roster')) then raise exception 'Rotate after device changes'; end if;
  if not exists(select 1 from jsonb_array_elements(current_epoch.payload->'members') m cross join jsonb_array_elements(m->'roster'->'devices') d
    where m->'roster'->'identity'->>'userId'=p_actor::text and d->>'id'=p_device::text) then raise exception 'Device absent from epoch'; end if;
  if (select count(*) from public.cp_secure_events where sender_id=p_actor and created_at>now()-interval '1 minute')>=120 then raise exception 'Message rate limit'; end if;
  if p_blob is not null and not exists(select 1 from public.cp_secure_blobs b where b.id=p_blob and b.owner_id=p_actor and b.owner_device_id=p_device and b.room_id=current_epoch.room_id and b.epoch_id=current_epoch.id and b.attached_event_id is null and b.prepare_expires_at>now()) then raise exception 'Attachment unavailable'; end if;
  insert into public.cp_secure_usage(user_id,event_count,event_bytes) values(p_actor,1,octet_length(p_event::text))
    on conflict(user_id) do update set event_count=public.cp_secure_usage.event_count+1,event_bytes=public.cp_secure_usage.event_bytes+excluded.event_bytes,updated_at=now()
    where public.cp_secure_usage.event_count<200000 and public.cp_secure_usage.event_bytes+excluded.event_bytes<=268435456;
  if not found then raise exception 'Encrypted history quota'; end if;
  insert into public.cp_secure_events(id,room_id,epoch_id,epoch_hash,sender_id,device_id,event_hash,payload,blob_id,client_created_at)
    values((p_event->>'id')::uuid,current_epoch.room_id,current_epoch.id,current_epoch.epoch_hash,p_actor,p_device,p_hash,p_event,p_blob,(p_event->>'createdAt')::timestamptz)
    returning sequence into result;
  insert into public.cp_secure_event_users(user_id,sequence,event_id,room_id)
    select participant,result,(p_event->>'id')::uuid,current_epoch.room_id
    from (select r.buyer_id participant from public.chat_rooms r where r.id=current_epoch.room_id
          union all select r.seller_id from public.chat_rooms r where r.id=current_epoch.room_id) members;
  if p_blob is not null then update public.cp_secure_blobs set attached_event_id=(p_event->>'id')::uuid,prepare_expires_at=null where id=p_blob; end if;
  return result;
end $$;
revoke all on function public.cp_secure_put_event(uuid,uuid,jsonb,text,uuid) from public,anon,authenticated;
grant execute on function public.cp_secure_put_event(uuid,uuid,jsonb,text,uuid) to service_role;

create function public.cp_secure_claim_notification(p_actor uuid,p_event uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare event_room uuid; target uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('secure-notification:'||p_actor::text,0));
  if (select count(*) from public.cp_secure_events where sender_id=p_actor and notification_sent_at>now()-interval '1 minute')>=20 then return null; end if;
  update public.cp_secure_events set notification_sent_at=now()
    where id=p_event and sender_id=p_actor and notification_sent_at is null returning room_id into event_room;
  if not found then return null; end if;
  select case when buyer_id=p_actor then seller_id else buyer_id end into target
    from public.chat_rooms where id=event_room and coalesce(room_type,'direct')<>'group' and p_actor in(buyer_id,seller_id);
  return target;
end $$;
revoke all on function public.cp_secure_claim_notification(uuid,uuid) from public,anon,authenticated;
grant execute on function public.cp_secure_claim_notification(uuid,uuid) to service_role;

create function public.cp_secure_pull_events(p_user uuid,p_after bigint,p_limit integer default 50)
returns table(sequence bigint,event jsonb,blob_id uuid,server_created_at timestamptz)
language sql stable security invoker set search_path='' as $$
  select e.sequence,e.payload,e.blob_id,e.created_at
  from public.cp_secure_event_users u join public.cp_secure_events e on e.sequence=u.sequence
  where u.user_id=p_user and u.sequence>greatest(p_after,0)
  order by u.sequence limit least(greatest(p_limit,1),100)
$$;
revoke all on function public.cp_secure_pull_events(uuid,bigint,integer) from public,anon,authenticated;
grant execute on function public.cp_secure_pull_events(uuid,bigint,integer) to service_role;

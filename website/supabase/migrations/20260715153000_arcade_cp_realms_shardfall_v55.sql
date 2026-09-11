-- ComePlayers Arcade V55: CP Realms Shardfall lobby metadata and realtime realm membership.
-- Moment-to-moment movement and combat use Supabase Realtime Broadcast. PostgreSQL stores only shard/membership metadata.

begin;

create table if not exists public.arcade_realms_shards (
  id uuid primary key default gen_random_uuid(),
  shard_name text not null,
  shard_kind text not null default 'public',
  host_player_id uuid not null references auth.users(id) on delete cascade,
  host_player_name text not null default 'ComePlayers Player',
  max_players integer not null default 24,
  player_count integer not null default 1,
  status text not null default 'waiting',
  region text not null default 'Asia Pacific',
  world_seed bigint not null default floor(random() * 2147483647)::bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint arcade_realms_shard_name_v55 check (char_length(shard_name) between 3 and 48),
  constraint arcade_realms_kind_v55 check (shard_kind in ('public', 'matchmaking')),
  constraint arcade_realms_players_v55 check (max_players between 4 and 40 and player_count between 0 and 40),
  constraint arcade_realms_status_v55 check (status in ('waiting', 'active', 'closed'))
);

create table if not exists public.arcade_realms_members (
  shard_id uuid not null references public.arcade_realms_shards(id) on delete cascade,
  player_id uuid not null references auth.users(id) on delete cascade,
  player_name text not null default 'ComePlayers Player',
  faction text not null default 'gold',
  hero_class text not null default 'ranger',
  is_host boolean not null default false,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (shard_id, player_id),
  constraint arcade_realms_faction_v55 check (faction in ('gold', 'cyan')),
  constraint arcade_realms_class_v55 check (hero_class in ('vanguard', 'ranger', 'arcanist', 'oracle'))
);

create index if not exists arcade_realms_shards_lobby_v55_idx
  on public.arcade_realms_shards (status, player_count desc, updated_at desc);

create index if not exists arcade_realms_members_heartbeat_v55_idx
  on public.arcade_realms_members (shard_id, last_seen_at desc);

alter table public.arcade_realms_shards enable row level security;
alter table public.arcade_realms_members enable row level security;

drop policy if exists "Realms shards visible to authenticated users" on public.arcade_realms_shards;
create policy "Realms shards visible to authenticated users"
on public.arcade_realms_shards
for select
to authenticated
using (
  (
    status in ('waiting', 'active')
    and updated_at > now() - interval '3 minutes'
  )
  or host_player_id = auth.uid()
);

grant select on table public.arcade_realms_shards to authenticated;
revoke select on table public.arcade_realms_members from anon, authenticated;
revoke insert, update, delete on table public.arcade_realms_shards from anon, authenticated;
revoke insert, update, delete on table public.arcade_realms_members from anon, authenticated;

create or replace function public.arcade_realms_safe_name(p_value text, p_fallback text default 'ComePlayers Player')
returns text
language sql
immutable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    nullif(
      left(
        regexp_replace(trim(coalesce(p_value, '')), '[^a-zA-Z0-9 _.-]+', '', 'g'),
        24
      ),
      ''
    ),
    p_fallback
  );
$$;

create or replace function public.arcade_realms_validate_faction(p_faction text)
returns text
language sql
immutable
security definer
set search_path = public, pg_temp
as $$
  select case when p_faction in ('gold', 'cyan') then p_faction else 'gold' end;
$$;

create or replace function public.arcade_realms_validate_class(p_class text)
returns text
language sql
immutable
security definer
set search_path = public, pg_temp
as $$
  select case
    when p_class in ('vanguard', 'ranger', 'arcanist', 'oracle') then p_class
    else 'ranger'
  end;
$$;

create or replace function public.arcade_realms_cleanup_shards()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.arcade_realms_members
  where last_seen_at <= now() - interval '55 seconds';

  update public.arcade_realms_shards shard
  set
    player_count = counts.total,
    status = case
      when counts.total = 0 then 'closed'
      when counts.total >= 2 then 'active'
      else 'waiting'
    end,
    updated_at = case when counts.total = 0 then now() else shard.updated_at end
  from (
    select s.id, count(m.player_id)::integer as total
    from public.arcade_realms_shards s
    left join public.arcade_realms_members m on m.shard_id = s.id
    where s.status in ('waiting', 'active')
    group by s.id
  ) counts
  where shard.id = counts.id;

  update public.arcade_realms_shards shard
  set
    host_player_id = (
      select m.player_id
      from public.arcade_realms_members m
      where m.shard_id = shard.id
      order by m.joined_at asc
      limit 1
    ),
    host_player_name = (
      select m.player_name
      from public.arcade_realms_members m
      where m.shard_id = shard.id
      order by m.joined_at asc
      limit 1
    ),
    updated_at = now()
  where shard.status in ('waiting', 'active')
    and shard.player_count > 0
    and not exists (
      select 1
      from public.arcade_realms_members host_member
      where host_member.shard_id = shard.id
        and host_member.player_id = shard.host_player_id
    );

  update public.arcade_realms_members member
  set is_host = (member.player_id = shard.host_player_id)
  from public.arcade_realms_shards shard
  where shard.id = member.shard_id;

  update public.arcade_realms_shards
  set status = 'closed', updated_at = now()
  where status in ('waiting', 'active')
    and updated_at <= now() - interval '5 minutes';
end;
$$;

create or replace function public.arcade_realms_leave_existing(p_uid uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_shard_id uuid;
  v_total integer;
begin
  for v_shard_id in
    select shard_id
    from public.arcade_realms_members
    where player_id = p_uid
  loop
    delete from public.arcade_realms_members
    where shard_id = v_shard_id and player_id = p_uid;

    select count(*)::integer into v_total
    from public.arcade_realms_members
    where shard_id = v_shard_id;

    update public.arcade_realms_shards
    set
      player_count = v_total,
      status = case when v_total = 0 then 'closed' when v_total >= 2 then 'active' else 'waiting' end,
      updated_at = now()
    where id = v_shard_id;
  end loop;

  perform public.arcade_realms_cleanup_shards();
end;
$$;

create or replace function public.arcade_realms_create_shard(
  p_shard_name text,
  p_player_name text,
  p_max_players integer default 24,
  p_region text default 'Asia Pacific',
  p_faction text default 'gold',
  p_class text default 'ranger'
)
returns setof public.arcade_realms_shards
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_shard_name text := regexp_replace(trim(coalesce(p_shard_name, '')), '\s+', ' ', 'g');
  v_player_name text := public.arcade_realms_safe_name(p_player_name);
  v_region text := left(coalesce(nullif(trim(p_region), ''), 'Asia Pacific'), 32);
  v_shard public.arcade_realms_shards;
begin
  if v_uid is null then
    raise exception 'You must be signed in to create an online realm.';
  end if;

  if char_length(v_shard_name) < 3 or char_length(v_shard_name) > 48 then
    raise exception 'Realm name must contain 3 to 48 characters.';
  end if;

  if p_max_players not in (12, 16, 24, 32, 40) then
    p_max_players := 24;
  end if;

  perform public.arcade_realms_cleanup_shards();
  perform public.arcade_realms_leave_existing(v_uid);

  insert into public.arcade_realms_shards (
    shard_name,
    shard_kind,
    host_player_id,
    host_player_name,
    max_players,
    player_count,
    status,
    region,
    updated_at
  ) values (
    v_shard_name,
    'public',
    v_uid,
    v_player_name,
    p_max_players,
    1,
    'waiting',
    v_region,
    now()
  ) returning * into v_shard;

  insert into public.arcade_realms_members (
    shard_id,
    player_id,
    player_name,
    faction,
    hero_class,
    is_host,
    last_seen_at
  ) values (
    v_shard.id,
    v_uid,
    v_player_name,
    public.arcade_realms_validate_faction(p_faction),
    public.arcade_realms_validate_class(p_class),
    true,
    now()
  );

  return query select * from public.arcade_realms_shards where id = v_shard.id;
end;
$$;

create or replace function public.arcade_realms_join_shard(
  p_shard_id uuid,
  p_player_name text,
  p_faction text default 'gold',
  p_class text default 'ranger'
)
returns setof public.arcade_realms_shards
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_player_name text := public.arcade_realms_safe_name(p_player_name);
  v_shard public.arcade_realms_shards;
  v_total integer;
begin
  if v_uid is null then
    raise exception 'You must be signed in to join an online realm.';
  end if;

  perform public.arcade_realms_cleanup_shards();

  select * into v_shard
  from public.arcade_realms_shards
  where id = p_shard_id
  for update;

  if not found or v_shard.status = 'closed' then
    raise exception 'This realm is no longer available.';
  end if;

  if exists (
    select 1 from public.arcade_realms_members
    where shard_id = v_shard.id and player_id = v_uid
  ) then
    update public.arcade_realms_members
    set
      last_seen_at = now(),
      player_name = v_player_name,
      faction = public.arcade_realms_validate_faction(p_faction),
      hero_class = public.arcade_realms_validate_class(p_class)
    where shard_id = v_shard.id and player_id = v_uid;

    return query select * from public.arcade_realms_shards where id = v_shard.id;
    return;
  end if;

  select count(*)::integer into v_total
  from public.arcade_realms_members
  where shard_id = v_shard.id;

  if v_total >= v_shard.max_players then
    raise exception 'This realm is full.';
  end if;

  perform public.arcade_realms_leave_existing(v_uid);

  insert into public.arcade_realms_members (
    shard_id,
    player_id,
    player_name,
    faction,
    hero_class,
    is_host,
    last_seen_at
  ) values (
    v_shard.id,
    v_uid,
    v_player_name,
    public.arcade_realms_validate_faction(p_faction),
    public.arcade_realms_validate_class(p_class),
    false,
    now()
  );

  select count(*)::integer into v_total
  from public.arcade_realms_members
  where shard_id = v_shard.id;

  update public.arcade_realms_shards
  set
    player_count = v_total,
    status = case when v_total >= 2 then 'active' else 'waiting' end,
    updated_at = now()
  where id = v_shard.id;

  return query select * from public.arcade_realms_shards where id = v_shard.id;
end;
$$;

create or replace function public.arcade_realms_matchmake(
  p_player_name text,
  p_faction text default 'gold',
  p_class text default 'ranger'
)
returns setof public.arcade_realms_shards
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_shard public.arcade_realms_shards;
  v_name text := public.arcade_realms_safe_name(p_player_name);
begin
  if v_uid is null then
    raise exception 'You must be signed in to use global matchmaking.';
  end if;

  perform public.arcade_realms_cleanup_shards();

  select * into v_shard
  from public.arcade_realms_shards
  where status in ('waiting', 'active')
    and player_count < max_players
    and updated_at > now() - interval '2 minutes'
  order by
    case when shard_kind = 'matchmaking' then 0 else 1 end,
    player_count desc,
    updated_at desc
  limit 1;

  if v_shard.id is null then
    return query
    select * from public.arcade_realms_create_shard(
      'Global Shard ' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4)),
      v_name,
      24,
      'Global',
      p_faction,
      p_class
    );
    return;
  end if;

  return query
  select * from public.arcade_realms_join_shard(
    v_shard.id,
    v_name,
    p_faction,
    p_class
  );
end;
$$;

create or replace function public.arcade_realms_list_shards()
returns setof public.arcade_realms_shards
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to browse online realms.';
  end if;

  perform public.arcade_realms_cleanup_shards();

  return query
  select *
  from public.arcade_realms_shards
  where status in ('waiting', 'active')
    and player_count < max_players
    and updated_at > now() - interval '3 minutes'
  order by player_count desc, updated_at desc
  limit 30;
end;
$$;

create or replace function public.arcade_realms_touch_shard(p_shard_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then return false; end if;

  update public.arcade_realms_members
  set last_seen_at = now()
  where shard_id = p_shard_id and player_id = v_uid;

  if not found then return false; end if;

  update public.arcade_realms_shards
  set updated_at = now()
  where id = p_shard_id and status in ('waiting', 'active');

  return true;
end;
$$;

create or replace function public.arcade_realms_leave_shard(p_shard_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_total integer;
begin
  if v_uid is null then return false; end if;

  delete from public.arcade_realms_members
  where shard_id = p_shard_id and player_id = v_uid;

  select count(*)::integer into v_total
  from public.arcade_realms_members
  where shard_id = p_shard_id;

  update public.arcade_realms_shards
  set
    player_count = v_total,
    status = case when v_total = 0 then 'closed' when v_total >= 2 then 'active' else 'waiting' end,
    updated_at = now()
  where id = p_shard_id;

  perform public.arcade_realms_cleanup_shards();
  return true;
end;
$$;

revoke all on function public.arcade_realms_safe_name(text, text) from public;
revoke all on function public.arcade_realms_validate_faction(text) from public;
revoke all on function public.arcade_realms_validate_class(text) from public;
revoke all on function public.arcade_realms_cleanup_shards() from public;
revoke all on function public.arcade_realms_leave_existing(uuid) from public;

revoke all on function public.arcade_realms_create_shard(text, text, integer, text, text, text) from public;
revoke all on function public.arcade_realms_join_shard(uuid, text, text, text) from public;
revoke all on function public.arcade_realms_matchmake(text, text, text) from public;
revoke all on function public.arcade_realms_list_shards() from public;
revoke all on function public.arcade_realms_touch_shard(uuid) from public;
revoke all on function public.arcade_realms_leave_shard(uuid) from public;

grant execute on function public.arcade_realms_create_shard(text, text, integer, text, text, text) to authenticated;
grant execute on function public.arcade_realms_join_shard(uuid, text, text, text) to authenticated;
grant execute on function public.arcade_realms_matchmake(text, text, text) to authenticated;
grant execute on function public.arcade_realms_list_shards() to authenticated;
grant execute on function public.arcade_realms_touch_shard(uuid) to authenticated;
grant execute on function public.arcade_realms_leave_shard(uuid) to authenticated;

commit;

select 'arcade_cp_realms_shardfall_v55_ready' as status;

-- ComePlayers Arcade V56: CP Strike Neon Frontline rooms + global matchmaking.
-- Player movement and combat snapshots use Supabase Realtime Broadcast.
-- PostgreSQL stores lobby and membership metadata only.

begin;

create table if not exists public.arcade_strike_rooms (
  id uuid primary key default gen_random_uuid(),
  room_name text not null,
  room_kind text not null default 'public',
  host_player_id uuid not null references auth.users(id) on delete cascade,
  host_player_name text not null default 'ComePlayers Operative',
  max_players integer not null default 8,
  player_count integer not null default 1,
  status text not null default 'waiting',
  map_key text not null default 'neon-bastion',
  game_mode text not null default 'team-deathmatch',
  region text not null default 'Global',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint arcade_strike_room_name_v56 check (char_length(room_name) between 3 and 40),
  constraint arcade_strike_room_kind_v56 check (room_kind in ('public', 'matchmaking')),
  constraint arcade_strike_max_players_v56 check (max_players in (4, 6, 8, 10)),
  constraint arcade_strike_player_count_v56 check (player_count between 0 and 10),
  constraint arcade_strike_status_v56 check (status in ('waiting', 'active', 'closed')),
  constraint arcade_strike_map_v56 check (map_key in ('neon-bastion')),
  constraint arcade_strike_mode_v56 check (game_mode in ('team-deathmatch'))
);

create table if not exists public.arcade_strike_room_members (
  room_id uuid not null references public.arcade_strike_rooms(id) on delete cascade,
  player_id uuid not null references auth.users(id) on delete cascade,
  player_name text not null default 'ComePlayers Operative',
  team text not null default 'gold',
  loadout text not null default 'rifle',
  is_host boolean not null default false,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (room_id, player_id),
  constraint arcade_strike_team_v56 check (team in ('gold', 'cyan')),
  constraint arcade_strike_loadout_v56 check (loadout in ('rifle', 'smg', 'sniper', 'pistol'))
);

create index if not exists arcade_strike_rooms_lobby_v56_idx
  on public.arcade_strike_rooms (status, player_count desc, updated_at desc);

create index if not exists arcade_strike_members_heartbeat_v56_idx
  on public.arcade_strike_room_members (room_id, last_seen_at desc);

alter table public.arcade_strike_rooms enable row level security;
alter table public.arcade_strike_room_members enable row level security;

drop policy if exists "Strike rooms visible to authenticated users" on public.arcade_strike_rooms;
create policy "Strike rooms visible to authenticated users"
on public.arcade_strike_rooms
for select
to authenticated
using (
  (
    status in ('waiting', 'active')
    and updated_at > now() - interval '2 minutes'
  )
  or host_player_id = auth.uid()
);

grant select on table public.arcade_strike_rooms to authenticated;
revoke select on table public.arcade_strike_room_members from anon, authenticated;
revoke insert, update, delete on table public.arcade_strike_rooms from anon, authenticated;
revoke insert, update, delete on table public.arcade_strike_room_members from anon, authenticated;

create or replace function public.arcade_strike_display_name(p_uid uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (
      select coalesce(
        nullif(trim(p.username), ''),
        nullif(trim(p.full_name), ''),
        'ComePlayers Operative'
      )
      from public.profiles p
      where p.id = p_uid
      limit 1
    ),
    'ComePlayers Operative'
  );
$$;

create or replace function public.arcade_strike_validate_team(p_team text)
returns text
language sql
immutable
security definer
set search_path = public, pg_temp
as $$
  select case when p_team in ('gold', 'cyan') then p_team else 'gold' end;
$$;

create or replace function public.arcade_strike_validate_loadout(p_loadout text)
returns text
language sql
immutable
security definer
set search_path = public, pg_temp
as $$
  select case
    when p_loadout in ('rifle', 'smg', 'sniper', 'pistol') then p_loadout
    else 'rifle'
  end;
$$;

create or replace function public.arcade_strike_cleanup_rooms()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.arcade_strike_room_members
  where last_seen_at <= now() - interval '45 seconds';

  update public.arcade_strike_rooms room
  set
    player_count = counts.total,
    status = case
      when counts.total = 0 then 'closed'
      when room.status = 'waiting' and counts.total >= 2 then 'active'
      else room.status
    end,
    updated_at = case when counts.total = 0 then now() else room.updated_at end
  from (
    select r.id, count(m.player_id)::integer as total
    from public.arcade_strike_rooms r
    left join public.arcade_strike_room_members m on m.room_id = r.id
    where r.status in ('waiting', 'active')
    group by r.id
  ) counts
  where room.id = counts.id;

  update public.arcade_strike_rooms room
  set
    host_player_id = (
      select m.player_id
      from public.arcade_strike_room_members m
      where m.room_id = room.id
      order by m.joined_at asc
      limit 1
    ),
    host_player_name = (
      select m.player_name
      from public.arcade_strike_room_members m
      where m.room_id = room.id
      order by m.joined_at asc
      limit 1
    ),
    updated_at = now()
  where room.status in ('waiting', 'active')
    and room.player_count > 0
    and not exists (
      select 1
      from public.arcade_strike_room_members host_member
      where host_member.room_id = room.id
        and host_member.player_id = room.host_player_id
    );

  update public.arcade_strike_room_members member
  set is_host = (member.player_id = room.host_player_id)
  from public.arcade_strike_rooms room
  where room.id = member.room_id;

  update public.arcade_strike_rooms
  set status = 'closed', updated_at = now()
  where status in ('waiting', 'active')
    and updated_at <= now() - interval '3 minutes';
end;
$$;

create or replace function public.arcade_strike_leave_existing_rooms(p_uid uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room_id uuid;
begin
  for v_room_id in
    select room_id
    from public.arcade_strike_room_members
    where player_id = p_uid
  loop
    delete from public.arcade_strike_room_members
    where room_id = v_room_id and player_id = p_uid;

    update public.arcade_strike_rooms room
    set
      player_count = counts.total,
      status = case when counts.total = 0 then 'closed' else room.status end,
      updated_at = now()
    from (
      select count(*)::integer as total
      from public.arcade_strike_room_members
      where room_id = v_room_id
    ) counts
    where room.id = v_room_id;
  end loop;

  perform public.arcade_strike_cleanup_rooms();
end;
$$;

create or replace function public.arcade_strike_create_room(
  p_room_name text,
  p_max_players integer,
  p_team text,
  p_loadout text
)
returns setof public.arcade_strike_rooms
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := regexp_replace(trim(coalesce(p_room_name, '')), '\s+', ' ', 'g');
  v_player_name text;
  v_room public.arcade_strike_rooms;
begin
  if v_uid is null then
    raise exception 'You must be signed in to create a CP Strike room.';
  end if;

  if char_length(v_name) < 3 or char_length(v_name) > 40 then
    raise exception 'Room name must contain 3 to 40 characters.';
  end if;

  if p_max_players not in (4, 6, 8, 10) then
    raise exception 'Maximum players must be 4, 6, 8, or 10.';
  end if;

  perform public.arcade_strike_cleanup_rooms();
  perform public.arcade_strike_leave_existing_rooms(v_uid);
  v_player_name := public.arcade_strike_display_name(v_uid);

  insert into public.arcade_strike_rooms (
    room_name,
    room_kind,
    host_player_id,
    host_player_name,
    max_players,
    player_count,
    status,
    map_key,
    game_mode,
    region,
    updated_at
  ) values (
    v_name,
    'public',
    v_uid,
    v_player_name,
    p_max_players,
    1,
    'waiting',
    'neon-bastion',
    'team-deathmatch',
    'Global',
    now()
  )
  returning * into v_room;

  insert into public.arcade_strike_room_members (
    room_id,
    player_id,
    player_name,
    team,
    loadout,
    is_host,
    last_seen_at
  ) values (
    v_room.id,
    v_uid,
    v_player_name,
    public.arcade_strike_validate_team(p_team),
    public.arcade_strike_validate_loadout(p_loadout),
    true,
    now()
  );

  return query select * from public.arcade_strike_rooms where id = v_room.id;
end;
$$;

create or replace function public.arcade_strike_join_room(
  p_room_id uuid,
  p_team text,
  p_loadout text
)
returns setof public.arcade_strike_rooms
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
  v_room public.arcade_strike_rooms;
begin
  if v_uid is null then
    raise exception 'You must be signed in to join CP Strike.';
  end if;

  perform public.arcade_strike_cleanup_rooms();

  select * into v_room
  from public.arcade_strike_rooms
  where id = p_room_id
  for update;

  if v_room.id is null or v_room.status = 'closed' then
    raise exception 'This room is no longer available.';
  end if;

  if v_room.player_count >= v_room.max_players then
    raise exception 'This room is full.';
  end if;

  perform public.arcade_strike_leave_existing_rooms(v_uid);
  v_name := public.arcade_strike_display_name(v_uid);

  insert into public.arcade_strike_room_members (
    room_id,
    player_id,
    player_name,
    team,
    loadout,
    is_host,
    last_seen_at
  ) values (
    v_room.id,
    v_uid,
    v_name,
    public.arcade_strike_validate_team(p_team),
    public.arcade_strike_validate_loadout(p_loadout),
    false,
    now()
  )
  on conflict (room_id, player_id) do update
  set
    player_name = excluded.player_name,
    team = excluded.team,
    loadout = excluded.loadout,
    last_seen_at = now();

  update public.arcade_strike_rooms
  set
    player_count = (
      select count(*)::integer
      from public.arcade_strike_room_members
      where room_id = v_room.id
    ),
    status = 'active',
    updated_at = now()
  where id = v_room.id
  returning * into v_room;

  return next v_room;
end;
$$;

create or replace function public.arcade_strike_matchmake(
  p_team text,
  p_loadout text
)
returns setof public.arcade_strike_rooms
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.arcade_strike_rooms;
  v_name text;
begin
  if v_uid is null then
    raise exception 'You must be signed in to use Global Matchmaking.';
  end if;

  perform public.arcade_strike_cleanup_rooms();

  select * into v_room
  from public.arcade_strike_rooms room
  where room.status in ('waiting', 'active')
    and room.player_count < room.max_players
    and room.updated_at > now() - interval '2 minutes'
  order by
    case when room.room_kind = 'matchmaking' then 0 else 1 end,
    room.player_count desc,
    room.updated_at desc
  limit 1
  for update skip locked;

  if v_room.id is null then
    perform public.arcade_strike_leave_existing_rooms(v_uid);
    v_name := public.arcade_strike_display_name(v_uid);

    insert into public.arcade_strike_rooms (
      room_name,
      room_kind,
      host_player_id,
      host_player_name,
      max_players,
      player_count,
      status,
      map_key,
      game_mode,
      region,
      updated_at
    ) values (
      'Global Quick Match',
      'matchmaking',
      v_uid,
      v_name,
      8,
      1,
      'waiting',
      'neon-bastion',
      'team-deathmatch',
      'Global',
      now()
    ) returning * into v_room;

    insert into public.arcade_strike_room_members (
      room_id,
      player_id,
      player_name,
      team,
      loadout,
      is_host,
      last_seen_at
    ) values (
      v_room.id,
      v_uid,
      v_name,
      public.arcade_strike_validate_team(p_team),
      public.arcade_strike_validate_loadout(p_loadout),
      true,
      now()
    );

    return next v_room;
    return;
  end if;

  return query
  select *
  from public.arcade_strike_join_room(v_room.id, p_team, p_loadout);
end;
$$;

create or replace function public.arcade_strike_touch_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then return; end if;

  update public.arcade_strike_room_members
  set last_seen_at = now()
  where room_id = p_room_id
    and player_id = v_uid;

  update public.arcade_strike_rooms
  set updated_at = now()
  where id = p_room_id
    and exists (
      select 1
      from public.arcade_strike_room_members
      where room_id = p_room_id
        and player_id = v_uid
    );
end;
$$;

create or replace function public.arcade_strike_leave_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then return; end if;

  delete from public.arcade_strike_room_members
  where room_id = p_room_id
    and player_id = v_uid;

  update public.arcade_strike_rooms room
  set
    player_count = counts.total,
    status = case when counts.total = 0 then 'closed' else room.status end,
    updated_at = now()
  from (
    select count(*)::integer as total
    from public.arcade_strike_room_members
    where room_id = p_room_id
  ) counts
  where room.id = p_room_id;

  perform public.arcade_strike_cleanup_rooms();
end;
$$;

grant execute on function public.arcade_strike_cleanup_rooms() to authenticated;
grant execute on function public.arcade_strike_create_room(text, integer, text, text) to authenticated;
grant execute on function public.arcade_strike_join_room(uuid, text, text) to authenticated;
grant execute on function public.arcade_strike_matchmake(text, text) to authenticated;
grant execute on function public.arcade_strike_touch_room(uuid) to authenticated;
grant execute on function public.arcade_strike_leave_room(uuid) to authenticated;

-- Safely add lobby metadata to Supabase Realtime.
do $$
begin
  alter publication supabase_realtime add table public.arcade_strike_rooms;
exception
  when duplicate_object then null;
end;
$$;

commit;

select 'arcade_cp_strike_neon_frontline_v56_ready' as status;

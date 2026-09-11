-- ComePlayers Arcade V43: CP Monopoly public rooms, 2-4 player lobby, global matchmaking, and realtime game state.
-- Safe to run more than once. This migration does not depend on pgcrypto helper functions.

begin;

create table if not exists public.arcade_monopoly_rooms (
  id uuid primary key default (md5(random()::text || clock_timestamp()::text)::uuid),
  room_name text not null default 'CP Monopoly Room',
  room_kind text not null default 'public',
  host_player_id uuid not null references auth.users(id) on delete cascade,
  player_ids uuid[] not null default '{}'::uuid[],
  player_names text[] not null default '{}'::text[],
  max_players integer not null default 4,
  game_state jsonb not null default '{}'::jsonb,
  status text not null default 'waiting',
  version integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint arcade_monopoly_room_name_length check (char_length(room_name) between 3 and 48),
  constraint arcade_monopoly_room_kind_check check (room_kind in ('public', 'matchmaking')),
  constraint arcade_monopoly_max_players_check check (max_players between 2 and 4),
  constraint arcade_monopoly_status_check check (status in ('waiting', 'active', 'finished', 'abandoned')),
  constraint arcade_monopoly_players_capacity check (cardinality(player_ids) <= max_players),
  constraint arcade_monopoly_player_arrays_match check (cardinality(player_ids) = cardinality(player_names))
);

create index if not exists arcade_monopoly_lobby_v43_idx
  on public.arcade_monopoly_rooms (room_kind, status, updated_at desc);

create index if not exists arcade_monopoly_players_v43_idx
  on public.arcade_monopoly_rooms using gin (player_ids);

alter table public.arcade_monopoly_rooms enable row level security;

drop policy if exists "Authenticated users can browse CP Monopoly rooms" on public.arcade_monopoly_rooms;
create policy "Authenticated users can browse CP Monopoly rooms"
  on public.arcade_monopoly_rooms
  for select
  to authenticated
  using (
    (
      status = 'waiting'
      and updated_at > now() - interval '150 seconds'
    )
    or auth.uid() = any(player_ids)
  );

grant select on table public.arcade_monopoly_rooms to authenticated;
revoke insert, update, delete on table public.arcade_monopoly_rooms from anon, authenticated;

create or replace function public.arcade_monopoly_display_name(p_uid uuid)
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
        'ComePlayers Player'
      )
      from public.profiles p
      where p.id = p_uid
      limit 1
    ),
    'ComePlayers Player'
  );
$$;

create or replace function public.arcade_monopoly_prepare_host_state(
  p_game_state jsonb,
  p_uid uuid,
  p_player_name text
)
returns jsonb
language plpgsql
immutable
security definer
set search_path = public, pg_temp
as $$
declare
  v_state jsonb := coalesce(p_game_state, '{}'::jsonb);
begin
  if jsonb_typeof(v_state) <> 'object'
     or jsonb_typeof(v_state -> 'players') <> 'array'
     or jsonb_array_length(v_state -> 'players') <> 1 then
    raise exception 'Invalid initial CP Monopoly game state.';
  end if;

  v_state := jsonb_set(v_state, '{players,0,id}', to_jsonb(p_uid::text), true);
  v_state := jsonb_set(v_state, '{players,0,name}', to_jsonb(left(coalesce(p_player_name, 'ComePlayers Player'), 48)), true);
  v_state := jsonb_set(v_state, '{players,0,npc}', 'false'::jsonb, true);
  v_state := jsonb_set(v_state, '{players,0,token}', '"bolt"'::jsonb, true);
  v_state := jsonb_set(v_state, '{players,0,color}', '"#facc15"'::jsonb, true);
  v_state := jsonb_set(v_state, '{status}', '"lobby"'::jsonb, true);
  v_state := jsonb_set(v_state, '{phase}', '"roll"'::jsonb, true);
  v_state := jsonb_set(v_state, '{currentPlayer}', '0'::jsonb, true);
  return v_state;
end;
$$;

create or replace function public.arcade_monopoly_append_player(
  p_game_state jsonb,
  p_uid uuid,
  p_player_name text,
  p_index integer
)
returns jsonb
language plpgsql
immutable
security definer
set search_path = public, pg_temp
as $$
declare
  v_state jsonb := coalesce(p_game_state, '{}'::jsonb);
  v_cash integer := 1500;
  v_token text;
  v_color text;
  v_player jsonb;
begin
  if jsonb_typeof(v_state -> 'players') <> 'array' then
    raise exception 'Invalid CP Monopoly player state.';
  end if;

  begin
    v_cash := greatest(500, least(5000, coalesce((v_state #>> '{settings,startingCash}')::integer, 1500)));
  exception when others then
    v_cash := 1500;
  end;

  v_token := case p_index when 0 then 'bolt' when 1 then 'crown' when 2 then 'gamepad' else 'rocket' end;
  v_color := case p_index when 0 then '#facc15' when 1 then '#22d3ee' when 2 then '#c084fc' else '#fb7185' end;
  v_player := jsonb_build_object(
    'id', p_uid::text,
    'name', left(coalesce(p_player_name, 'ComePlayers Player'), 48),
    'token', v_token,
    'color', v_color,
    'cash', v_cash,
    'position', 0,
    'jailed', false,
    'jailTurns', 0,
    'bankrupt', false,
    'npc', false,
    'getOutCards', 0
  );

  v_state := jsonb_set(
    v_state,
    '{players}',
    coalesce(v_state -> 'players', '[]'::jsonb) || jsonb_build_array(v_player),
    true
  );
  return v_state;
end;
$$;

create or replace function public.arcade_monopoly_activate_state(p_game_state jsonb)
returns jsonb
language plpgsql
immutable
security definer
set search_path = public, pg_temp
as $$
declare
  v_state jsonb := coalesce(p_game_state, '{}'::jsonb);
  v_message text := 'The CP Monopoly economy is live. The host rolls first.';
begin
  v_state := jsonb_set(v_state, '{status}', '"playing"'::jsonb, true);
  v_state := jsonb_set(v_state, '{phase}', '"roll"'::jsonb, true);
  v_state := jsonb_set(v_state, '{currentPlayer}', '0'::jsonb, true);
  v_state := jsonb_set(v_state, '{dice}', '[0,0]'::jsonb, true);
  v_state := jsonb_set(v_state, '{turnNumber}', '1'::jsonb, true);
  v_state := jsonb_set(v_state, '{lastEvent}', to_jsonb(v_message), true);
  v_state := jsonb_set(
    v_state,
    '{log}',
    jsonb_build_array(v_message) || coalesce(v_state -> 'log', '[]'::jsonb),
    true
  );
  return v_state;
end;
$$;

create or replace function public.arcade_monopoly_create_room(
  p_room_name text,
  p_max_players integer,
  p_game_state jsonb
)
returns setof public.arcade_monopoly_rooms
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := regexp_replace(trim(coalesce(p_room_name, '')), '\s+', ' ', 'g');
  v_max integer := greatest(2, least(4, coalesce(p_max_players, 4)));
  v_player_name text;
  v_state jsonb;
begin
  if v_uid is null then
    raise exception 'You must be signed in to create an online CP Monopoly room.';
  end if;

  if char_length(v_name) < 3 or char_length(v_name) > 48 then
    raise exception 'Room name must contain 3 to 48 characters.';
  end if;

  v_player_name := public.arcade_monopoly_display_name(v_uid);
  v_state := public.arcade_monopoly_prepare_host_state(p_game_state, v_uid, v_player_name);

  update public.arcade_monopoly_rooms
  set status = 'abandoned', updated_at = now(), version = version + 1
  where host_player_id = v_uid and status = 'waiting';

  return query
  insert into public.arcade_monopoly_rooms (
    room_name,
    room_kind,
    host_player_id,
    player_ids,
    player_names,
    max_players,
    game_state,
    status,
    version,
    updated_at
  )
  values (
    v_name,
    'public',
    v_uid,
    array[v_uid],
    array[v_player_name],
    v_max,
    v_state,
    'waiting',
    0,
    now()
  )
  returning *;
end;
$$;

create or replace function public.arcade_monopoly_join_room(p_room_id uuid)
returns setof public.arcade_monopoly_rooms
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.arcade_monopoly_rooms;
  v_name text;
  v_index integer;
  v_state jsonb;
begin
  if v_uid is null then
    raise exception 'You must be signed in to join an online CP Monopoly room.';
  end if;

  select * into v_room
  from public.arcade_monopoly_rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception 'CP Monopoly room not found.';
  end if;

  if v_uid = any(v_room.player_ids) then
    return query select * from public.arcade_monopoly_rooms where id = v_room.id;
    return;
  end if;

  if v_room.room_kind <> 'public'
     or v_room.status <> 'waiting'
     or cardinality(v_room.player_ids) >= v_room.max_players then
    raise exception 'This CP Monopoly room is already full or has started.';
  end if;

  if v_room.updated_at <= now() - interval '150 seconds' then
    update public.arcade_monopoly_rooms
    set status = 'abandoned', updated_at = now(), version = version + 1
    where id = v_room.id;
    raise exception 'This CP Monopoly room is no longer available.';
  end if;

  v_name := public.arcade_monopoly_display_name(v_uid);
  v_index := cardinality(v_room.player_ids);
  v_state := public.arcade_monopoly_append_player(v_room.game_state, v_uid, v_name, v_index);

  update public.arcade_monopoly_rooms
  set
    player_ids = array_append(player_ids, v_uid),
    player_names = array_append(player_names, v_name),
    game_state = v_state,
    updated_at = now(),
    version = version + 1
  where id = v_room.id;

  return query select * from public.arcade_monopoly_rooms where id = v_room.id;
end;
$$;

create or replace function public.arcade_monopoly_start_room(p_room_id uuid)
returns setof public.arcade_monopoly_rooms
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.arcade_monopoly_rooms;
  v_state jsonb;
begin
  if v_uid is null then
    raise exception 'You must be signed in.';
  end if;

  select * into v_room
  from public.arcade_monopoly_rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception 'CP Monopoly room not found.';
  end if;
  if v_room.host_player_id <> v_uid then
    raise exception 'Only the room host can start this match.';
  end if;
  if v_room.status <> 'waiting' then
    return query select * from public.arcade_monopoly_rooms where id = v_room.id;
    return;
  end if;
  if cardinality(v_room.player_ids) < 2 then
    raise exception 'At least two players are required.';
  end if;

  v_state := public.arcade_monopoly_activate_state(v_room.game_state);
  update public.arcade_monopoly_rooms
  set game_state = v_state, status = 'active', updated_at = now(), version = version + 1
  where id = v_room.id;

  return query select * from public.arcade_monopoly_rooms where id = v_room.id;
end;
$$;

create or replace function public.arcade_monopoly_matchmake(p_game_state jsonb)
returns setof public.arcade_monopoly_rooms
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.arcade_monopoly_rooms;
  v_name text;
  v_state jsonb;
begin
  if v_uid is null then
    raise exception 'You must be signed in to use CP Monopoly matchmaking.';
  end if;

  v_name := public.arcade_monopoly_display_name(v_uid);

  select * into v_room
  from public.arcade_monopoly_rooms
  where status = 'active' and v_uid = any(player_ids)
  order by updated_at desc
  limit 1;

  if found then
    return query select * from public.arcade_monopoly_rooms where id = v_room.id;
    return;
  end if;

  select * into v_room
  from public.arcade_monopoly_rooms
  where room_kind = 'matchmaking'
    and status = 'waiting'
    and v_uid = any(player_ids)
    and updated_at > now() - interval '150 seconds'
  order by updated_at desc
  limit 1
  for update;

  if found then
    update public.arcade_monopoly_rooms set updated_at = now() where id = v_room.id;
    return query select * from public.arcade_monopoly_rooms where id = v_room.id;
    return;
  end if;

  update public.arcade_monopoly_rooms
  set status = 'abandoned', updated_at = now(), version = version + 1
  where status = 'waiting'
    and (
      host_player_id = v_uid
      or updated_at <= now() - interval '150 seconds'
    );

  select * into v_room
  from public.arcade_monopoly_rooms
  where room_kind = 'matchmaking'
    and status = 'waiting'
    and cardinality(player_ids) = 1
    and not (v_uid = any(player_ids))
    and updated_at > now() - interval '150 seconds'
  order by created_at asc
  limit 1
  for update skip locked;

  if found then
    v_state := public.arcade_monopoly_append_player(v_room.game_state, v_uid, v_name, 1);
    v_state := public.arcade_monopoly_activate_state(v_state);

    update public.arcade_monopoly_rooms
    set
      player_ids = array_append(player_ids, v_uid),
      player_names = array_append(player_names, v_name),
      game_state = v_state,
      status = 'active',
      updated_at = now(),
      version = version + 1
    where id = v_room.id;

    return query select * from public.arcade_monopoly_rooms where id = v_room.id;
    return;
  end if;

  v_state := public.arcade_monopoly_prepare_host_state(p_game_state, v_uid, v_name);
  return query
  insert into public.arcade_monopoly_rooms (
    room_name,
    room_kind,
    host_player_id,
    player_ids,
    player_names,
    max_players,
    game_state,
    status,
    version,
    updated_at
  )
  values (
    'Quick Match • ' || left(v_name, 30),
    'matchmaking',
    v_uid,
    array[v_uid],
    array[v_name],
    2,
    v_state,
    'waiting',
    0,
    now()
  )
  returning *;
end;
$$;

create or replace function public.arcade_monopoly_submit_state(
  p_room_id uuid,
  p_expected_version integer,
  p_game_state jsonb
)
returns setof public.arcade_monopoly_rooms
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.arcade_monopoly_rooms;
  v_state_ids uuid[];
  v_next_status text;
begin
  if v_uid is null then
    raise exception 'You must be signed in.';
  end if;

  select * into v_room
  from public.arcade_monopoly_rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception 'CP Monopoly room not found.';
  end if;
  if not (v_uid = any(v_room.player_ids)) then
    raise exception 'You are not a participant in this room.';
  end if;
  if v_room.status not in ('active', 'finished') then
    raise exception 'This CP Monopoly match has not started.';
  end if;
  if v_room.version <> p_expected_version then
    raise exception 'The room changed on another device. Please retry your action.';
  end if;
  if jsonb_typeof(p_game_state) <> 'object'
     or jsonb_typeof(p_game_state -> 'players') <> 'array'
     or jsonb_array_length(p_game_state -> 'players') <> cardinality(v_room.player_ids) then
    raise exception 'Invalid CP Monopoly game state.';
  end if;

  select array_agg((entry ->> 'id')::uuid order by ordinal)
  into v_state_ids
  from jsonb_array_elements(p_game_state -> 'players') with ordinality as players(entry, ordinal);

  if v_state_ids is distinct from v_room.player_ids then
    raise exception 'Player identities cannot be changed inside the game state.';
  end if;

  v_next_status := case when p_game_state ->> 'status' = 'finished' then 'finished' else 'active' end;

  update public.arcade_monopoly_rooms
  set
    game_state = p_game_state,
    status = v_next_status,
    updated_at = now(),
    version = version + 1
  where id = v_room.id;

  return query select * from public.arcade_monopoly_rooms where id = v_room.id;
end;
$$;

create or replace function public.arcade_monopoly_touch_room(p_room_id uuid)
returns setof public.arcade_monopoly_rooms
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'You must be signed in.';
  end if;

  update public.arcade_monopoly_rooms
  set updated_at = now()
  where id = p_room_id
    and status = 'waiting'
    and host_player_id = v_uid;

  return query
  select * from public.arcade_monopoly_rooms
  where id = p_room_id and v_uid = any(player_ids);
end;
$$;

create or replace function public.arcade_monopoly_leave_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.arcade_monopoly_rooms;
  v_player_ids uuid[];
  v_player_names text[];
  v_players jsonb;
begin
  if v_uid is null then
    return;
  end if;

  select * into v_room
  from public.arcade_monopoly_rooms
  where id = p_room_id
  for update;

  if not found or v_room.status <> 'waiting' or not (v_uid = any(v_room.player_ids)) then
    return;
  end if;

  if v_room.host_player_id = v_uid then
    update public.arcade_monopoly_rooms
    set status = 'abandoned', updated_at = now(), version = version + 1
    where id = v_room.id;
    return;
  end if;

  select
    coalesce(array_agg(entry.player_id order by entry.ordinal), '{}'::uuid[]),
    coalesce(array_agg(entry.player_name order by entry.ordinal), '{}'::text[])
  into v_player_ids, v_player_names
  from unnest(v_room.player_ids, v_room.player_names) with ordinality
    as entry(player_id, player_name, ordinal)
  where entry.player_id <> v_uid;

  select coalesce(jsonb_agg(entry.player order by entry.ordinal), '[]'::jsonb)
  into v_players
  from jsonb_array_elements(v_room.game_state -> 'players') with ordinality
    as entry(player, ordinal)
  where entry.player ->> 'id' <> v_uid::text;

  update public.arcade_monopoly_rooms
  set
    player_ids = v_player_ids,
    player_names = v_player_names,
    game_state = jsonb_set(game_state, '{players}', v_players, true),
    updated_at = now(),
    version = version + 1
  where id = v_room.id;
end;
$$;

create or replace function public.arcade_monopoly_cancel_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return;
  end if;

  update public.arcade_monopoly_rooms
  set status = 'abandoned', updated_at = now(), version = version + 1
  where id = p_room_id
    and status = 'waiting'
    and host_player_id = v_uid;
end;
$$;

revoke all on function public.arcade_monopoly_display_name(uuid) from public;
revoke all on function public.arcade_monopoly_prepare_host_state(jsonb, uuid, text) from public;
revoke all on function public.arcade_monopoly_append_player(jsonb, uuid, text, integer) from public;
revoke all on function public.arcade_monopoly_activate_state(jsonb) from public;
revoke all on function public.arcade_monopoly_create_room(text, integer, jsonb) from public;
revoke all on function public.arcade_monopoly_join_room(uuid) from public;
revoke all on function public.arcade_monopoly_start_room(uuid) from public;
revoke all on function public.arcade_monopoly_matchmake(jsonb) from public;
revoke all on function public.arcade_monopoly_submit_state(uuid, integer, jsonb) from public;
revoke all on function public.arcade_monopoly_touch_room(uuid) from public;
revoke all on function public.arcade_monopoly_leave_room(uuid) from public;
revoke all on function public.arcade_monopoly_cancel_room(uuid) from public;

grant execute on function public.arcade_monopoly_create_room(text, integer, jsonb) to authenticated;
grant execute on function public.arcade_monopoly_join_room(uuid) to authenticated;
grant execute on function public.arcade_monopoly_start_room(uuid) to authenticated;
grant execute on function public.arcade_monopoly_matchmake(jsonb) to authenticated;
grant execute on function public.arcade_monopoly_submit_state(uuid, integer, jsonb) to authenticated;
grant execute on function public.arcade_monopoly_touch_room(uuid) to authenticated;
grant execute on function public.arcade_monopoly_leave_room(uuid) to authenticated;
grant execute on function public.arcade_monopoly_cancel_room(uuid) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.arcade_monopoly_rooms;
exception
  when duplicate_object then null;
end;
$$;

commit;

select 'arcade_cp_monopoly_v43_ready' as status;

-- ComePlayers Marble V48: ready checks, host lobby controls, player removal, and reconnect-safe room metadata.
-- Run after 20260718153000_arcade_marble_v47_room_codes.sql.

begin;

alter table public.arcade_monopoly_rooms
  add column if not exists ready_player_ids uuid[] not null default '{}'::uuid[];

update public.arcade_monopoly_rooms
set ready_player_ids = array(
  select ready_id
  from unnest(coalesce(ready_player_ids, '{}'::uuid[])) as ready_id
  where ready_id = any(player_ids)
);

create or replace function public.arcade_monopoly_set_ready(
  p_room_id uuid,
  p_ready boolean
)
returns setof public.arcade_monopoly_rooms
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.arcade_monopoly_rooms;
begin
  if v_uid is null then
    raise exception 'You must be signed in.';
  end if;

  select * into v_room
  from public.arcade_monopoly_rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception 'ComePlayers Marble room not found.';
  end if;
  if v_room.status <> 'waiting' then
    raise exception 'Ready status can only be changed before the match starts.';
  end if;
  if not (v_uid = any(v_room.player_ids)) then
    raise exception 'You are not a participant in this room.';
  end if;

  update public.arcade_monopoly_rooms
  set
    ready_player_ids = case
      when coalesce(p_ready, false)
        then array(select distinct entry.player_id from unnest(array_append(ready_player_ids, v_uid)) as entry(player_id))
      else array_remove(ready_player_ids, v_uid)
    end,
    updated_at = now(),
    version = version + 1
  where id = v_room.id;

  return query select * from public.arcade_monopoly_rooms where id = v_room.id;
end;
$$;

create or replace function public.arcade_monopoly_update_lobby(
  p_room_id uuid,
  p_max_players integer,
  p_starting_cash integer,
  p_fast_mode boolean,
  p_free_parking_jackpot boolean
)
returns setof public.arcade_monopoly_rooms
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.arcade_monopoly_rooms;
  v_max_players integer;
  v_starting_cash integer;
  v_state jsonb;
  v_players jsonb;
begin
  if v_uid is null then
    raise exception 'You must be signed in.';
  end if;

  select * into v_room
  from public.arcade_monopoly_rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception 'ComePlayers Marble room not found.';
  end if;
  if v_room.status <> 'waiting' then
    raise exception 'Room settings can only be changed before the match starts.';
  end if;
  if v_room.host_player_id <> v_uid then
    raise exception 'Only the room host can change match rules.';
  end if;

  v_max_players := greatest(cardinality(v_room.player_ids), least(4, greatest(2, coalesce(p_max_players, v_room.max_players))));
  v_starting_cash := least(2000, greatest(1200, coalesce(p_starting_cash, 1500)));
  if coalesce(p_fast_mode, false) then
    v_starting_cash := least(v_starting_cash, 1200);
  end if;

  select coalesce(
    jsonb_agg(jsonb_set(player_entry, '{cash}', to_jsonb(v_starting_cash), true) order by ordinal),
    '[]'::jsonb
  )
  into v_players
  from jsonb_array_elements(coalesce(v_room.game_state -> 'players', '[]'::jsonb))
    with ordinality as players(player_entry, ordinal);

  v_state := jsonb_set(
    v_room.game_state,
    '{settings}',
    jsonb_build_object(
      'freeParkingJackpot', coalesce(p_free_parking_jackpot, true),
      'fastMode', coalesce(p_fast_mode, false),
      'startingCash', v_starting_cash
    ),
    true
  );
  v_state := jsonb_set(v_state, '{players}', v_players, true);
  v_state := jsonb_set(v_state, '{lastEvent}', '"The host updated the lobby rules. Confirm Ready again."'::jsonb, true);

  update public.arcade_monopoly_rooms
  set
    max_players = v_max_players,
    game_state = v_state,
    ready_player_ids = '{}'::uuid[],
    updated_at = now(),
    version = version + 1
  where id = v_room.id;

  return query select * from public.arcade_monopoly_rooms where id = v_room.id;
end;
$$;

create or replace function public.arcade_monopoly_kick_player(
  p_room_id uuid,
  p_player_id uuid
)
returns setof public.arcade_monopoly_rooms
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
    raise exception 'You must be signed in.';
  end if;

  select * into v_room
  from public.arcade_monopoly_rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception 'ComePlayers Marble room not found.';
  end if;
  if v_room.status <> 'waiting' then
    raise exception 'Players can only be removed before the match starts.';
  end if;
  if v_room.host_player_id <> v_uid then
    raise exception 'Only the room host can remove a player.';
  end if;
  if p_player_id = v_uid then
    raise exception 'The host cannot remove themselves. Cancel the room instead.';
  end if;
  if not (p_player_id = any(v_room.player_ids)) then
    raise exception 'That player is no longer in the room.';
  end if;

  select
    coalesce(array_agg(entry.player_id order by entry.ordinal), '{}'::uuid[]),
    coalesce(array_agg(entry.player_name order by entry.ordinal), '{}'::text[])
  into v_player_ids, v_player_names
  from unnest(v_room.player_ids, v_room.player_names) with ordinality
    as entry(player_id, player_name, ordinal)
  where entry.player_id <> p_player_id;

  select coalesce(jsonb_agg(entry.player order by entry.ordinal), '[]'::jsonb)
  into v_players
  from jsonb_array_elements(v_room.game_state -> 'players') with ordinality
    as entry(player, ordinal)
  where entry.player ->> 'id' <> p_player_id::text;

  update public.arcade_monopoly_rooms
  set
    player_ids = v_player_ids,
    player_names = v_player_names,
    ready_player_ids = array_remove(ready_player_ids, p_player_id),
    game_state = jsonb_set(game_state, '{players}', v_players, true),
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
    raise exception 'ComePlayers Marble room not found.';
  end if;
  if v_room.host_player_id <> v_uid then
    raise exception 'Only the room host can start the match.';
  end if;
  if v_room.status <> 'waiting' then
    return query select * from public.arcade_monopoly_rooms where id = v_room.id;
    return;
  end if;
  if cardinality(v_room.player_ids) < 2 then
    raise exception 'At least two players are required.';
  end if;
  if exists (
    select 1
    from unnest(v_room.player_ids) as player_id
    where not (player_id = any(v_room.ready_player_ids))
  ) then
    raise exception 'Every joined player must confirm Ready before the match starts.';
  end if;

  v_state := public.arcade_monopoly_activate_state(v_room.game_state);
  update public.arcade_monopoly_rooms
  set game_state = v_state, status = 'active', updated_at = now(), version = version + 1
  where id = v_room.id;

  return query select * from public.arcade_monopoly_rooms where id = v_room.id;
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
    set status = 'abandoned', ready_player_ids = '{}'::uuid[], updated_at = now(), version = version + 1
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
    ready_player_ids = array_remove(ready_player_ids, v_uid),
    game_state = jsonb_set(game_state, '{players}', v_players, true),
    updated_at = now(),
    version = version + 1
  where id = v_room.id;
end;
$$;

revoke all on function public.arcade_monopoly_set_ready(uuid, boolean) from public;
revoke all on function public.arcade_monopoly_update_lobby(uuid, integer, integer, boolean, boolean) from public;
revoke all on function public.arcade_monopoly_kick_player(uuid, uuid) from public;

grant execute on function public.arcade_monopoly_set_ready(uuid, boolean) to authenticated;
grant execute on function public.arcade_monopoly_update_lobby(uuid, integer, integer, boolean, boolean) to authenticated;
grant execute on function public.arcade_monopoly_kick_player(uuid, uuid) to authenticated;

commit;

select 'arcade_marble_v48_multiplayer_lobby_ready' as status;

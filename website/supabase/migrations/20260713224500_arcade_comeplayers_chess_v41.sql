-- ComePlayers Arcade V41: realtime online chess rooms.
-- Run this migration in Supabase before using Online Duel mode.

create extension if not exists pgcrypto;

create table if not exists public.arcade_chess_rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique check (char_length(room_code) between 4 and 8),
  white_player_id uuid not null references auth.users(id) on delete cascade,
  black_player_id uuid references auth.users(id) on delete set null,
  game_state jsonb not null,
  last_move jsonb,
  status text not null default 'waiting' check (status in ('waiting', 'active', 'finished', 'abandoned')),
  winner_color text check (winner_color in ('w', 'b') or winner_color is null),
  version bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists arcade_chess_rooms_created_at_idx
  on public.arcade_chess_rooms (created_at desc);

create index if not exists arcade_chess_rooms_players_idx
  on public.arcade_chess_rooms (white_player_id, black_player_id);

alter table public.arcade_chess_rooms enable row level security;

grant select, delete on table public.arcade_chess_rooms to authenticated;
revoke insert, update on table public.arcade_chess_rooms from anon, authenticated;

drop policy if exists "Chess participants can read their room" on public.arcade_chess_rooms;
create policy "Chess participants can read their room"
  on public.arcade_chess_rooms
  for select
  to authenticated
  using (auth.uid() = white_player_id or auth.uid() = black_player_id);

drop policy if exists "Chess participants can delete their room" on public.arcade_chess_rooms;
create policy "Chess participants can delete their room"
  on public.arcade_chess_rooms
  for delete
  to authenticated
  using (auth.uid() = white_player_id or auth.uid() = black_player_id);

create or replace function public.arcade_chess_create_room(
  p_room_code text,
  p_game_state jsonb
)
returns setof public.arcade_chess_rooms
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_code text := upper(trim(p_room_code));
begin
  if v_uid is null then
    raise exception 'You must be signed in to create an online chess room.';
  end if;

  if char_length(v_code) < 4 or char_length(v_code) > 8 or v_code !~ '^[A-Z0-9]+$' then
    raise exception 'Invalid room code.';
  end if;

  if coalesce(jsonb_typeof(p_game_state -> 'board'), '') <> 'array'
     or coalesce(jsonb_array_length(p_game_state -> 'board'), 0) <> 64
     or coalesce(p_game_state ->> 'turn', '') <> 'w' then
    raise exception 'Invalid initial chess state.';
  end if;

  return query
  insert into public.arcade_chess_rooms (
    room_code,
    white_player_id,
    black_player_id,
    game_state,
    status,
    winner_color,
    version
  )
  values (
    v_code,
    v_uid,
    null,
    p_game_state,
    'waiting',
    null,
    0
  )
  returning *;
end;
$$;

create or replace function public.arcade_chess_join_room(
  p_room_code text
)
returns setof public.arcade_chess_rooms
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_code text := upper(trim(p_room_code));
  v_room public.arcade_chess_rooms;
begin
  if v_uid is null then
    raise exception 'You must be signed in to join an online chess room.';
  end if;

  select *
  into v_room
  from public.arcade_chess_rooms
  where room_code = v_code
  for update;

  if not found then
    raise exception 'Chess room not found.';
  end if;

  if v_room.white_player_id = v_uid or v_room.black_player_id = v_uid then
    return query select * from public.arcade_chess_rooms where id = v_room.id;
    return;
  end if;

  if v_room.status <> 'waiting' or v_room.black_player_id is not null then
    raise exception 'This chess room is already full or finished.';
  end if;

  update public.arcade_chess_rooms
  set
    black_player_id = v_uid,
    status = 'active',
    updated_at = now(),
    version = version + 1
  where id = v_room.id;

  return query select * from public.arcade_chess_rooms where id = v_room.id;
end;
$$;

create or replace function public.arcade_chess_submit_state(
  p_room_id uuid,
  p_expected_version bigint,
  p_game_state jsonb,
  p_last_move jsonb default null
)
returns setof public.arcade_chess_rooms
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.arcade_chess_rooms;
  v_player_color text;
  v_current_turn text;
  v_next_turn text;
  v_game_result text;
  v_next_status text;
  v_winner text;
begin
  if v_uid is null then
    raise exception 'You must be signed in to play online chess.';
  end if;

  select *
  into v_room
  from public.arcade_chess_rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception 'Chess room not found.';
  end if;

  if v_room.status <> 'active' then
    raise exception 'The chess room is not active.';
  end if;

  if v_room.version <> p_expected_version then
    raise exception 'The board changed. Wait for synchronization and try again.';
  end if;

  if v_room.white_player_id = v_uid then
    v_player_color := 'w';
  elsif v_room.black_player_id = v_uid then
    v_player_color := 'b';
  else
    raise exception 'You are not a participant in this chess room.';
  end if;

  v_current_turn := coalesce(v_room.game_state ->> 'turn', '');
  if v_player_color <> v_current_turn then
    raise exception 'It is not your turn.';
  end if;

  if coalesce(jsonb_typeof(p_game_state -> 'board'), '') <> 'array'
     or coalesce(jsonb_array_length(p_game_state -> 'board'), 0) <> 64 then
    raise exception 'Invalid chess board state.';
  end if;

  v_next_turn := coalesce(p_game_state ->> 'turn', '');
  if v_next_turn <> case when v_current_turn = 'w' then 'b' else 'w' end then
    raise exception 'Invalid turn transition.';
  end if;

  v_game_result := coalesce(p_game_state ->> 'result', 'playing');
  if v_game_result not in ('playing', 'checkmate', 'stalemate', 'draw') then
    raise exception 'Invalid chess result.';
  end if;

  v_next_status := case when v_game_result = 'playing' then 'active' else 'finished' end;
  v_winner := nullif(p_game_state ->> 'winner', '');
  if v_winner not in ('w', 'b') then
    v_winner := null;
  end if;

  update public.arcade_chess_rooms
  set
    game_state = p_game_state,
    last_move = p_last_move,
    status = v_next_status,
    winner_color = v_winner,
    version = version + 1,
    updated_at = now()
  where id = p_room_id;

  return query select * from public.arcade_chess_rooms where id = p_room_id;
end;
$$;

revoke all on function public.arcade_chess_create_room(text, jsonb) from public;
revoke all on function public.arcade_chess_join_room(text) from public;
revoke all on function public.arcade_chess_submit_state(uuid, bigint, jsonb, jsonb) from public;

grant execute on function public.arcade_chess_create_room(text, jsonb) to authenticated;
grant execute on function public.arcade_chess_join_room(text) to authenticated;
grant execute on function public.arcade_chess_submit_state(uuid, bigint, jsonb, jsonb) to authenticated;

-- Add the room table to Supabase Realtime once. The exception keeps re-running safe.
do $$
begin
  alter publication supabase_realtime add table public.arcade_chess_rooms;
exception
  when duplicate_object then null;
end;
$$;

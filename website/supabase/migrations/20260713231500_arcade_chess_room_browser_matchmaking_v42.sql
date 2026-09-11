-- ComePlayers Arcade V42: public chess room browser + named rooms + global matchmaking.
-- Requires V41 chess migration to be installed first.

begin;

alter table public.arcade_chess_rooms
  add column if not exists room_name text,
  add column if not exists room_kind text,
  add column if not exists white_player_name text,
  add column if not exists black_player_name text;

update public.arcade_chess_rooms
set
  room_name = coalesce(nullif(trim(room_name), ''), 'ComePlayers Chess Room'),
  room_kind = coalesce(nullif(trim(room_kind), ''), 'public'),
  white_player_name = coalesce(nullif(trim(white_player_name), ''), 'ComePlayers Player')
where room_name is null
   or room_kind is null
   or white_player_name is null;

alter table public.arcade_chess_rooms
  alter column room_name set default 'ComePlayers Chess Room',
  alter column room_name set not null,
  alter column room_kind set default 'public',
  alter column room_kind set not null,
  alter column white_player_name set default 'ComePlayers Player',
  alter column white_player_name set not null;

alter table public.arcade_chess_rooms
  drop constraint if exists arcade_chess_rooms_room_name_v42,
  drop constraint if exists arcade_chess_rooms_room_kind_v42;

alter table public.arcade_chess_rooms
  add constraint arcade_chess_rooms_room_name_v42
    check (char_length(room_name) between 3 and 48),
  add constraint arcade_chess_rooms_room_kind_v42
    check (room_kind in ('public', 'matchmaking'));

create index if not exists arcade_chess_rooms_lobby_v42_idx
  on public.arcade_chess_rooms (room_kind, status, updated_at desc);

-- Waiting rooms are visible to signed-in users so the lobby can list them.
-- Active/finished rooms remain visible only to their two participants.
drop policy if exists "Chess participants can read their room" on public.arcade_chess_rooms;
drop policy if exists "Authenticated users can browse waiting chess rooms" on public.arcade_chess_rooms;
create policy "Authenticated users can browse waiting chess rooms"
  on public.arcade_chess_rooms
  for select
  to authenticated
  using (
    (
      status = 'waiting'
      and updated_at > now() - interval '2 minutes'
    )
    or auth.uid() = white_player_id
    or auth.uid() = black_player_id
  );

grant select, delete on table public.arcade_chess_rooms to authenticated;
revoke insert, update on table public.arcade_chess_rooms from anon, authenticated;

create or replace function public.arcade_chess_display_name(p_uid uuid)
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

create or replace function public.arcade_chess_make_room_code()
returns text
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  select 'CP' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6));
$$;

create or replace function public.arcade_chess_create_named_room(
  p_room_name text,
  p_game_state jsonb
)
returns setof public.arcade_chess_rooms
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := regexp_replace(trim(coalesce(p_room_name, '')), '\s+', ' ', 'g');
  v_player_name text;
  v_code text;
  v_attempt integer;
begin
  if v_uid is null then
    raise exception 'You must be signed in to create an online chess room.';
  end if;

  if char_length(v_name) < 3 or char_length(v_name) > 48 then
    raise exception 'Room name must contain 3 to 48 characters.';
  end if;

  if coalesce(jsonb_typeof(p_game_state -> 'board'), '') <> 'array'
     or coalesce(jsonb_array_length(p_game_state -> 'board'), 0) <> 64
     or coalesce(p_game_state ->> 'turn', '') <> 'w' then
    raise exception 'Invalid initial chess state.';
  end if;

  v_player_name := public.arcade_chess_display_name(v_uid);

  update public.arcade_chess_rooms
  set status = 'abandoned', updated_at = now(), version = version + 1
  where white_player_id = v_uid and status = 'waiting';

  for v_attempt in 1..8 loop
    v_code := public.arcade_chess_make_room_code();
    begin
      return query
      insert into public.arcade_chess_rooms (
        room_code,
        room_name,
        room_kind,
        white_player_id,
        white_player_name,
        black_player_id,
        black_player_name,
        game_state,
        status,
        winner_color,
        version,
        updated_at
      )
      values (
        v_code,
        v_name,
        'public',
        v_uid,
        v_player_name,
        null,
        null,
        p_game_state,
        'waiting',
        null,
        0,
        now()
      )
      returning *;
      return;
    exception
      when unique_violation then
        null;
    end;
  end loop;

  raise exception 'Could not create a unique chess room. Please try again.';
end;
$$;

create or replace function public.arcade_chess_join_room_by_id(
  p_room_id uuid
)
returns setof public.arcade_chess_rooms
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.arcade_chess_rooms;
  v_player_name text;
begin
  if v_uid is null then
    raise exception 'You must be signed in to join an online chess room.';
  end if;

  select *
  into v_room
  from public.arcade_chess_rooms
  where id = p_room_id
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

  if v_room.updated_at <= now() - interval '2 minutes' then
    update public.arcade_chess_rooms
    set status = 'abandoned', updated_at = now(), version = version + 1
    where id = v_room.id;
    raise exception 'This chess room is no longer available.';
  end if;

  v_player_name := public.arcade_chess_display_name(v_uid);

  update public.arcade_chess_rooms
  set status = 'abandoned', updated_at = now(), version = version + 1
  where white_player_id = v_uid and status = 'waiting' and id <> v_room.id;

  update public.arcade_chess_rooms
  set
    black_player_id = v_uid,
    black_player_name = v_player_name,
    status = 'active',
    updated_at = now(),
    version = version + 1
  where id = v_room.id;

  return query select * from public.arcade_chess_rooms where id = v_room.id;
end;
$$;

create or replace function public.arcade_chess_matchmake(
  p_game_state jsonb
)
returns setof public.arcade_chess_rooms
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.arcade_chess_rooms;
  v_player_name text;
  v_code text;
  v_attempt integer;
begin
  if v_uid is null then
    raise exception 'You must be signed in to use chess matchmaking.';
  end if;

  if coalesce(jsonb_typeof(p_game_state -> 'board'), '') <> 'array'
     or coalesce(jsonb_array_length(p_game_state -> 'board'), 0) <> 64
     or coalesce(p_game_state ->> 'turn', '') <> 'w' then
    raise exception 'Invalid initial chess state.';
  end if;

  v_player_name := public.arcade_chess_display_name(v_uid);

  select *
  into v_room
  from public.arcade_chess_rooms
  where status = 'active'
    and (white_player_id = v_uid or black_player_id = v_uid)
  order by updated_at desc
  limit 1;

  if found then
    return query select * from public.arcade_chess_rooms where id = v_room.id;
    return;
  end if;

  select *
  into v_room
  from public.arcade_chess_rooms
  where room_kind = 'matchmaking'
    and status = 'waiting'
    and white_player_id = v_uid
    and updated_at > now() - interval '2 minutes'
  order by updated_at desc
  limit 1
  for update;

  if found then
    update public.arcade_chess_rooms
    set updated_at = now()
    where id = v_room.id;
    return query select * from public.arcade_chess_rooms where id = v_room.id;
    return;
  end if;

  update public.arcade_chess_rooms
  set status = 'abandoned', updated_at = now(), version = version + 1
  where status = 'waiting'
    and (
      white_player_id = v_uid
      or updated_at <= now() - interval '2 minutes'
    );

  select *
  into v_room
  from public.arcade_chess_rooms
  where room_kind = 'matchmaking'
    and status = 'waiting'
    and white_player_id <> v_uid
    and updated_at > now() - interval '2 minutes'
  order by created_at asc
  limit 1
  for update skip locked;

  if found then
    update public.arcade_chess_rooms
    set
      black_player_id = v_uid,
      black_player_name = v_player_name,
      status = 'active',
      updated_at = now(),
      version = version + 1
    where id = v_room.id;

    return query select * from public.arcade_chess_rooms where id = v_room.id;
    return;
  end if;

  for v_attempt in 1..8 loop
    v_code := public.arcade_chess_make_room_code();
    begin
      return query
      insert into public.arcade_chess_rooms (
        room_code,
        room_name,
        room_kind,
        white_player_id,
        white_player_name,
        black_player_id,
        black_player_name,
        game_state,
        status,
        winner_color,
        version,
        updated_at
      )
      values (
        v_code,
        'Quick Match • ' || left(v_player_name, 30),
        'matchmaking',
        v_uid,
        v_player_name,
        null,
        null,
        p_game_state,
        'waiting',
        null,
        0,
        now()
      )
      returning *;
      return;
    exception
      when unique_violation then
        null;
    end;
  end loop;

  raise exception 'Could not start matchmaking. Please try again.';
end;
$$;

create or replace function public.arcade_chess_touch_room(
  p_room_id uuid
)
returns setof public.arcade_chess_rooms
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

  update public.arcade_chess_rooms
  set updated_at = now()
  where id = p_room_id
    and status = 'waiting'
    and white_player_id = v_uid;

  return query
  select *
  from public.arcade_chess_rooms
  where id = p_room_id
    and (white_player_id = v_uid or black_player_id = v_uid);
end;
$$;

create or replace function public.arcade_chess_cancel_room(
  p_room_id uuid
)
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

  update public.arcade_chess_rooms
  set status = 'abandoned', updated_at = now(), version = version + 1
  where id = p_room_id
    and status = 'waiting'
    and white_player_id = v_uid;
end;
$$;

revoke all on function public.arcade_chess_display_name(uuid) from public;
revoke all on function public.arcade_chess_make_room_code() from public;
revoke all on function public.arcade_chess_create_named_room(text, jsonb) from public;
revoke all on function public.arcade_chess_join_room_by_id(uuid) from public;
revoke all on function public.arcade_chess_matchmake(jsonb) from public;
revoke all on function public.arcade_chess_touch_room(uuid) from public;
revoke all on function public.arcade_chess_cancel_room(uuid) from public;

grant execute on function public.arcade_chess_create_named_room(text, jsonb) to authenticated;
grant execute on function public.arcade_chess_join_room_by_id(uuid) to authenticated;
grant execute on function public.arcade_chess_matchmake(jsonb) to authenticated;
grant execute on function public.arcade_chess_touch_room(uuid) to authenticated;
grant execute on function public.arcade_chess_cancel_room(uuid) to authenticated;

commit;

select 'arcade_chess_room_browser_matchmaking_v42_ready' as status;

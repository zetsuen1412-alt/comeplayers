-- ComePlayers Arcade V54: CP Snake Neon Rush public rooms + global matchmaking.
-- Movement uses Supabase Realtime Broadcast; PostgreSQL stores only lobby/membership metadata.

begin;

create table if not exists public.arcade_snake_rooms (
  id uuid primary key default gen_random_uuid(),
  room_name text not null,
  room_kind text not null default 'public',
  host_player_id uuid not null references auth.users(id) on delete cascade,
  host_player_name text not null default 'ComePlayers Player',
  max_players integer not null default 12,
  player_count integer not null default 1,
  status text not null default 'waiting',
  map_theme text not null default 'neon-city',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint arcade_snake_room_name_v54 check (char_length(room_name) between 3 and 40),
  constraint arcade_snake_room_kind_v54 check (room_kind in ('public', 'matchmaking')),
  constraint arcade_snake_max_players_v54 check (max_players between 2 and 20),
  constraint arcade_snake_player_count_v54 check (player_count between 0 and 20),
  constraint arcade_snake_status_v54 check (status in ('waiting', 'active', 'closed'))
);

create table if not exists public.arcade_snake_room_members (
  room_id uuid not null references public.arcade_snake_rooms(id) on delete cascade,
  player_id uuid not null references auth.users(id) on delete cascade,
  player_name text not null default 'ComePlayers Player',
  skin text not null default 'alexia-gold',
  is_host boolean not null default false,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (room_id, player_id),
  constraint arcade_snake_skin_v54 check (
    skin in ('alexia-gold', 'cyber-cyan', 'neon-pulse', 'void-violet', 'inferno', 'frost')
  )
);

create index if not exists arcade_snake_rooms_lobby_v54_idx
  on public.arcade_snake_rooms (status, player_count desc, updated_at desc);

create index if not exists arcade_snake_members_heartbeat_v54_idx
  on public.arcade_snake_room_members (room_id, last_seen_at desc);

alter table public.arcade_snake_rooms enable row level security;
alter table public.arcade_snake_room_members enable row level security;

-- Lobby metadata is intentionally visible to signed-in ComePlayers users.
drop policy if exists "Snake rooms visible to authenticated users" on public.arcade_snake_rooms;
create policy "Snake rooms visible to authenticated users"
on public.arcade_snake_rooms
for select
to authenticated
using (
  (
    status in ('waiting', 'active')
    and updated_at > now() - interval '2 minutes'
  )
  or host_player_id = auth.uid()
);

-- Membership rows stay private and are mutated only through security-definer RPCs.
drop policy if exists "Snake members visible inside joined rooms" on public.arcade_snake_room_members;

grant select on table public.arcade_snake_rooms to authenticated;
revoke select on table public.arcade_snake_room_members from anon, authenticated;
revoke insert, update, delete on table public.arcade_snake_rooms from anon, authenticated;
revoke insert, update, delete on table public.arcade_snake_room_members from anon, authenticated;

create or replace function public.arcade_snake_display_name(p_uid uuid)
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

create or replace function public.arcade_snake_validate_skin(p_skin text)
returns text
language sql
immutable
security definer
set search_path = public, pg_temp
as $$
  select case
    when p_skin in ('alexia-gold', 'cyber-cyan', 'neon-pulse', 'void-violet', 'inferno', 'frost')
      then p_skin
    else 'alexia-gold'
  end;
$$;

create or replace function public.arcade_snake_cleanup_rooms()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.arcade_snake_room_members
  where last_seen_at <= now() - interval '45 seconds';

  update public.arcade_snake_rooms room
  set
    player_count = counts.total,
    status = case when counts.total = 0 then 'closed' else room.status end,
    updated_at = case when counts.total = 0 then now() else room.updated_at end
  from (
    select r.id, count(m.player_id)::integer as total
    from public.arcade_snake_rooms r
    left join public.arcade_snake_room_members m on m.room_id = r.id
    where r.status in ('waiting', 'active')
    group by r.id
  ) counts
  where room.id = counts.id;

  update public.arcade_snake_rooms room
  set
    host_player_id = (
      select m.player_id
      from public.arcade_snake_room_members m
      where m.room_id = room.id
      order by m.joined_at asc
      limit 1
    ),
    host_player_name = (
      select m.player_name
      from public.arcade_snake_room_members m
      where m.room_id = room.id
      order by m.joined_at asc
      limit 1
    ),
    updated_at = now()
  where room.status in ('waiting', 'active')
    and room.player_count > 0
    and not exists (
      select 1
      from public.arcade_snake_room_members host_member
      where host_member.room_id = room.id
        and host_member.player_id = room.host_player_id
    );

  update public.arcade_snake_room_members member
  set is_host = (member.player_id = room.host_player_id)
  from public.arcade_snake_rooms room
  where room.id = member.room_id;

  update public.arcade_snake_rooms
  set status = 'closed', updated_at = now()
  where status in ('waiting', 'active')
    and updated_at <= now() - interval '3 minutes';
end;
$$;

create or replace function public.arcade_snake_leave_existing_rooms(p_uid uuid)
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
    from public.arcade_snake_room_members
    where player_id = p_uid
  loop
    delete from public.arcade_snake_room_members
    where room_id = v_room_id and player_id = p_uid;

    update public.arcade_snake_rooms room
    set
      player_count = counts.total,
      status = case when counts.total = 0 then 'closed' else room.status end,
      updated_at = now()
    from (
      select count(*)::integer as total
      from public.arcade_snake_room_members
      where room_id = v_room_id
    ) counts
    where room.id = v_room_id;
  end loop;

  perform public.arcade_snake_cleanup_rooms();
end;
$$;

create or replace function public.arcade_snake_create_room(
  p_room_name text,
  p_max_players integer,
  p_skin text
)
returns setof public.arcade_snake_rooms
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := regexp_replace(trim(coalesce(p_room_name, '')), '\s+', ' ', 'g');
  v_player_name text;
  v_room public.arcade_snake_rooms;
begin
  if v_uid is null then
    raise exception 'You must be signed in to create an online snake room.';
  end if;

  if char_length(v_name) < 3 or char_length(v_name) > 40 then
    raise exception 'Room name must contain 3 to 40 characters.';
  end if;

  if p_max_players not in (8, 12, 16, 20) then
    raise exception 'Maximum players must be 8, 12, 16, or 20.';
  end if;

  perform public.arcade_snake_cleanup_rooms();
  perform public.arcade_snake_leave_existing_rooms(v_uid);
  v_player_name := public.arcade_snake_display_name(v_uid);

  insert into public.arcade_snake_rooms (
    room_name,
    room_kind,
    host_player_id,
    host_player_name,
    max_players,
    player_count,
    status,
    map_theme,
    updated_at
  ) values (
    v_name,
    'public',
    v_uid,
    v_player_name,
    p_max_players,
    1,
    'waiting',
    'neon-city',
    now()
  )
  returning * into v_room;

  insert into public.arcade_snake_room_members (
    room_id,
    player_id,
    player_name,
    skin,
    is_host,
    last_seen_at
  ) values (
    v_room.id,
    v_uid,
    v_player_name,
    public.arcade_snake_validate_skin(p_skin),
    true,
    now()
  );

  return query select * from public.arcade_snake_rooms where id = v_room.id;
end;
$$;

create or replace function public.arcade_snake_join_room(
  p_room_id uuid,
  p_skin text
)
returns setof public.arcade_snake_rooms
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_player_name text;
  v_room public.arcade_snake_rooms;
  v_count integer;
begin
  if v_uid is null then
    raise exception 'You must be signed in to join an online snake room.';
  end if;

  perform public.arcade_snake_cleanup_rooms();

  select * into v_room
  from public.arcade_snake_rooms
  where id = p_room_id
  for update;

  if not found or v_room.status = 'closed' then
    raise exception 'This snake room is no longer available.';
  end if;

  if exists (
    select 1 from public.arcade_snake_room_members
    where room_id = v_room.id and player_id = v_uid
  ) then
    update public.arcade_snake_room_members
    set last_seen_at = now(), skin = public.arcade_snake_validate_skin(p_skin)
    where room_id = v_room.id and player_id = v_uid;
    return query select * from public.arcade_snake_rooms where id = v_room.id;
    return;
  end if;

  select count(*)::integer into v_count
  from public.arcade_snake_room_members
  where room_id = v_room.id
    and last_seen_at > now() - interval '45 seconds';

  if v_count >= v_room.max_players then
    raise exception 'This snake room is full.';
  end if;

  perform public.arcade_snake_leave_existing_rooms(v_uid);
  v_player_name := public.arcade_snake_display_name(v_uid);

  insert into public.arcade_snake_room_members (
    room_id,
    player_id,
    player_name,
    skin,
    is_host,
    last_seen_at
  ) values (
    v_room.id,
    v_uid,
    v_player_name,
    public.arcade_snake_validate_skin(p_skin),
    false,
    now()
  )
  on conflict (room_id, player_id) do update
  set player_name = excluded.player_name,
      skin = excluded.skin,
      last_seen_at = now();

  update public.arcade_snake_rooms
  set
    player_count = v_count + 1,
    status = 'active',
    updated_at = now()
  where id = v_room.id;

  return query select * from public.arcade_snake_rooms where id = v_room.id;
end;
$$;

create or replace function public.arcade_snake_matchmake(p_skin text)
returns setof public.arcade_snake_rooms
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_player_name text;
  v_room public.arcade_snake_rooms;
begin
  if v_uid is null then
    raise exception 'You must be signed in to use snake matchmaking.';
  end if;

  perform public.arcade_snake_cleanup_rooms();

  select room.* into v_room
  from public.arcade_snake_rooms room
  where room.status in ('waiting', 'active')
    and room.player_count < room.max_players
    and room.updated_at > now() - interval '2 minutes'
    and not exists (
      select 1 from public.arcade_snake_room_members member
      where member.room_id = room.id and member.player_id = v_uid
    )
  order by
    case when room.room_kind = 'matchmaking' then 0 else 1 end,
    room.player_count desc,
    room.created_at asc
  limit 1
  for update skip locked;

  if found then
    return query
    select * from public.arcade_snake_join_room(v_room.id, p_skin);
    return;
  end if;

  perform public.arcade_snake_leave_existing_rooms(v_uid);
  v_player_name := public.arcade_snake_display_name(v_uid);

  insert into public.arcade_snake_rooms (
    room_name,
    room_kind,
    host_player_id,
    host_player_name,
    max_players,
    player_count,
    status,
    map_theme,
    updated_at
  ) values (
    'Quick Arena • ' || left(v_player_name, 24),
    'matchmaking',
    v_uid,
    v_player_name,
    16,
    1,
    'waiting',
    'neon-city',
    now()
  )
  returning * into v_room;

  insert into public.arcade_snake_room_members (
    room_id,
    player_id,
    player_name,
    skin,
    is_host,
    last_seen_at
  ) values (
    v_room.id,
    v_uid,
    v_player_name,
    public.arcade_snake_validate_skin(p_skin),
    true,
    now()
  );

  return query select * from public.arcade_snake_rooms where id = v_room.id;
end;
$$;

create or replace function public.arcade_snake_touch_room(p_room_id uuid)
returns setof public.arcade_snake_rooms
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then
    raise exception 'You must be signed in.';
  end if;

  update public.arcade_snake_room_members
  set last_seen_at = now()
  where room_id = p_room_id and player_id = v_uid;

  if not found then
    raise exception 'You are no longer a member of this snake room.';
  end if;

  delete from public.arcade_snake_room_members
  where room_id = p_room_id
    and last_seen_at <= now() - interval '45 seconds';

  select count(*)::integer into v_count
  from public.arcade_snake_room_members
  where room_id = p_room_id;

  update public.arcade_snake_rooms
  set
    player_count = v_count,
    status = case when v_count = 0 then 'closed' when v_count >= 2 then 'active' else 'waiting' end,
    updated_at = now()
  where id = p_room_id;

  perform public.arcade_snake_cleanup_rooms();

  return query
  select * from public.arcade_snake_rooms
  where id = p_room_id
    and exists (
      select 1 from public.arcade_snake_room_members member
      where member.room_id = p_room_id and member.player_id = v_uid
    );
end;
$$;

create or replace function public.arcade_snake_leave_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then
    return;
  end if;

  delete from public.arcade_snake_room_members
  where room_id = p_room_id and player_id = v_uid;

  select count(*)::integer into v_count
  from public.arcade_snake_room_members
  where room_id = p_room_id;

  update public.arcade_snake_rooms
  set
    player_count = v_count,
    status = case when v_count = 0 then 'closed' when v_count >= 2 then 'active' else 'waiting' end,
    updated_at = now()
  where id = p_room_id;

  perform public.arcade_snake_cleanup_rooms();
end;
$$;

revoke all on function public.arcade_snake_display_name(uuid) from public;
revoke all on function public.arcade_snake_validate_skin(text) from public;
revoke all on function public.arcade_snake_cleanup_rooms() from public;
revoke all on function public.arcade_snake_leave_existing_rooms(uuid) from public;
revoke all on function public.arcade_snake_create_room(text, integer, text) from public;
revoke all on function public.arcade_snake_join_room(uuid, text) from public;
revoke all on function public.arcade_snake_matchmake(text) from public;
revoke all on function public.arcade_snake_touch_room(uuid) from public;
revoke all on function public.arcade_snake_leave_room(uuid) from public;

grant execute on function public.arcade_snake_create_room(text, integer, text) to authenticated;
grant execute on function public.arcade_snake_join_room(uuid, text) to authenticated;
grant execute on function public.arcade_snake_matchmake(text) to authenticated;
grant execute on function public.arcade_snake_touch_room(uuid) to authenticated;
grant execute on function public.arcade_snake_leave_room(uuid) to authenticated;

-- Room list changes update immediately in the lobby. Safe to re-run.
do $$
begin
  alter publication supabase_realtime add table public.arcade_snake_rooms;
exception
  when duplicate_object then null;
end;
$$;

commit;

select 'arcade_cp_snake_neon_rush_v54_ready' as status;

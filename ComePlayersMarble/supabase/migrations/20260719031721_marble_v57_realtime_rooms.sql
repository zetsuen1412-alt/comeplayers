-- ComePlayers Marble V57: secure room registry for Supabase Realtime Broadcast + Presence.
-- This migration is intentionally limited to authenticated users (including Supabase anonymous auth users).

create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table if not exists public.marble_realtime_rooms (
    id uuid primary key default gen_random_uuid(),
    invite_code text not null unique check (invite_code ~ '^[A-Z0-9]{6}$'),
    topic text not null unique check (topic ~ '^marble-room:[0-9a-f-]{36}$'),
    host_user_id uuid not null references auth.users(id) on delete cascade,
    mode text not null check (mode in ('SOLO', 'TEAM')),
    phase text not null default 'LOBBY' check (phase in ('LOBBY', 'MATCH', 'CLOSED')),
    settings jsonb not null default '{}'::jsonb,
    max_players smallint not null default 4 check (max_players between 2 and 4),
    max_spectators smallint not null default 2 check (max_spectators between 0 and 2),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    expires_at timestamptz not null default (now() + interval '2 hours')
);

create table if not exists public.marble_realtime_room_members (
    room_id uuid not null references public.marble_realtime_rooms(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    profile_id text not null check (char_length(profile_id) between 1 and 48),
    display_name text not null check (char_length(display_name) between 1 and 24),
    role text not null default 'PLAYER' check (role in ('PLAYER', 'SPECTATOR')),
    ready boolean not null default false,
    team_id text null check (team_id is null or team_id in ('BLUE', 'GOLD')),
    connected boolean not null default true,
    joined_at timestamptz not null default now(),
    last_seen_at timestamptz not null default now(),
    primary key (room_id, user_id)
);

create index if not exists marble_realtime_rooms_invite_lookup
    on public.marble_realtime_rooms (invite_code)
    where phase = 'LOBBY';

create index if not exists marble_realtime_room_members_user_lookup
    on public.marble_realtime_room_members (user_id, room_id);

alter table public.marble_realtime_rooms enable row level security;
alter table public.marble_realtime_room_members enable row level security;

revoke all on public.marble_realtime_rooms from anon, authenticated;
revoke all on public.marble_realtime_room_members from anon, authenticated;
grant select, insert, update, delete on public.marble_realtime_rooms to authenticated;
grant select, insert, update, delete on public.marble_realtime_room_members to authenticated;

create or replace function private.marble_is_room_member(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select (select auth.uid()) is not null
       and exists (
            select 1
            from public.marble_realtime_room_members member
            where member.room_id = target_room_id
              and member.user_id = (select auth.uid())
       );
$$;

create or replace function private.marble_is_room_host(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select (select auth.uid()) is not null
       and exists (
            select 1
            from public.marble_realtime_rooms room
            where room.id = target_room_id
              and room.host_user_id = (select auth.uid())
       );
$$;

create or replace function private.marble_can_access_topic(requested_topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select (select auth.uid()) is not null
       and exists (
            select 1
            from public.marble_realtime_rooms room
            join public.marble_realtime_room_members member on member.room_id = room.id
            where room.topic = requested_topic
              and room.phase <> 'CLOSED'
              and room.expires_at > now()
              and member.user_id = (select auth.uid())
       );
$$;

revoke all on function private.marble_is_room_member(uuid) from public;
revoke all on function private.marble_is_room_host(uuid) from public;
revoke all on function private.marble_can_access_topic(text) from public;
grant execute on function private.marble_is_room_member(uuid) to authenticated;
grant execute on function private.marble_is_room_host(uuid) to authenticated;
grant execute on function private.marble_can_access_topic(text) to authenticated;

drop policy if exists "marble members can read rooms" on public.marble_realtime_rooms;
create policy "marble members can read rooms"
on public.marble_realtime_rooms
for select
to authenticated
using ((select private.marble_is_room_member(id)));

drop policy if exists "marble hosts can update rooms" on public.marble_realtime_rooms;
create policy "marble hosts can update rooms"
on public.marble_realtime_rooms
for update
to authenticated
using ((select private.marble_is_room_host(id)))
with check ((select private.marble_is_room_host(id)));

drop policy if exists "marble hosts can delete rooms" on public.marble_realtime_rooms;
create policy "marble hosts can delete rooms"
on public.marble_realtime_rooms
for delete
to authenticated
using ((select private.marble_is_room_host(id)));

drop policy if exists "marble members can read memberships" on public.marble_realtime_room_members;
create policy "marble members can read memberships"
on public.marble_realtime_room_members
for select
to authenticated
using ((select private.marble_is_room_member(room_id)));

drop policy if exists "marble members can update own membership" on public.marble_realtime_room_members;
create policy "marble members can update own membership"
on public.marble_realtime_room_members
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "marble members can leave room" on public.marble_realtime_room_members;
create policy "marble members can leave room"
on public.marble_realtime_room_members
for delete
to authenticated
using ((select auth.uid()) = user_id);

create or replace function public.create_marble_realtime_room(
    p_profile_id text,
    p_display_name text,
    p_mode text default 'SOLO',
    p_settings jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_user_id uuid := (select auth.uid());
    v_room public.marble_realtime_rooms%rowtype;
    v_invite text;
    v_attempt integer := 0;
begin
    if v_user_id is null then
        raise exception 'Authentication is required.' using errcode = '42501';
    end if;
    if p_mode not in ('SOLO', 'TEAM') then
        raise exception 'Invalid match mode.' using errcode = '22023';
    end if;

    loop
        v_attempt := v_attempt + 1;
        v_invite := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 6));
        begin
            insert into public.marble_realtime_rooms (
                invite_code,
                topic,
                host_user_id,
                mode,
                settings
            ) values (
                v_invite,
                'marble-room:' || gen_random_uuid()::text,
                v_user_id,
                p_mode,
                coalesce(p_settings, '{}'::jsonb)
            )
            returning * into v_room;
            exit;
        exception when unique_violation then
            if v_attempt >= 5 then
                raise;
            end if;
        end;
    end loop;

    insert into public.marble_realtime_room_members (
        room_id,
        user_id,
        profile_id,
        display_name,
        role,
        ready,
        team_id
    ) values (
        v_room.id,
        v_user_id,
        left(regexp_replace(coalesce(p_profile_id, ''), '[^A-Za-z0-9_.:-]', '', 'g'), 48),
        left(regexp_replace(coalesce(p_display_name, 'ComePlayers Host'), E'[\\r\\n\\t]+', ' ', 'g'), 24),
        'PLAYER',
        true,
        case when p_mode = 'TEAM' then 'BLUE' else null end
    );

    return jsonb_build_object(
        'roomId', v_room.id::text,
        'inviteCode', v_room.invite_code,
        'topic', v_room.topic,
        'hostUserId', v_room.host_user_id::text,
        'mode', v_room.mode,
        'phase', v_room.phase,
        'maxPlayers', v_room.max_players,
        'maxSpectators', v_room.max_spectators,
        'createdAt', (extract(epoch from v_room.created_at) * 1000)::bigint,
        'updatedAt', (extract(epoch from v_room.updated_at) * 1000)::bigint,
        'expiresAt', (extract(epoch from v_room.expires_at) * 1000)::bigint
    );
end;
$$;

create or replace function public.join_marble_realtime_room(
    p_invite_code text,
    p_profile_id text,
    p_display_name text,
    p_role text default 'PLAYER'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_user_id uuid := (select auth.uid());
    v_room public.marble_realtime_rooms%rowtype;
    v_role text := case when p_role = 'SPECTATOR' then 'SPECTATOR' else 'PLAYER' end;
    v_role_count integer;
    v_player_position integer;
begin
    if v_user_id is null then
        raise exception 'Authentication is required.' using errcode = '42501';
    end if;

    select * into v_room
    from public.marble_realtime_rooms room
    where room.invite_code = upper(regexp_replace(coalesce(p_invite_code, ''), '[^A-Z0-9]', '', 'g'))
      and room.phase = 'LOBBY'
      and room.expires_at > now()
    for update;

    if not found then
        raise exception 'Room code is invalid or expired.' using errcode = 'P0002';
    end if;

    select count(*) into v_role_count
    from public.marble_realtime_room_members member
    where member.room_id = v_room.id
      and member.role = v_role;

    if v_role = 'PLAYER' and v_role_count >= v_room.max_players then
        raise exception 'All player slots are full.' using errcode = 'P0001';
    end if;
    if v_role = 'SPECTATOR' and v_role_count >= v_room.max_spectators then
        raise exception 'All spectator slots are full.' using errcode = 'P0001';
    end if;

    select count(*) into v_player_position
    from public.marble_realtime_room_members member
    where member.room_id = v_room.id
      and member.role = 'PLAYER';

    insert into public.marble_realtime_room_members (
        room_id,
        user_id,
        profile_id,
        display_name,
        role,
        ready,
        team_id,
        connected,
        last_seen_at
    ) values (
        v_room.id,
        v_user_id,
        left(regexp_replace(coalesce(p_profile_id, ''), '[^A-Za-z0-9_.:-]', '', 'g'), 48),
        left(regexp_replace(coalesce(p_display_name, 'ComePlayers Guest'), E'[\\r\\n\\t]+', ' ', 'g'), 24),
        v_role,
        v_role = 'SPECTATOR',
        case when v_room.mode = 'TEAM' and v_role = 'PLAYER'
            then case when (v_player_position % 2) = 0 then 'BLUE' else 'GOLD' end
            else null
        end,
        true,
        now()
    )
    on conflict (room_id, user_id) do update set
        profile_id = excluded.profile_id,
        display_name = excluded.display_name,
        role = excluded.role,
        connected = true,
        last_seen_at = now();

    update public.marble_realtime_rooms
    set updated_at = now(),
        expires_at = now() + interval '2 hours'
    where id = v_room.id
    returning * into v_room;

    return jsonb_build_object(
        'roomId', v_room.id::text,
        'inviteCode', v_room.invite_code,
        'topic', v_room.topic,
        'hostUserId', v_room.host_user_id::text,
        'mode', v_room.mode,
        'phase', v_room.phase,
        'maxPlayers', v_room.max_players,
        'maxSpectators', v_room.max_spectators,
        'createdAt', (extract(epoch from v_room.created_at) * 1000)::bigint,
        'updatedAt', (extract(epoch from v_room.updated_at) * 1000)::bigint,
        'expiresAt', (extract(epoch from v_room.expires_at) * 1000)::bigint
    );
end;
$$;

revoke all on function public.create_marble_realtime_room(text, text, text, jsonb) from public, anon;
revoke all on function public.join_marble_realtime_room(text, text, text, text) from public, anon;
grant execute on function public.create_marble_realtime_room(text, text, text, jsonb) to authenticated;
grant execute on function public.join_marble_realtime_room(text, text, text, text) to authenticated;

alter table realtime.messages enable row level security;

drop policy if exists "marble room members receive realtime" on realtime.messages;
create policy "marble room members receive realtime"
on realtime.messages
for select
to authenticated
using (
    realtime.messages.extension in ('broadcast', 'presence')
    and (select private.marble_can_access_topic((select realtime.topic())))
);

drop policy if exists "marble room members send realtime" on realtime.messages;
create policy "marble room members send realtime"
on realtime.messages
for insert
to authenticated
with check (
    realtime.messages.extension in ('broadcast', 'presence')
    and (select private.marble_can_access_topic((select realtime.topic())))
);

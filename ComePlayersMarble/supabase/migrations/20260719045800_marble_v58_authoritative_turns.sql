-- ComePlayers Marble V58: authoritative dice, turn sequencing, revisions, idempotency, and append-only events.
-- Apply after 20260719031721_marble_v57_realtime_rooms.sql.

create table if not exists public.marble_authoritative_matches (
    id uuid primary key default gen_random_uuid(),
    room_id uuid not null unique references public.marble_realtime_rooms(id) on delete cascade,
    topic text not null check (topic ~ '^marble-room:[0-9a-f-]{36}$'),
    phase text not null default 'WAITING' check (phase in ('WAITING', 'ACTIVE', 'FINISHED')),
    revision bigint not null default 0 check (revision >= 0),
    round integer not null default 1 check (round between 1 and 999),
    current_turn_seat smallint not null default 0 check (current_turn_seat between 0 and 3),
    board_size smallint not null default 32 check (board_size between 16 and 64),
    state jsonb not null default '{"awaitingEndTurn":false,"lastDice":null}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.marble_authoritative_match_players (
    match_id uuid not null references public.marble_authoritative_matches(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    profile_id text not null check (char_length(profile_id) between 1 and 48),
    display_name text not null check (char_length(display_name) between 1 and 24),
    seat smallint not null check (seat between 0 and 3),
    team_id text null check (team_id is null or team_id in ('BLUE', 'GOLD')),
    position smallint not null default 0 check (position between 0 and 63),
    money bigint not null default 2000000 check (money >= 0),
    bankrupt boolean not null default false,
    primary key (match_id, user_id),
    unique (match_id, seat)
);

create table if not exists public.marble_authoritative_match_events (
    match_id uuid not null references public.marble_authoritative_matches(id) on delete cascade,
    sequence bigint not null check (sequence > 0),
    kind text not null check (kind in ('MATCH_STARTED', 'DICE_ROLLED', 'TURN_ENDED', 'MATCH_FINISHED')),
    actor_user_id uuid null references auth.users(id) on delete set null,
    actor_profile_id text not null default '',
    payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    primary key (match_id, sequence)
);

create table if not exists public.marble_authoritative_match_commands (
    id uuid primary key default gen_random_uuid(),
    match_id uuid not null references public.marble_authoritative_matches(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    idempotency_key text not null check (char_length(idempotency_key) between 8 and 80),
    command text not null check (command in ('ROLL', 'END_TURN')),
    expected_revision bigint not null check (expected_revision >= 0),
    result jsonb not null,
    created_at timestamptz not null default now(),
    unique (match_id, user_id, idempotency_key)
);

create index if not exists marble_authoritative_players_user_idx
    on public.marble_authoritative_match_players (user_id, match_id);
create index if not exists marble_authoritative_events_recent_idx
    on public.marble_authoritative_match_events (match_id, sequence desc);

alter table public.marble_authoritative_matches enable row level security;
alter table public.marble_authoritative_match_players enable row level security;
alter table public.marble_authoritative_match_events enable row level security;
alter table public.marble_authoritative_match_commands enable row level security;

revoke all on public.marble_authoritative_matches from anon, authenticated;
revoke all on public.marble_authoritative_match_players from anon, authenticated;
revoke all on public.marble_authoritative_match_events from anon, authenticated;
revoke all on public.marble_authoritative_match_commands from anon, authenticated;
grant select on public.marble_authoritative_matches to authenticated;
grant select on public.marble_authoritative_match_players to authenticated;
grant select on public.marble_authoritative_match_events to authenticated;

create or replace function private.marble_authoritative_snapshot(target_match_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
    select jsonb_build_object(
        'matchId', match.id::text,
        'roomId', match.room_id::text,
        'topic', match.topic,
        'phase', match.phase,
        'revision', match.revision,
        'round', match.round,
        'currentTurnSeat', match.current_turn_seat,
        'currentTurnProfileId', coalesce(current_player.profile_id, ''),
        'awaitingEndTurn', coalesce((match.state ->> 'awaitingEndTurn')::boolean, false),
        'lastDice', match.state -> 'lastDice',
        'lastEventSequence', coalesce((
            select max(event.sequence)
            from public.marble_authoritative_match_events event
            where event.match_id = match.id
        ), 0),
        'players', coalesce((
            select jsonb_agg(jsonb_build_object(
                'profileId', player.profile_id,
                'displayName', player.display_name,
                'seat', player.seat,
                'teamId', player.team_id,
                'position', player.position,
                'money', player.money,
                'bankrupt', player.bankrupt
            ) order by player.seat)
            from public.marble_authoritative_match_players player
            where player.match_id = match.id
        ), '[]'::jsonb),
        'updatedAt', (extract(epoch from match.updated_at) * 1000)::bigint
    )
    from public.marble_authoritative_matches match
    left join public.marble_authoritative_match_players current_player
      on current_player.match_id = match.id
     and current_player.seat = match.current_turn_seat
    where match.id = target_match_id;
$$;

revoke all on function private.marble_authoritative_snapshot(uuid) from public;

create or replace function public.start_marble_authoritative_match(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_user_id uuid := (select auth.uid());
    v_room public.marble_realtime_rooms%rowtype;
    v_match public.marble_authoritative_matches%rowtype;
    v_player_count integer;
    v_sequence bigint;
begin
    if v_user_id is null then
        raise exception 'Authentication is required.' using errcode = '42501';
    end if;

    select * into v_room
    from public.marble_realtime_rooms room
    where room.id = p_room_id
    for update;

    if not found or v_room.host_user_id <> v_user_id then
        raise exception 'Only the room host can start the authoritative match.' using errcode = '42501';
    end if;

    select * into v_match
    from public.marble_authoritative_matches match
    where match.room_id = v_room.id
    for update;

    if found then
        return private.marble_authoritative_snapshot(v_match.id);
    end if;

    select count(*) into v_player_count
    from public.marble_realtime_room_members member
    where member.room_id = v_room.id
      and member.role = 'PLAYER'
      and member.ready = true
      and member.connected = true;

    if v_player_count < 2 then
        raise exception 'At least two connected and ready players are required.' using errcode = '22023';
    end if;

    insert into public.marble_authoritative_matches (room_id, topic, phase)
    values (v_room.id, v_room.topic, 'ACTIVE')
    returning * into v_match;

    insert into public.marble_authoritative_match_players (
        match_id, user_id, profile_id, display_name, seat, team_id
    )
    select
        v_match.id,
        member.user_id,
        member.profile_id,
        member.display_name,
        (row_number() over (order by member.joined_at, member.user_id) - 1)::smallint,
        member.team_id
    from public.marble_realtime_room_members member
    where member.room_id = v_room.id
      and member.role = 'PLAYER'
      and member.ready = true
      and member.connected = true
    order by member.joined_at, member.user_id
    limit 4;

    update public.marble_realtime_rooms
    set phase = 'MATCH', updated_at = now(), expires_at = now() + interval '3 hours'
    where id = v_room.id;

    v_sequence := 1;
    insert into public.marble_authoritative_match_events (
        match_id, sequence, kind, actor_user_id, actor_profile_id, payload
    ) values (
        v_match.id,
        v_sequence,
        'MATCH_STARTED',
        v_user_id,
        coalesce((select profile_id from public.marble_authoritative_match_players where match_id = v_match.id and user_id = v_user_id), ''),
        jsonb_build_object('roomId', v_room.id::text, 'playerCount', v_player_count)
    );

    return private.marble_authoritative_snapshot(v_match.id);
end;
$$;

create or replace function public.get_marble_authoritative_match(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_user_id uuid := (select auth.uid());
    v_match_id uuid;
begin
    if v_user_id is null then
        raise exception 'Authentication is required.' using errcode = '42501';
    end if;
    if not (select private.marble_is_room_member(p_room_id)) then
        raise exception 'Room membership is required.' using errcode = '42501';
    end if;
    select match.id into v_match_id
    from public.marble_authoritative_matches match
    where match.room_id = p_room_id;
    if v_match_id is null then
        raise exception 'No authoritative match exists for this room.' using errcode = 'P0002';
    end if;
    return private.marble_authoritative_snapshot(v_match_id);
end;
$$;

create or replace function public.submit_marble_authoritative_command(
    p_match_id uuid,
    p_command text,
    p_expected_revision bigint,
    p_idempotency_key text,
    p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_user_id uuid := (select auth.uid());
    v_match public.marble_authoritative_matches%rowtype;
    v_player public.marble_authoritative_match_players%rowtype;
    v_existing jsonb;
    v_snapshot jsonb;
    v_sequence bigint;
    v_first integer;
    v_second integer;
    v_total integer;
    v_old_position integer;
    v_new_position integer;
    v_passed_start boolean;
    v_player_count integer;
    v_next_seat integer;
    v_next_round integer;
    v_is_double boolean;
begin
    if v_user_id is null then
        raise exception 'Authentication is required.' using errcode = '42501';
    end if;
    if p_command not in ('ROLL', 'END_TURN') then
        raise exception 'Unsupported authoritative command.' using errcode = '22023';
    end if;
    if p_idempotency_key !~ '^[A-Za-z0-9_-]{8,80}$' then
        raise exception 'Invalid idempotency key.' using errcode = '22023';
    end if;

    select command.result into v_existing
    from public.marble_authoritative_match_commands command
    where command.match_id = p_match_id
      and command.user_id = v_user_id
      and command.idempotency_key = p_idempotency_key;
    if v_existing is not null then
        return v_existing;
    end if;

    select * into v_match
    from public.marble_authoritative_matches match
    where match.id = p_match_id
    for update;
    if not found then
        raise exception 'Authoritative match was not found.' using errcode = 'P0002';
    end if;
    if v_match.phase <> 'ACTIVE' then
        raise exception 'The authoritative match is not active.' using errcode = '55000';
    end if;
    if v_match.revision <> p_expected_revision then
        raise exception 'Revision conflict. Refresh authoritative state.' using errcode = '40001';
    end if;

    select * into v_player
    from public.marble_authoritative_match_players player
    where player.match_id = v_match.id
      and player.user_id = v_user_id;
    if not found then
        raise exception 'Only match players can submit commands.' using errcode = '42501';
    end if;
    if v_player.seat <> v_match.current_turn_seat then
        raise exception 'It is not your authoritative turn.' using errcode = '42501';
    end if;

    select coalesce(max(event.sequence), 0) + 1 into v_sequence
    from public.marble_authoritative_match_events event
    where event.match_id = v_match.id;

    if p_command = 'ROLL' then
        if coalesce((v_match.state ->> 'awaitingEndTurn')::boolean, false) then
            raise exception 'End the current turn before rolling again.' using errcode = '55000';
        end if;
        v_first := 1 + (get_byte(gen_random_bytes(1), 0) % 6);
        v_second := 1 + (get_byte(gen_random_bytes(1), 0) % 6);
        v_total := v_first + v_second;
        v_old_position := v_player.position;
        v_new_position := (v_old_position + v_total) % v_match.board_size;
        v_passed_start := (v_old_position + v_total) >= v_match.board_size;

        update public.marble_authoritative_match_players
        set position = v_new_position,
            money = money + case when v_passed_start then 200000 else 0 end
        where match_id = v_match.id and user_id = v_user_id;

        update public.marble_authoritative_matches
        set revision = revision + 1,
            state = jsonb_build_object(
                'awaitingEndTurn', true,
                'lastDice', jsonb_build_object(
                    'first', v_first,
                    'second', v_second,
                    'total', v_total,
                    'isDouble', v_first = v_second
                )
            ),
            updated_at = now()
        where id = v_match.id;

        insert into public.marble_authoritative_match_events (
            match_id, sequence, kind, actor_user_id, actor_profile_id, payload
        ) values (
            v_match.id, v_sequence, 'DICE_ROLLED', v_user_id, v_player.profile_id,
            jsonb_build_object(
                'first', v_first,
                'second', v_second,
                'total', v_total,
                'isDouble', v_first = v_second,
                'from', v_old_position,
                'to', v_new_position,
                'passedStart', v_passed_start
            )
        );
    else
        if not coalesce((v_match.state ->> 'awaitingEndTurn')::boolean, false) then
            raise exception 'Roll before ending the authoritative turn.' using errcode = '55000';
        end if;
        v_is_double := coalesce((v_match.state -> 'lastDice' ->> 'isDouble')::boolean, false);
        select count(*) into v_player_count
        from public.marble_authoritative_match_players player
        where player.match_id = v_match.id and player.bankrupt = false;
        if v_player_count < 2 then
            update public.marble_authoritative_matches
            set phase = 'FINISHED', revision = revision + 1, updated_at = now()
            where id = v_match.id;
            insert into public.marble_authoritative_match_events (
                match_id, sequence, kind, actor_user_id, actor_profile_id, payload
            ) values (v_match.id, v_sequence, 'MATCH_FINISHED', v_user_id, v_player.profile_id, '{}'::jsonb);
        else
            v_next_seat := case when v_is_double then v_match.current_turn_seat else (v_match.current_turn_seat + 1) % v_player_count end;
            v_next_round := v_match.round + case when not v_is_double and v_next_seat = 0 then 1 else 0 end;
            update public.marble_authoritative_matches
            set revision = revision + 1,
                round = v_next_round,
                current_turn_seat = v_next_seat,
                state = jsonb_build_object('awaitingEndTurn', false, 'lastDice', v_match.state -> 'lastDice'),
                updated_at = now()
            where id = v_match.id;
            insert into public.marble_authoritative_match_events (
                match_id, sequence, kind, actor_user_id, actor_profile_id, payload
            ) values (
                v_match.id, v_sequence, 'TURN_ENDED', v_user_id, v_player.profile_id,
                jsonb_build_object('extraTurn', v_is_double, 'nextSeat', v_next_seat, 'round', v_next_round)
            );
        end if;
    end if;

    v_snapshot := private.marble_authoritative_snapshot(v_match.id);
    insert into public.marble_authoritative_match_commands (
        match_id, user_id, idempotency_key, command, expected_revision, result
    ) values (
        v_match.id, v_user_id, p_idempotency_key, p_command, p_expected_revision, v_snapshot
    );
    return v_snapshot;
end;
$$;

revoke all on function public.start_marble_authoritative_match(uuid) from public, anon;
revoke all on function public.get_marble_authoritative_match(uuid) from public, anon;
revoke all on function public.submit_marble_authoritative_command(uuid, text, bigint, text, jsonb) from public, anon;
grant execute on function public.start_marble_authoritative_match(uuid) to authenticated;
grant execute on function public.get_marble_authoritative_match(uuid) to authenticated;
grant execute on function public.submit_marble_authoritative_command(uuid, text, bigint, text, jsonb) to authenticated;

drop policy if exists "marble room members read authoritative matches" on public.marble_authoritative_matches;
create policy "marble room members read authoritative matches"
on public.marble_authoritative_matches for select to authenticated
using ((select private.marble_is_room_member(room_id)));

drop policy if exists "marble match players read authoritative players" on public.marble_authoritative_match_players;
create policy "marble match players read authoritative players"
on public.marble_authoritative_match_players for select to authenticated
using (exists (
    select 1 from public.marble_authoritative_matches match
    where match.id = match_id
      and (select private.marble_is_room_member(match.room_id))
));

drop policy if exists "marble room members read authoritative events" on public.marble_authoritative_match_events;
create policy "marble room members read authoritative events"
on public.marble_authoritative_match_events for select to authenticated
using (exists (
    select 1 from public.marble_authoritative_matches match
    where match.id = match_id
      and (select private.marble_is_room_member(match.room_id))
));

create or replace function private.broadcast_marble_authoritative_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_topic text;
    v_payload jsonb;
begin
    select match.topic into v_topic
    from public.marble_authoritative_matches match
    where match.id = new.match_id;
    v_payload := jsonb_build_object(
        'matchId', new.match_id::text,
        'sequence', new.sequence,
        'kind', new.kind,
        'actorProfileId', new.actor_profile_id,
        'payload', new.payload,
        'createdAt', (extract(epoch from new.created_at) * 1000)::bigint
    );
    perform realtime.send(v_payload, 'match_event', v_topic, true);
    return new;
end;
$$;

revoke all on function private.broadcast_marble_authoritative_event() from public;

drop trigger if exists broadcast_marble_authoritative_event on public.marble_authoritative_match_events;
create trigger broadcast_marble_authoritative_event
after insert on public.marble_authoritative_match_events
for each row execute function private.broadcast_marble_authoritative_event();

-- ComePlayers Marble V65: server ranked matchmaking, competitive profiles, and 4/8-player tournament brackets.
-- Apply after 20260720123000_marble_v64_replay_studio.sql.
-- Direct table access is intentionally revoked. Authenticated clients use bounded RPC functions only.

create table if not exists public.marble_competitive_profiles (
    user_id uuid primary key references auth.users(id) on delete cascade,
    profile_id text not null check (char_length(profile_id) between 1 and 48),
    display_name text not null check (char_length(display_name) between 1 and 24),
    rating integer not null default 1000 check (rating between 0 and 10000),
    season_points integer not null default 0 check (season_points >= 0),
    wins integer not null default 0 check (wins >= 0),
    losses integer not null default 0 check (losses >= 0),
    streak integer not null default 0 check (streak >= 0),
    best_streak integer not null default 0 check (best_streak >= 0),
    tournament_wins integer not null default 0 check (tournament_wins >= 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.marble_ranked_queue (
    user_id uuid primary key references auth.users(id) on delete cascade,
    profile_id text not null check (char_length(profile_id) between 1 and 48),
    display_name text not null check (char_length(display_name) between 1 and 24),
    mode text not null check (mode in ('SOLO', 'TEAM')),
    region text not null default 'GLOBAL' check (region ~ '^[A-Z0-9_-]{1,16}$'),
    rating integer not null check (rating between 0 and 10000),
    status text not null default 'SEARCHING' check (status in ('SEARCHING', 'MATCHED', 'CANCELLED', 'EXPIRED')),
    matched_room_id uuid null references public.marble_realtime_rooms(id) on delete set null,
    queued_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    expires_at timestamptz not null default (now() + interval '10 minutes')
);

create table if not exists public.marble_competitive_results (
    match_id uuid primary key references public.marble_authoritative_matches(id) on delete cascade,
    room_id uuid not null unique references public.marble_realtime_rooms(id) on delete cascade,
    mode text not null check (mode in ('SOLO', 'TEAM')),
    winner_profile_id text not null default '',
    winner_team_id text not null default '' check (winner_team_id in ('', 'BLUE', 'GOLD')),
    finalized_by uuid not null references auth.users(id) on delete restrict,
    finalized_at timestamptz not null default now()
);

create table if not exists public.marble_tournaments (
    id uuid primary key default gen_random_uuid(),
    tournament_code text not null unique check (tournament_code ~ '^[A-Z0-9]{8}$'),
    host_user_id uuid not null references auth.users(id) on delete cascade,
    host_profile_id text not null check (char_length(host_profile_id) between 1 and 48),
    name text not null check (char_length(name) between 1 and 48),
    status text not null default 'OPEN' check (status in ('OPEN', 'ACTIVE', 'FINISHED', 'CANCELLED')),
    capacity smallint not null check (capacity in (4, 8)),
    entry_count smallint not null default 0 check (entry_count between 0 and 8),
    current_round smallint not null default 0 check (current_round between 0 and 3),
    total_rounds smallint not null check (total_rounds in (2, 3)),
    champion_user_id uuid null references auth.users(id) on delete set null,
    champion_profile_id text not null default '',
    champion_display_name text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.marble_tournament_entries (
    tournament_id uuid not null references public.marble_tournaments(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    profile_id text not null check (char_length(profile_id) between 1 and 48),
    display_name text not null check (char_length(display_name) between 1 and 24),
    seed smallint not null default 0 check (seed between 0 and 8),
    eliminated boolean not null default false,
    joined_at timestamptz not null default now(),
    primary key (tournament_id, user_id),
    unique (tournament_id, profile_id)
);

create table if not exists public.marble_tournament_matches (
    id uuid primary key default gen_random_uuid(),
    tournament_id uuid not null references public.marble_tournaments(id) on delete cascade,
    round_number smallint not null check (round_number between 1 and 3),
    slot_number smallint not null check (slot_number between 1 and 4),
    player_one_user_id uuid null references auth.users(id) on delete set null,
    player_two_user_id uuid null references auth.users(id) on delete set null,
    winner_user_id uuid null references auth.users(id) on delete set null,
    room_id uuid null references public.marble_realtime_rooms(id) on delete set null,
    status text not null default 'PENDING' check (status in ('PENDING', 'READY', 'ACTIVE', 'FINISHED', 'BYE')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (tournament_id, round_number, slot_number)
);

create index if not exists marble_ranked_queue_search_idx
    on public.marble_ranked_queue (mode, region, status, queued_at)
    where status = 'SEARCHING';
create index if not exists marble_competitive_profiles_rating_idx
    on public.marble_competitive_profiles (rating desc, wins desc, updated_at asc);
create index if not exists marble_tournaments_browser_idx
    on public.marble_tournaments (status, created_at desc);
create index if not exists marble_tournament_entries_user_idx
    on public.marble_tournament_entries (user_id, joined_at desc);
create index if not exists marble_tournament_matches_progress_idx
    on public.marble_tournament_matches (tournament_id, round_number, slot_number);

alter table public.marble_competitive_profiles enable row level security;
alter table public.marble_ranked_queue enable row level security;
alter table public.marble_competitive_results enable row level security;
alter table public.marble_tournaments enable row level security;
alter table public.marble_tournament_entries enable row level security;
alter table public.marble_tournament_matches enable row level security;

revoke all on public.marble_competitive_profiles from public, anon, authenticated;
revoke all on public.marble_ranked_queue from public, anon, authenticated;
revoke all on public.marble_competitive_results from public, anon, authenticated;
revoke all on public.marble_tournaments from public, anon, authenticated;
revoke all on public.marble_tournament_entries from public, anon, authenticated;
revoke all on public.marble_tournament_matches from public, anon, authenticated;

create or replace function private.marble_competitive_tier(target_rating integer)
returns text
language sql
immutable
set search_path = ''
as $$
    select case
        when greatest(0, coalesce(target_rating, 0)) >= 2200 then 'MASTER'
        when greatest(0, coalesce(target_rating, 0)) >= 1900 then 'DIAMOND'
        when greatest(0, coalesce(target_rating, 0)) >= 1600 then 'PLATINUM'
        when greatest(0, coalesce(target_rating, 0)) >= 1300 then 'GOLD'
        when greatest(0, coalesce(target_rating, 0)) >= 1100 then 'SILVER'
        else 'BRONZE'
    end;
$$;

create or replace function private.marble_upsert_competitive_profile(
    target_user_id uuid,
    target_profile_id text,
    target_display_name text
)
returns public.marble_competitive_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_profile public.marble_competitive_profiles%rowtype;
begin
    insert into public.marble_competitive_profiles (user_id, profile_id, display_name)
    values (
        target_user_id,
        left(regexp_replace(coalesce(target_profile_id, ''), '[^A-Za-z0-9_.:-]', '', 'g'), 48),
        left(regexp_replace(coalesce(target_display_name, 'ComePlayers'), E'[\\r\\n\\t]+', ' ', 'g'), 24)
    )
    on conflict (user_id) do update set
        profile_id = excluded.profile_id,
        display_name = excluded.display_name,
        updated_at = now()
    returning * into v_profile;
    return v_profile;
end;
$$;

create or replace function private.marble_competitive_profile_summary(target_user_id uuid, viewer_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
    select jsonb_build_object(
        'userId', profile.user_id::text,
        'profileId', profile.profile_id,
        'displayName', profile.display_name,
        'rating', profile.rating,
        'tier', private.marble_competitive_tier(profile.rating),
        'seasonPoints', profile.season_points,
        'wins', profile.wins,
        'losses', profile.losses,
        'matches', profile.wins + profile.losses,
        'streak', profile.streak,
        'bestStreak', profile.best_streak,
        'tournamentWins', profile.tournament_wins,
        'updatedAt', (extract(epoch from profile.updated_at) * 1000)::bigint,
        'self', profile.user_id = viewer_user_id
    )
    from public.marble_competitive_profiles profile
    where profile.user_id = target_user_id;
$$;

create or replace function private.marble_ranked_queue_summary(target_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
    select case when queue.user_id is null then jsonb_build_object(
        'status', 'IDLE', 'mode', 'SOLO', 'region', 'GLOBAL', 'rating', 1000,
        'waitSeconds', 0, 'searchRange', 150, 'queuedAt', 0, 'expiresAt', 0, 'matchedRoom', null
    ) else jsonb_build_object(
        'status', case when queue.status = 'SEARCHING' and queue.expires_at <= now() then 'EXPIRED' else queue.status end,
        'mode', queue.mode,
        'region', queue.region,
        'rating', queue.rating,
        'waitSeconds', greatest(0, extract(epoch from (now() - queue.queued_at))::integer),
        'searchRange', least(600, 150 + (greatest(0, extract(epoch from (now() - queue.queued_at)))::integer / 15) * 75),
        'queuedAt', (extract(epoch from queue.queued_at) * 1000)::bigint,
        'expiresAt', (extract(epoch from queue.expires_at) * 1000)::bigint,
        'matchedRoom', case when queue.status = 'MATCHED' and room.id is not null then jsonb_build_object(
            'roomId', room.id::text,
            'inviteCode', room.invite_code,
            'topic', room.topic,
            'mode', room.mode
        ) else null end
    ) end
    from (select target_user_id as requested_user) requested
    left join public.marble_ranked_queue queue on queue.user_id = requested.requested_user
    left join public.marble_realtime_rooms room on room.id = queue.matched_room_id;
$$;

create or replace function private.marble_create_competitive_room(
    target_user_ids uuid[],
    target_profile_ids text[],
    target_display_names text[],
    target_mode text,
    target_settings jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_room public.marble_realtime_rooms%rowtype;
    v_invite text;
    v_attempt integer := 0;
    v_index integer;
    v_count integer := coalesce(array_length(target_user_ids, 1), 0);
begin
    if target_mode not in ('SOLO', 'TEAM') then
        raise exception 'Invalid competitive room mode.' using errcode = '22023';
    end if;
    if v_count < 2 or v_count > 4
       or array_length(target_profile_ids, 1) <> v_count
       or array_length(target_display_names, 1) <> v_count then
        raise exception 'Competitive room requires aligned arrays for two to four players.' using errcode = '22023';
    end if;

    loop
        v_attempt := v_attempt + 1;
        v_invite := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 6));
        begin
            insert into public.marble_realtime_rooms (
                invite_code, topic, host_user_id, mode, phase, settings,
                max_players, max_spectators, expires_at
            ) values (
                v_invite,
                'marble-room:' || gen_random_uuid()::text,
                target_user_ids[1],
                target_mode,
                'LOBBY',
                coalesce(target_settings, '{}'::jsonb),
                v_count,
                2,
                now() + interval '20 minutes'
            ) returning * into v_room;
            exit;
        exception when unique_violation then
            if v_attempt >= 8 then raise; end if;
        end;
    end loop;

    for v_index in 1..v_count loop
        insert into public.marble_realtime_room_members (
            room_id, user_id, profile_id, display_name, role, ready, team_id, connected, joined_at, last_seen_at
        ) values (
            v_room.id,
            target_user_ids[v_index],
            left(target_profile_ids[v_index], 48),
            left(target_display_names[v_index], 24),
            'PLAYER',
            false,
            case when target_mode = 'TEAM' then case when (v_index % 2) = 1 then 'BLUE' else 'GOLD' end else null end,
            false,
            now() + make_interval(secs => v_index - 1),
            now()
        ) on conflict (room_id, user_id) do update set
            profile_id = excluded.profile_id,
            display_name = excluded.display_name,
            role = 'PLAYER',
            ready = false,
            team_id = excluded.team_id,
            connected = false,
            last_seen_at = now();
    end loop;

    return v_room.id;
end;
$$;

create or replace function private.marble_try_ranked_match(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_queue public.marble_ranked_queue%rowtype;
    v_needed integer;
    v_range integer;
    v_users uuid[];
    v_profiles text[];
    v_names text[];
    v_room_id uuid;
begin
    select * into v_queue
    from public.marble_ranked_queue queue
    where queue.user_id = target_user_id
    for update;

    if not found or v_queue.status <> 'SEARCHING' or v_queue.expires_at <= now() then
        return;
    end if;

    v_needed := case when v_queue.mode = 'TEAM' then 4 else 2 end;
    v_range := least(600, 150 + (greatest(0, extract(epoch from (now() - v_queue.queued_at)))::integer / 15) * 75);

    with candidates as (
        select queue.user_id, queue.profile_id, queue.display_name, queue.queued_at
        from public.marble_ranked_queue queue
        where queue.user_id = target_user_id
        union all
        select opponent.user_id, opponent.profile_id, opponent.display_name, opponent.queued_at
        from (
            select queue.user_id, queue.profile_id, queue.display_name, queue.queued_at
            from public.marble_ranked_queue queue
            where queue.status = 'SEARCHING'
              and queue.mode = v_queue.mode
              and queue.region = v_queue.region
              and queue.expires_at > now()
              and queue.user_id <> target_user_id
              and abs(queue.rating - v_queue.rating) <= v_range
            order by queue.queued_at, queue.user_id
            limit v_needed - 1
        ) opponent
    )
    select
        array_agg(candidate.user_id order by candidate.queued_at, candidate.user_id),
        array_agg(candidate.profile_id order by candidate.queued_at, candidate.user_id),
        array_agg(candidate.display_name order by candidate.queued_at, candidate.user_id)
    into v_users, v_profiles, v_names
    from candidates candidate;

    if coalesce(array_length(v_users, 1), 0) < v_needed or not (target_user_id = any(v_users)) then
        return;
    end if;

    perform 1
    from public.marble_ranked_queue queue
    where queue.user_id = any(v_users)
    order by queue.user_id
    for update;

    if exists (
        select 1 from public.marble_ranked_queue queue
        where queue.user_id = any(v_users)
          and (queue.status <> 'SEARCHING' or queue.expires_at <= now())
    ) then
        return;
    end if;

    v_room_id := private.marble_create_competitive_room(
        v_users,
        v_profiles,
        v_names,
        v_queue.mode,
        jsonb_build_object(
            'serverMatchmaking', true,
            'ranked', true,
            'region', v_queue.region,
            'ratingWindow', v_range,
            'createdBy', 'V65_COMPETITIVE_QUEUE'
        )
    );

    update public.marble_ranked_queue
    set status = 'MATCHED', matched_room_id = v_room_id, updated_at = now(), expires_at = now() + interval '20 minutes'
    where user_id = any(v_users);
end;
$$;

create or replace function private.marble_tournament_summary(target_tournament_id uuid, viewer_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
    select jsonb_build_object(
        'tournamentId', tournament.id::text,
        'tournamentCode', tournament.tournament_code,
        'name', tournament.name,
        'status', tournament.status,
        'capacity', tournament.capacity,
        'entryCount', tournament.entry_count,
        'currentRound', tournament.current_round,
        'totalRounds', tournament.total_rounds,
        'hostProfileId', tournament.host_profile_id,
        'championProfileId', tournament.champion_profile_id,
        'championDisplayName', tournament.champion_display_name,
        'joined', exists (
            select 1 from public.marble_tournament_entries entry
            where entry.tournament_id = tournament.id and entry.user_id = viewer_user_id
        ),
        'owned', tournament.host_user_id = viewer_user_id,
        'createdAt', (extract(epoch from tournament.created_at) * 1000)::bigint
    )
    from public.marble_tournaments tournament
    where tournament.id = target_tournament_id;
$$;

create or replace function private.marble_create_tournament_match(
    target_tournament_id uuid,
    target_round smallint,
    target_slot smallint,
    player_one uuid,
    player_two uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_one public.marble_tournament_entries%rowtype;
    v_two public.marble_tournament_entries%rowtype;
    v_room_id uuid;
    v_match_id uuid;
begin
    select * into v_one from public.marble_tournament_entries
    where tournament_id = target_tournament_id and user_id = player_one;
    select * into v_two from public.marble_tournament_entries
    where tournament_id = target_tournament_id and user_id = player_two;
    if v_one.user_id is null or v_two.user_id is null then
        raise exception 'Tournament players are missing.' using errcode = 'P0002';
    end if;

    v_room_id := private.marble_create_competitive_room(
        array[v_one.user_id, v_two.user_id],
        array[v_one.profile_id, v_two.profile_id],
        array[v_one.display_name, v_two.display_name],
        'SOLO',
        jsonb_build_object(
            'tournamentId', target_tournament_id::text,
            'tournamentRound', target_round,
            'tournamentSlot', target_slot,
            'createdBy', 'V65_TOURNAMENT'
        )
    );

    insert into public.marble_tournament_matches (
        tournament_id, round_number, slot_number,
        player_one_user_id, player_two_user_id, room_id, status
    ) values (
        target_tournament_id, target_round, target_slot,
        player_one, player_two, v_room_id, 'READY'
    )
    on conflict (tournament_id, round_number, slot_number) do update set
        player_one_user_id = excluded.player_one_user_id,
        player_two_user_id = excluded.player_two_user_id,
        room_id = excluded.room_id,
        status = 'READY',
        updated_at = now()
    returning id into v_match_id;
    return v_match_id;
end;
$$;

create or replace function private.marble_start_tournament(target_tournament_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_tournament public.marble_tournaments%rowtype;
    v_slot integer;
    v_one uuid;
    v_two uuid;
begin
    select * into v_tournament
    from public.marble_tournaments tournament
    where tournament.id = target_tournament_id
    for update;
    if not found or v_tournament.status <> 'OPEN' or v_tournament.entry_count <> v_tournament.capacity then return; end if;

    with seeded as (
        select entry.user_id, row_number() over (order by entry.joined_at, entry.user_id)::smallint as seed
        from public.marble_tournament_entries entry
        where entry.tournament_id = target_tournament_id
    )
    update public.marble_tournament_entries entry
    set seed = seeded.seed
    from seeded
    where entry.tournament_id = target_tournament_id and entry.user_id = seeded.user_id;

    for v_slot in 1..(v_tournament.capacity / 2) loop
        select user_id into v_one from public.marble_tournament_entries
        where tournament_id = target_tournament_id and seed = (v_slot * 2 - 1);
        select user_id into v_two from public.marble_tournament_entries
        where tournament_id = target_tournament_id and seed = (v_slot * 2);
        perform private.marble_create_tournament_match(target_tournament_id, 1, v_slot::smallint, v_one, v_two);
    end loop;

    update public.marble_tournaments
    set status = 'ACTIVE', current_round = 1, updated_at = now()
    where id = target_tournament_id;
end;
$$;

create or replace function private.marble_tournament_detail(target_tournament_id uuid, viewer_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_summary jsonb;
    v_entries jsonb;
    v_matches jsonb;
    v_active jsonb;
begin
    v_summary := private.marble_tournament_summary(target_tournament_id, viewer_user_id);
    if v_summary is null then return null; end if;

    select coalesce(jsonb_agg(jsonb_build_object(
        'userId', case when entry.user_id = viewer_user_id then entry.user_id::text else '' end,
        'profileId', entry.profile_id,
        'displayName', entry.display_name,
        'seed', entry.seed,
        'eliminated', entry.eliminated,
        'joinedAt', (extract(epoch from entry.joined_at) * 1000)::bigint,
        'self', entry.user_id = viewer_user_id
    ) order by entry.seed nulls last, entry.joined_at), '[]'::jsonb)
    into v_entries
    from public.marble_tournament_entries entry
    where entry.tournament_id = target_tournament_id;

    select coalesce(jsonb_agg(jsonb_build_object(
        'matchId', bracket.id::text,
        'round', bracket.round_number,
        'slot', bracket.slot_number,
        'status', bracket.status,
        'playerOneProfileId', coalesce(one_entry.profile_id, ''),
        'playerOneName', coalesce(one_entry.display_name, 'TBD'),
        'playerTwoProfileId', coalesce(two_entry.profile_id, ''),
        'playerTwoName', coalesce(two_entry.display_name, 'TBD'),
        'winnerProfileId', coalesce(winner_entry.profile_id, ''),
        'roomId', case when viewer_user_id in (bracket.player_one_user_id, bracket.player_two_user_id)
            or exists (
                select 1 from public.marble_tournaments host_tournament
                where host_tournament.id = target_tournament_id
                  and host_tournament.host_user_id = viewer_user_id
            ) then coalesce(room.id::text, '') else '' end,
        'inviteCode', case when viewer_user_id in (bracket.player_one_user_id, bracket.player_two_user_id)
            or exists (
                select 1 from public.marble_tournaments host_tournament
                where host_tournament.id = target_tournament_id
                  and host_tournament.host_user_id = viewer_user_id
            ) then coalesce(room.invite_code, '') else '' end,
        'topic', case when viewer_user_id in (bracket.player_one_user_id, bracket.player_two_user_id)
            or exists (
                select 1 from public.marble_tournaments host_tournament
                where host_tournament.id = target_tournament_id
                  and host_tournament.host_user_id = viewer_user_id
            ) then coalesce(room.topic, '') else '' end,
        'selfMatch', viewer_user_id in (bracket.player_one_user_id, bracket.player_two_user_id)
    ) order by bracket.round_number, bracket.slot_number), '[]'::jsonb)
    into v_matches
    from public.marble_tournament_matches bracket
    left join public.marble_tournament_entries one_entry
      on one_entry.tournament_id = bracket.tournament_id and one_entry.user_id = bracket.player_one_user_id
    left join public.marble_tournament_entries two_entry
      on two_entry.tournament_id = bracket.tournament_id and two_entry.user_id = bracket.player_two_user_id
    left join public.marble_tournament_entries winner_entry
      on winner_entry.tournament_id = bracket.tournament_id and winner_entry.user_id = bracket.winner_user_id
    left join public.marble_realtime_rooms room on room.id = bracket.room_id
    where bracket.tournament_id = target_tournament_id;

    select jsonb_build_object(
        'matchId', bracket.id::text,
        'round', bracket.round_number,
        'slot', bracket.slot_number,
        'status', bracket.status,
        'playerOneProfileId', coalesce(one_entry.profile_id, ''),
        'playerOneName', coalesce(one_entry.display_name, 'TBD'),
        'playerTwoProfileId', coalesce(two_entry.profile_id, ''),
        'playerTwoName', coalesce(two_entry.display_name, 'TBD'),
        'winnerProfileId', coalesce(winner_entry.profile_id, ''),
        'roomId', coalesce(room.id::text, ''),
        'inviteCode', coalesce(room.invite_code, ''),
        'topic', coalesce(room.topic, ''),
        'selfMatch', true
    ) into v_active
    from public.marble_tournament_matches bracket
    left join public.marble_tournament_entries one_entry
      on one_entry.tournament_id = bracket.tournament_id and one_entry.user_id = bracket.player_one_user_id
    left join public.marble_tournament_entries two_entry
      on two_entry.tournament_id = bracket.tournament_id and two_entry.user_id = bracket.player_two_user_id
    left join public.marble_tournament_entries winner_entry
      on winner_entry.tournament_id = bracket.tournament_id and winner_entry.user_id = bracket.winner_user_id
    left join public.marble_realtime_rooms room on room.id = bracket.room_id
    where bracket.tournament_id = target_tournament_id
      and viewer_user_id in (bracket.player_one_user_id, bracket.player_two_user_id)
      and bracket.status in ('READY', 'ACTIVE')
    order by bracket.round_number desc, bracket.slot_number
    limit 1;

    return v_summary || jsonb_build_object('entries', v_entries, 'matches', v_matches, 'activeMatch', v_active);
end;
$$;

create or replace function private.marble_competitive_hub(target_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_tournaments jsonb;
    v_leaderboard jsonb;
    v_current_tournament_id uuid;
    v_current jsonb;
begin
    select coalesce(jsonb_agg(private.marble_tournament_summary(tournament.id, target_user_id) order by tournament.created_at desc), '[]'::jsonb)
    into v_tournaments
    from (
        select tournament.id, tournament.created_at
        from public.marble_tournaments tournament
        where tournament.status in ('OPEN', 'ACTIVE')
           or tournament.host_user_id = target_user_id
           or exists (
                select 1 from public.marble_tournament_entries entry
                where entry.tournament_id = tournament.id and entry.user_id = target_user_id
           )
        order by tournament.created_at desc
        limit 24
    ) tournament;

    select coalesce(jsonb_agg(jsonb_build_object(
        'rank', ranked.position,
        'profileId', ranked.profile_id,
        'displayName', ranked.display_name,
        'rating', ranked.rating,
        'tier', private.marble_competitive_tier(ranked.rating),
        'wins', ranked.wins,
        'losses', ranked.losses,
        'tournamentWins', ranked.tournament_wins,
        'self', ranked.user_id = target_user_id
    ) order by ranked.position), '[]'::jsonb)
    into v_leaderboard
    from (
        select profile.*, row_number() over (order by profile.rating desc, profile.wins desc, profile.updated_at asc)::integer as position
        from public.marble_competitive_profiles profile
        order by profile.rating desc, profile.wins desc, profile.updated_at asc
        limit 20
    ) ranked;

    select tournament.id into v_current_tournament_id
    from public.marble_tournaments tournament
    join public.marble_tournament_entries entry on entry.tournament_id = tournament.id
    where entry.user_id = target_user_id
      and tournament.status in ('OPEN', 'ACTIVE')
    order by tournament.created_at desc
    limit 1;

    if v_current_tournament_id is not null then
        v_current := private.marble_tournament_detail(v_current_tournament_id, target_user_id);
    end if;

    return jsonb_build_object(
        'profile', private.marble_competitive_profile_summary(target_user_id, target_user_id),
        'queue', private.marble_ranked_queue_summary(target_user_id),
        'tournaments', v_tournaments,
        'leaderboard', v_leaderboard,
        'currentTournament', v_current
    );
end;
$$;

revoke all on function private.marble_competitive_tier(integer) from public;
revoke all on function private.marble_upsert_competitive_profile(uuid, text, text) from public;
revoke all on function private.marble_competitive_profile_summary(uuid, uuid) from public;
revoke all on function private.marble_ranked_queue_summary(uuid) from public;
revoke all on function private.marble_create_competitive_room(uuid[], text[], text[], text, jsonb) from public;
revoke all on function private.marble_try_ranked_match(uuid) from public;
revoke all on function private.marble_tournament_summary(uuid, uuid) from public;
revoke all on function private.marble_create_tournament_match(uuid, smallint, smallint, uuid, uuid) from public;
revoke all on function private.marble_start_tournament(uuid) from public;
revoke all on function private.marble_tournament_detail(uuid, uuid) from public;
revoke all on function private.marble_competitive_hub(uuid) from public;


create or replace function public.get_marble_competitive_hub(p_profile_id text, p_display_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_user_id uuid := (select auth.uid());
begin
    if v_user_id is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
    perform private.marble_upsert_competitive_profile(v_user_id, p_profile_id, p_display_name);
    update public.marble_ranked_queue
    set status = 'EXPIRED', updated_at = now()
    where user_id = v_user_id and status = 'SEARCHING' and expires_at <= now();
    return private.marble_competitive_hub(v_user_id);
end;
$$;

create or replace function public.join_marble_ranked_queue(
    p_profile_id text,
    p_display_name text,
    p_mode text default 'SOLO',
    p_region text default 'GLOBAL'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_user_id uuid := (select auth.uid());
    v_profile public.marble_competitive_profiles%rowtype;
    v_mode text := upper(coalesce(p_mode, 'SOLO'));
    v_region text := upper(regexp_replace(coalesce(p_region, 'GLOBAL'), '[^A-Z0-9_-]', '', 'g'));
begin
    if v_user_id is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
    if v_mode not in ('SOLO', 'TEAM') then raise exception 'Queue mode must be SOLO or TEAM.' using errcode = '22023'; end if;
    if char_length(v_region) < 1 or char_length(v_region) > 16 then v_region := 'GLOBAL'; end if;

    perform pg_advisory_xact_lock(hashtextextended('marble-ranked:' || v_mode || ':' || v_region, 0));
    v_profile := private.marble_upsert_competitive_profile(v_user_id, p_profile_id, p_display_name);

    insert into public.marble_ranked_queue (
        user_id, profile_id, display_name, mode, region, rating,
        status, matched_room_id, queued_at, updated_at, expires_at
    ) values (
        v_user_id, v_profile.profile_id, v_profile.display_name, v_mode, v_region, v_profile.rating,
        'SEARCHING', null, now(), now(), now() + interval '10 minutes'
    ) on conflict (user_id) do update set
        profile_id = excluded.profile_id,
        display_name = excluded.display_name,
        mode = excluded.mode,
        region = excluded.region,
        rating = excluded.rating,
        status = 'SEARCHING',
        matched_room_id = null,
        queued_at = case when public.marble_ranked_queue.status = 'SEARCHING'
            and public.marble_ranked_queue.mode = excluded.mode
            and public.marble_ranked_queue.region = excluded.region
            and public.marble_ranked_queue.expires_at > now()
            then public.marble_ranked_queue.queued_at else now() end,
        updated_at = now(),
        expires_at = now() + interval '10 minutes';

    perform private.marble_try_ranked_match(v_user_id);
    return private.marble_competitive_hub(v_user_id);
end;
$$;

create or replace function public.poll_marble_ranked_queue(p_profile_id text, p_display_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_user_id uuid := (select auth.uid());
    v_queue public.marble_ranked_queue%rowtype;
begin
    if v_user_id is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
    perform private.marble_upsert_competitive_profile(v_user_id, p_profile_id, p_display_name);
    select * into v_queue from public.marble_ranked_queue where user_id = v_user_id;
    if found and v_queue.status = 'SEARCHING' then
        perform pg_advisory_xact_lock(hashtextextended('marble-ranked:' || v_queue.mode || ':' || v_queue.region, 0));
        if v_queue.expires_at <= now() then
            update public.marble_ranked_queue set status = 'EXPIRED', updated_at = now() where user_id = v_user_id;
        else
            perform private.marble_try_ranked_match(v_user_id);
        end if;
    end if;
    return private.marble_competitive_hub(v_user_id);
end;
$$;

create or replace function public.cancel_marble_ranked_queue(p_profile_id text, p_display_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_user_id uuid := (select auth.uid());
begin
    if v_user_id is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
    perform private.marble_upsert_competitive_profile(v_user_id, p_profile_id, p_display_name);
    update public.marble_ranked_queue
    set status = 'CANCELLED', matched_room_id = null, updated_at = now(), expires_at = now()
    where user_id = v_user_id and status <> 'MATCHED';
    return private.marble_competitive_hub(v_user_id);
end;
$$;

create or replace function public.finalize_marble_competitive_match(
    p_room_id uuid,
    p_profile_id text,
    p_display_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_user_id uuid := (select auth.uid());
    v_room public.marble_realtime_rooms%rowtype;
    v_match public.marble_authoritative_matches%rowtype;
    v_player record;
    v_winner_profile text;
    v_winner_team text;
    v_won boolean;
    v_inserted integer;
begin
    if v_user_id is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
    perform private.marble_upsert_competitive_profile(v_user_id, p_profile_id, p_display_name);
    if not (select private.marble_is_room_member(p_room_id)) then
        raise exception 'Room membership is required.' using errcode = '42501';
    end if;

    select * into v_room from public.marble_realtime_rooms where id = p_room_id;
    if not found or coalesce((v_room.settings ->> 'ranked')::boolean, false) is not true then
        raise exception 'This room is not a server-ranked match.' using errcode = '22023';
    end if;
    select * into v_match from public.marble_authoritative_matches where room_id = p_room_id and phase = 'FINISHED';
    if not found then raise exception 'Finish the authoritative match before finalizing rating.' using errcode = '55000'; end if;

    insert into public.marble_competitive_results (
        match_id, room_id, mode, winner_profile_id, winner_team_id, finalized_by
    ) values (
        v_match.id, p_room_id, coalesce(v_match.state ->> 'mode', v_room.mode),
        coalesce(v_match.state ->> 'winnerProfileId', ''),
        coalesce(v_match.state ->> 'winnerTeamId', ''),
        v_user_id
    ) on conflict (match_id) do nothing;
    get diagnostics v_inserted = row_count;

    if v_inserted > 0 then
        v_winner_profile := coalesce(v_match.state ->> 'winnerProfileId', '');
        v_winner_team := coalesce(v_match.state ->> 'winnerTeamId', '');
        for v_player in
            select player.user_id, player.profile_id, player.display_name, coalesce(player.team_id, '') as team_id
            from public.marble_authoritative_match_players player
            where player.match_id = v_match.id
        loop
            perform private.marble_upsert_competitive_profile(v_player.user_id, v_player.profile_id, v_player.display_name);
            v_won := (v_winner_team <> '' and v_player.team_id = v_winner_team)
                or (v_winner_team = '' and v_player.profile_id = v_winner_profile);
            update public.marble_competitive_profiles profile
            set rating = greatest(0, least(10000, profile.rating + case when v_won then 26 else -18 end)),
                season_points = profile.season_points + case when v_won then 100 else 30 end,
                wins = profile.wins + case when v_won then 1 else 0 end,
                losses = profile.losses + case when v_won then 0 else 1 end,
                streak = case when v_won then profile.streak + 1 else 0 end,
                best_streak = greatest(profile.best_streak, case when v_won then profile.streak + 1 else profile.best_streak end),
                updated_at = now()
            where profile.user_id = v_player.user_id;
        end loop;
    end if;

    update public.marble_ranked_queue
    set status = 'EXPIRED', matched_room_id = null, updated_at = now(), expires_at = now()
    where matched_room_id = p_room_id;

    return private.marble_competitive_hub(v_user_id);
end;
$$;

create or replace function public.create_marble_tournament(
    p_profile_id text,
    p_display_name text,
    p_name text default 'ComePlayers Cup',
    p_capacity integer default 4
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_user_id uuid := (select auth.uid());
    v_profile public.marble_competitive_profiles%rowtype;
    v_tournament public.marble_tournaments%rowtype;
    v_code text;
    v_attempt integer := 0;
    v_capacity integer := case when p_capacity = 8 then 8 else 4 end;
begin
    if v_user_id is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
    v_profile := private.marble_upsert_competitive_profile(v_user_id, p_profile_id, p_display_name);

    if exists (
        select 1 from public.marble_tournament_entries entry
        join public.marble_tournaments tournament on tournament.id = entry.tournament_id
        where entry.user_id = v_user_id and tournament.status in ('OPEN', 'ACTIVE')
    ) then
        raise exception 'Leave or finish the current tournament before creating another.' using errcode = '55000';
    end if;

    loop
        v_attempt := v_attempt + 1;
        v_code := upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 8));
        begin
            insert into public.marble_tournaments (
                tournament_code, host_user_id, host_profile_id, name,
                capacity, entry_count, total_rounds
            ) values (
                v_code, v_user_id, v_profile.profile_id,
                left(regexp_replace(coalesce(p_name, 'ComePlayers Cup'), E'[\\r\\n\\t]+', ' ', 'g'), 48),
                v_capacity, 1, case when v_capacity = 8 then 3 else 2 end
            ) returning * into v_tournament;
            exit;
        exception when unique_violation then
            if v_attempt >= 8 then raise; end if;
        end;
    end loop;

    insert into public.marble_tournament_entries (
        tournament_id, user_id, profile_id, display_name
    ) values (
        v_tournament.id, v_user_id, v_profile.profile_id, v_profile.display_name
    );

    return private.marble_tournament_detail(v_tournament.id, v_user_id);
end;
$$;

create or replace function public.join_marble_tournament(
    p_tournament_code text,
    p_profile_id text,
    p_display_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_user_id uuid := (select auth.uid());
    v_profile public.marble_competitive_profiles%rowtype;
    v_tournament public.marble_tournaments%rowtype;
begin
    if v_user_id is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
    v_profile := private.marble_upsert_competitive_profile(v_user_id, p_profile_id, p_display_name);

    select * into v_tournament
    from public.marble_tournaments tournament
    where tournament.tournament_code = upper(regexp_replace(coalesce(p_tournament_code, ''), '[^A-Z0-9]', '', 'g'))
    for update;
    if not found then raise exception 'Tournament code was not found.' using errcode = 'P0002'; end if;
    if v_tournament.status <> 'OPEN' then raise exception 'This tournament is no longer accepting players.' using errcode = '55000'; end if;

    if exists (
        select 1 from public.marble_tournament_entries entry
        join public.marble_tournaments tournament on tournament.id = entry.tournament_id
        where entry.user_id = v_user_id and tournament.status in ('OPEN', 'ACTIVE')
          and tournament.id <> v_tournament.id
    ) then
        raise exception 'You are already registered in another active tournament.' using errcode = '55000';
    end if;

    insert into public.marble_tournament_entries (
        tournament_id, user_id, profile_id, display_name
    ) values (
        v_tournament.id, v_user_id, v_profile.profile_id, v_profile.display_name
    ) on conflict (tournament_id, user_id) do update set
        profile_id = excluded.profile_id,
        display_name = excluded.display_name;

    update public.marble_tournaments tournament
    set entry_count = (
        select count(*) from public.marble_tournament_entries entry where entry.tournament_id = tournament.id
    ), updated_at = now()
    where tournament.id = v_tournament.id
    returning * into v_tournament;

    if v_tournament.entry_count = v_tournament.capacity then
        perform pg_advisory_xact_lock(hashtextextended('marble-tournament:' || v_tournament.id::text, 0));
        perform private.marble_start_tournament(v_tournament.id);
    end if;

    return private.marble_tournament_detail(v_tournament.id, v_user_id);
end;
$$;

create or replace function public.get_marble_tournament(p_tournament_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_user_id uuid := (select auth.uid());
    v_tournament_id uuid;
begin
    if v_user_id is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
    select tournament.id into v_tournament_id
    from public.marble_tournaments tournament
    where tournament.tournament_code = upper(regexp_replace(coalesce(p_tournament_code, ''), '[^A-Z0-9]', '', 'g'));
    if v_tournament_id is null then raise exception 'Tournament code was not found.' using errcode = 'P0002'; end if;
    return private.marble_tournament_detail(v_tournament_id, v_user_id);
end;
$$;

create or replace function public.advance_marble_tournament(p_tournament_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_user_id uuid := (select auth.uid());
    v_tournament public.marble_tournaments%rowtype;
    v_bracket record;
    v_authority public.marble_authoritative_matches%rowtype;
    v_winner_profile text;
    v_winner_user uuid;
    v_loser_user uuid;
    v_round integer;
    v_slot integer;
    v_left uuid;
    v_right uuid;
    v_final public.marble_tournament_matches%rowtype;
    v_champion public.marble_tournament_entries%rowtype;
begin
    if v_user_id is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
    select * into v_tournament
    from public.marble_tournaments tournament
    where tournament.tournament_code = upper(regexp_replace(coalesce(p_tournament_code, ''), '[^A-Z0-9]', '', 'g'))
    for update;
    if not found then raise exception 'Tournament code was not found.' using errcode = 'P0002'; end if;
    if not exists (
        select 1 from public.marble_tournament_entries entry
        where entry.tournament_id = v_tournament.id and entry.user_id = v_user_id
    ) and v_tournament.host_user_id <> v_user_id then
        raise exception 'Tournament membership is required.' using errcode = '42501';
    end if;

    perform pg_advisory_xact_lock(hashtextextended('marble-tournament:' || v_tournament.id::text, 0));

    for v_bracket in
        select bracket.*
        from public.marble_tournament_matches bracket
        where bracket.tournament_id = v_tournament.id
          and bracket.status in ('READY', 'ACTIVE')
        order by bracket.round_number, bracket.slot_number
        for update
    loop
        select * into v_authority
        from public.marble_authoritative_matches match
        where match.room_id = v_bracket.room_id and match.phase = 'FINISHED';
        if found then
            v_winner_profile := coalesce(v_authority.state ->> 'winnerProfileId', '');
            select player.user_id into v_winner_user
            from public.marble_authoritative_match_players player
            where player.match_id = v_authority.id and player.profile_id = v_winner_profile
            limit 1;
            if v_winner_user is not null then
                v_loser_user := case when v_winner_user = v_bracket.player_one_user_id
                    then v_bracket.player_two_user_id else v_bracket.player_one_user_id end;
                update public.marble_tournament_matches
                set winner_user_id = v_winner_user, status = 'FINISHED', updated_at = now()
                where id = v_bracket.id;
                update public.marble_tournament_entries
                set eliminated = true
                where tournament_id = v_tournament.id and user_id = v_loser_user;
                update public.marble_competitive_profiles
                set rating = least(10000, rating + 18), season_points = season_points + 120,
                    wins = wins + 1, streak = streak + 1, best_streak = greatest(best_streak, streak + 1), updated_at = now()
                where user_id = v_winner_user;
                update public.marble_competitive_profiles
                set rating = greatest(0, rating - 12), season_points = season_points + 40,
                    losses = losses + 1, streak = 0, updated_at = now()
                where user_id = v_loser_user;
            end if;
        elsif exists (select 1 from public.marble_authoritative_matches match where match.room_id = v_bracket.room_id) then
            update public.marble_tournament_matches set status = 'ACTIVE', updated_at = now() where id = v_bracket.id;
        end if;
    end loop;

    for v_round in 2..v_tournament.total_rounds loop
        for v_slot in 1..(v_tournament.capacity / power(2, v_round)::integer) loop
            if not exists (
                select 1 from public.marble_tournament_matches bracket
                where bracket.tournament_id = v_tournament.id
                  and bracket.round_number = v_round
                  and bracket.slot_number = v_slot
            ) then
                select winner_user_id into v_left
                from public.marble_tournament_matches
                where tournament_id = v_tournament.id and round_number = v_round - 1 and slot_number = v_slot * 2 - 1 and status = 'FINISHED';
                select winner_user_id into v_right
                from public.marble_tournament_matches
                where tournament_id = v_tournament.id and round_number = v_round - 1 and slot_number = v_slot * 2 and status = 'FINISHED';
                if v_left is not null and v_right is not null then
                    perform private.marble_create_tournament_match(v_tournament.id, v_round::smallint, v_slot::smallint, v_left, v_right);
                    update public.marble_tournaments set current_round = greatest(current_round, v_round), updated_at = now() where id = v_tournament.id;
                end if;
            end if;
        end loop;
    end loop;

    select * into v_final
    from public.marble_tournament_matches bracket
    where bracket.tournament_id = v_tournament.id
      and bracket.round_number = v_tournament.total_rounds
      and bracket.slot_number = 1;

    if v_final.status = 'FINISHED' and v_final.winner_user_id is not null and v_tournament.status <> 'FINISHED' then
        select * into v_champion from public.marble_tournament_entries
        where tournament_id = v_tournament.id and user_id = v_final.winner_user_id;
        update public.marble_tournaments
        set status = 'FINISHED', current_round = total_rounds,
            champion_user_id = v_champion.user_id,
            champion_profile_id = v_champion.profile_id,
            champion_display_name = v_champion.display_name,
            updated_at = now()
        where id = v_tournament.id;
        update public.marble_competitive_profiles
        set tournament_wins = tournament_wins + 1,
            season_points = season_points + 500,
            rating = least(10000, rating + 40),
            updated_at = now()
        where user_id = v_champion.user_id;
    end if;

    return private.marble_tournament_detail(v_tournament.id, v_user_id);
end;
$$;

revoke all on function public.get_marble_competitive_hub(text, text) from public, anon;
revoke all on function public.join_marble_ranked_queue(text, text, text, text) from public, anon;
revoke all on function public.poll_marble_ranked_queue(text, text) from public, anon;
revoke all on function public.cancel_marble_ranked_queue(text, text) from public, anon;
revoke all on function public.finalize_marble_competitive_match(uuid, text, text) from public, anon;
revoke all on function public.create_marble_tournament(text, text, text, integer) from public, anon;
revoke all on function public.join_marble_tournament(text, text, text) from public, anon;
revoke all on function public.get_marble_tournament(text) from public, anon;
revoke all on function public.advance_marble_tournament(text) from public, anon;

grant execute on function public.get_marble_competitive_hub(text, text) to authenticated;
grant execute on function public.join_marble_ranked_queue(text, text, text, text) to authenticated;
grant execute on function public.poll_marble_ranked_queue(text, text) to authenticated;
grant execute on function public.cancel_marble_ranked_queue(text, text) to authenticated;
grant execute on function public.finalize_marble_competitive_match(uuid, text, text) to authenticated;
grant execute on function public.create_marble_tournament(text, text, text, integer) to authenticated;
grant execute on function public.join_marble_tournament(text, text, text) to authenticated;
grant execute on function public.get_marble_tournament(text) to authenticated;
grant execute on function public.advance_marble_tournament(text) to authenticated;


-- V65 reservation fix: matched players already occupy a membership row before they connect.
-- Count only other users when enforcing capacity so a reserved player can claim their room.
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
    v_existing boolean;
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

    select exists (
        select 1 from public.marble_realtime_room_members member
        where member.room_id = v_room.id and member.user_id = v_user_id
    ) into v_existing;

    select count(*) into v_role_count
    from public.marble_realtime_room_members member
    where member.room_id = v_room.id
      and member.role = v_role
      and member.user_id <> v_user_id;

    if not v_existing and v_role = 'PLAYER' and v_role_count >= v_room.max_players then
        raise exception 'All player slots are full.' using errcode = 'P0001';
    end if;
    if not v_existing and v_role = 'SPECTATOR' and v_role_count >= v_room.max_spectators then
        raise exception 'All spectator slots are full.' using errcode = 'P0001';
    end if;

    select count(*) into v_player_position
    from public.marble_realtime_room_members member
    where member.room_id = v_room.id
      and member.role = 'PLAYER'
      and member.user_id <> v_user_id;

    insert into public.marble_realtime_room_members (
        room_id, user_id, profile_id, display_name, role, ready, team_id, connected, last_seen_at
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
        role = public.marble_realtime_room_members.role,
        ready = public.marble_realtime_room_members.ready,
        team_id = public.marble_realtime_room_members.team_id,
        connected = true,
        last_seen_at = now();

    update public.marble_realtime_rooms
    set updated_at = now(), expires_at = now() + interval '20 minutes'
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

revoke all on function public.join_marble_realtime_room(text, text, text, text) from public, anon;
grant execute on function public.join_marble_realtime_room(text, text, text, text) to authenticated;

comment on table public.marble_ranked_queue is 'Short-lived V65 server matchmaking queue. Direct Data API access is revoked.';
comment on table public.marble_tournaments is 'Four/eight-player V65 single-elimination tournament registry. Direct Data API access is revoked.';
comment on function public.join_marble_ranked_queue(text, text, text, text) is 'Queues an authenticated player and atomically creates a private room when enough rating-compatible players are available.';
comment on function public.advance_marble_tournament(text) is 'Reads finished authoritative matches, advances winners, creates the next bracket rooms, and awards the champion exactly once.';

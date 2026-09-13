-- ComePlayers Marble V66: Realtime queue notifications, monthly server seasons,
-- Team Clash 2v2 tournament brackets, and native-client friendly competitive RPCs.
-- Apply after 20260720143000_marble_v65_competitive_circuit.sql.

alter table public.marble_competitive_profiles
    add column if not exists season_id text not null default to_char(timezone('UTC', now()), 'YYYY-MM'),
    add column if not exists season_started_at timestamptz not null default date_trunc('month', timezone('UTC', now())),
    add column if not exists season_ends_at timestamptz not null default (date_trunc('month', timezone('UTC', now())) + interval '1 month'),
    add column if not exists lifetime_wins integer not null default 0 check (lifetime_wins >= 0),
    add column if not exists lifetime_losses integer not null default 0 check (lifetime_losses >= 0),
    add column if not exists lifetime_tournament_wins integer not null default 0 check (lifetime_tournament_wins >= 0);

create table if not exists public.marble_team_tournaments (
    id uuid primary key default gen_random_uuid(),
    tournament_code text not null unique check (tournament_code ~ '^[A-Z0-9]{8}$'),
    host_user_id uuid not null references auth.users(id) on delete cascade,
    host_profile_id text not null check (char_length(host_profile_id) between 1 and 48),
    name text not null check (char_length(name) between 1 and 48),
    status text not null default 'OPEN' check (status in ('OPEN', 'ACTIVE', 'FINISHED', 'CANCELLED')),
    player_capacity smallint not null check (player_capacity in (4, 8)),
    entry_count smallint not null default 0 check (entry_count between 0 and 8),
    current_round smallint not null default 0 check (current_round between 0 and 2),
    total_rounds smallint not null check (total_rounds in (1, 2)),
    champion_team_number smallint not null default 0 check (champion_team_number between 0 and 4),
    champion_profile_id text not null default '',
    champion_display_name text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.marble_team_tournament_entries (
    tournament_id uuid not null references public.marble_team_tournaments(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    profile_id text not null check (char_length(profile_id) between 1 and 48),
    display_name text not null check (char_length(display_name) between 1 and 24),
    seed smallint not null default 0 check (seed between 0 and 8),
    team_number smallint not null default 0 check (team_number between 0 and 4),
    eliminated boolean not null default false,
    joined_at timestamptz not null default now(),
    primary key (tournament_id, user_id),
    unique (tournament_id, profile_id)
);

create table if not exists public.marble_team_tournament_matches (
    id uuid primary key default gen_random_uuid(),
    tournament_id uuid not null references public.marble_team_tournaments(id) on delete cascade,
    round_number smallint not null check (round_number between 1 and 2),
    slot_number smallint not null check (slot_number between 1 and 2),
    team_one_number smallint not null check (team_one_number between 1 and 4),
    team_two_number smallint not null check (team_two_number between 1 and 4),
    winner_team_number smallint not null default 0 check (winner_team_number between 0 and 4),
    room_id uuid null references public.marble_realtime_rooms(id) on delete set null,
    status text not null default 'PENDING' check (status in ('PENDING', 'READY', 'ACTIVE', 'FINISHED', 'BYE')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (tournament_id, round_number, slot_number)
);


create or replace function private.marble_validate_cross_tournament_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if tg_table_name = 'marble_tournaments' then
        if exists (select 1 from public.marble_team_tournaments tournament where tournament.tournament_code = new.tournament_code) then
            raise exception 'Tournament code collision detected.' using errcode = '23505';
        end if;
    elsif exists (select 1 from public.marble_tournaments tournament where tournament.tournament_code = new.tournament_code) then
        raise exception 'Tournament code collision detected.' using errcode = '23505';
    end if;
    return new;
end;
$$;

create or replace function private.marble_prevent_cross_tournament_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if tg_table_name = 'marble_tournament_entries' then
        if exists (
            select 1 from public.marble_team_tournament_entries entry
            join public.marble_team_tournaments tournament on tournament.id = entry.tournament_id
            where entry.user_id = new.user_id and tournament.status in ('OPEN', 'ACTIVE')
        ) then
            raise exception 'User is already registered in an active Team tournament.' using errcode = '55000';
        end if;
    elsif exists (
        select 1 from public.marble_tournament_entries entry
        join public.marble_tournaments tournament on tournament.id = entry.tournament_id
        where entry.user_id = new.user_id and tournament.status in ('OPEN', 'ACTIVE')
    ) then
        raise exception 'User is already registered in an active Solo tournament.' using errcode = '55000';
    end if;
    return new;
end;
$$;

drop trigger if exists marble_solo_tournament_code_guard on public.marble_tournaments;
create trigger marble_solo_tournament_code_guard
before insert or update of tournament_code on public.marble_tournaments
for each row execute function private.marble_validate_cross_tournament_code();

drop trigger if exists marble_team_tournament_code_guard on public.marble_team_tournaments;
create trigger marble_team_tournament_code_guard
before insert or update of tournament_code on public.marble_team_tournaments
for each row execute function private.marble_validate_cross_tournament_code();

drop trigger if exists marble_solo_tournament_membership_guard on public.marble_tournament_entries;
create trigger marble_solo_tournament_membership_guard
before insert on public.marble_tournament_entries
for each row execute function private.marble_prevent_cross_tournament_membership();

drop trigger if exists marble_team_tournament_membership_guard on public.marble_team_tournament_entries;
create trigger marble_team_tournament_membership_guard
before insert on public.marble_team_tournament_entries
for each row execute function private.marble_prevent_cross_tournament_membership();

create index if not exists marble_team_tournaments_browser_idx
    on public.marble_team_tournaments (status, created_at desc);
create index if not exists marble_team_tournament_entries_user_idx
    on public.marble_team_tournament_entries (user_id, joined_at desc);
create index if not exists marble_team_tournament_matches_progress_idx
    on public.marble_team_tournament_matches (tournament_id, round_number, slot_number);

alter table public.marble_team_tournaments enable row level security;
alter table public.marble_team_tournament_entries enable row level security;
alter table public.marble_team_tournament_matches enable row level security;

revoke all on public.marble_team_tournaments from public, anon, authenticated;
revoke all on public.marble_team_tournament_entries from public, anon, authenticated;
revoke all on public.marble_team_tournament_matches from public, anon, authenticated;

create or replace function private.marble_competitive_season_id()
returns text
language sql
stable
set search_path = ''
as $$
    select to_char(timezone('UTC', now()), 'YYYY-MM');
$$;

create or replace function private.marble_rollover_competitive_season()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_season_id text := private.marble_competitive_season_id();
    v_changed integer := 0;
    v_profile record;
begin
    perform pg_advisory_xact_lock(hashtextextended('comeplayers-marble-season-rollover', 0));

    for v_profile in
        select profile.user_id
        from public.marble_competitive_profiles profile
        where profile.season_id <> v_season_id
        for update
    loop
        update public.marble_competitive_profiles profile
        set lifetime_wins = profile.lifetime_wins + profile.wins,
            lifetime_losses = profile.lifetime_losses + profile.losses,
            lifetime_tournament_wins = profile.lifetime_tournament_wins + profile.tournament_wins,
            rating = 1000,
            season_points = 0,
            wins = 0,
            losses = 0,
            streak = 0,
            best_streak = 0,
            tournament_wins = 0,
            season_id = v_season_id,
            season_started_at = date_trunc('month', timezone('UTC', now())),
            season_ends_at = date_trunc('month', timezone('UTC', now())) + interval '1 month',
            updated_at = now()
        where profile.user_id = v_profile.user_id;
        v_changed := v_changed + 1;
        perform realtime.send(
            jsonb_build_object('seasonId', v_season_id, 'reason', 'MONTHLY_ROLLOVER'),
            'season_update',
            'marble-competitive:' || v_profile.user_id::text,
            true
        );
    end loop;

    return v_changed;
end;
$$;

create or replace function private.marble_notify_competitive_user(
    target_user_id uuid,
    target_reason text,
    target_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if target_user_id is null then return; end if;
    perform realtime.send(
        coalesce(target_payload, '{}'::jsonb) || jsonb_build_object('reason', left(coalesce(target_reason, 'UPDATED'), 48)),
        'queue_update',
        'marble-competitive:' || target_user_id::text,
        true
    );
end;
$$;

create or replace function private.marble_ranked_queue_notify_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if tg_op = 'INSERT' or new.status is distinct from old.status or new.matched_room_id is distinct from old.matched_room_id then
        perform private.marble_notify_competitive_user(
            new.user_id,
            'QUEUE_' || new.status,
            jsonb_build_object(
                'status', new.status,
                'mode', new.mode,
                'matchedRoomId', coalesce(new.matched_room_id::text, '')
            )
        );
    end if;
    return new;
end;
$$;

drop trigger if exists marble_ranked_queue_realtime_notify on public.marble_ranked_queue;
create trigger marble_ranked_queue_realtime_notify
after insert or update of status, matched_room_id on public.marble_ranked_queue
for each row execute function private.marble_ranked_queue_notify_trigger();

create or replace function private.marble_can_access_topic(requested_topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select (select auth.uid()) is not null
       and (
            requested_topic = 'marble-competitive:' || (select auth.uid())::text
            or exists (
                select 1
                from public.marble_realtime_rooms room
                join public.marble_realtime_room_members member on member.room_id = room.id
                where room.topic = requested_topic
                  and room.phase <> 'CLOSED'
                  and room.expires_at > now()
                  and member.user_id = (select auth.uid())
            )
       );
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
    v_season_id text := private.marble_competitive_season_id();
begin
    perform private.marble_rollover_competitive_season();
    insert into public.marble_competitive_profiles (
        user_id, profile_id, display_name, season_id, season_started_at, season_ends_at
    ) values (
        target_user_id,
        left(regexp_replace(coalesce(target_profile_id, ''), '[^A-Za-z0-9_.:-]', '', 'g'), 48),
        left(regexp_replace(coalesce(target_display_name, 'ComePlayers'), E'[\\r\\n\\t]+', ' ', 'g'), 24),
        v_season_id,
        date_trunc('month', timezone('UTC', now())),
        date_trunc('month', timezone('UTC', now())) + interval '1 month'
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
        'seasonId', profile.season_id,
        'seasonEndsAt', (extract(epoch from profile.season_ends_at) * 1000)::bigint,
        'lifetimeWins', profile.lifetime_wins,
        'lifetimeLosses', profile.lifetime_losses,
        'lifetimeTournamentWins', profile.lifetime_tournament_wins,
        'updatedAt', (extract(epoch from profile.updated_at) * 1000)::bigint,
        'self', profile.user_id = viewer_user_id
    )
    from public.marble_competitive_profiles profile
    where profile.user_id = target_user_id;
$$;

create or replace function private.marble_team_name(target_tournament_id uuid, target_team_number smallint)
returns text
language sql
stable
security definer
set search_path = ''
as $$
    select coalesce(
        'TEAM ' || target_team_number::text || '  •  ' || string_agg(entry.display_name, ' & ' order by entry.seed),
        'TEAM ' || target_team_number::text
    )
    from public.marble_team_tournament_entries entry
    where entry.tournament_id = target_tournament_id
      and entry.team_number = target_team_number;
$$;

create or replace function private.marble_team_tournament_summary(target_tournament_id uuid, viewer_user_id uuid)
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
        'mode', 'TEAM',
        'status', tournament.status,
        'capacity', tournament.player_capacity,
        'entryCount', tournament.entry_count,
        'teamCount', coalesce((select count(distinct entry.team_number) from public.marble_team_tournament_entries entry where entry.tournament_id = tournament.id and entry.team_number > 0), 0),
        'currentRound', tournament.current_round,
        'totalRounds', tournament.total_rounds,
        'hostProfileId', tournament.host_profile_id,
        'championProfileId', tournament.champion_profile_id,
        'championDisplayName', tournament.champion_display_name,
        'joined', exists (
            select 1 from public.marble_team_tournament_entries entry
            where entry.tournament_id = tournament.id and entry.user_id = viewer_user_id
        ),
        'owned', tournament.host_user_id = viewer_user_id,
        'createdAt', (extract(epoch from tournament.created_at) * 1000)::bigint
    )
    from public.marble_team_tournaments tournament
    where tournament.id = target_tournament_id;
$$;

create or replace function private.marble_team_tournament_detail(target_tournament_id uuid, viewer_user_id uuid)
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
    v_summary := private.marble_team_tournament_summary(target_tournament_id, viewer_user_id);
    if v_summary is null then return null; end if;

    select coalesce(jsonb_agg(jsonb_build_object(
        'userId', entry.user_id::text,
        'profileId', entry.profile_id,
        'displayName', entry.display_name,
        'seed', entry.seed,
        'teamNumber', entry.team_number,
        'teamName', case when entry.team_number > 0 then private.marble_team_name(entry.tournament_id, entry.team_number) else 'UNSEEDED' end,
        'eliminated', entry.eliminated,
        'joinedAt', (extract(epoch from entry.joined_at) * 1000)::bigint,
        'self', entry.user_id = viewer_user_id
    ) order by entry.seed, entry.joined_at), '[]'::jsonb)
    into v_entries
    from public.marble_team_tournament_entries entry
    where entry.tournament_id = target_tournament_id;

    select coalesce(jsonb_agg(jsonb_build_object(
        'matchId', bracket.id::text,
        'round', bracket.round_number,
        'slot', bracket.slot_number,
        'status', bracket.status,
        'playerOneProfileId', 'TEAM-' || bracket.team_one_number::text,
        'playerOneName', private.marble_team_name(bracket.tournament_id, bracket.team_one_number),
        'playerTwoProfileId', 'TEAM-' || bracket.team_two_number::text,
        'playerTwoName', private.marble_team_name(bracket.tournament_id, bracket.team_two_number),
        'winnerProfileId', case when bracket.winner_team_number > 0 then 'TEAM-' || bracket.winner_team_number::text else '' end,
        'teamOneNumber', bracket.team_one_number,
        'teamTwoNumber', bracket.team_two_number,
        'roomId', case when room_access.allowed then coalesce(room.id::text, '') else '' end,
        'inviteCode', case when room_access.allowed then coalesce(room.invite_code, '') else '' end,
        'topic', case when room_access.allowed then coalesce(room.topic, '') else '' end,
        'selfMatch', room_access.member
    ) order by bracket.round_number, bracket.slot_number), '[]'::jsonb)
    into v_matches
    from public.marble_team_tournament_matches bracket
    left join public.marble_realtime_rooms room on room.id = bracket.room_id
    cross join lateral (
        select
            exists (
                select 1 from public.marble_team_tournament_entries entry
                where entry.tournament_id = bracket.tournament_id
                  and entry.user_id = viewer_user_id
                  and entry.team_number in (bracket.team_one_number, bracket.team_two_number)
            ) as member,
            (
                exists (
                    select 1 from public.marble_team_tournament_entries entry
                    where entry.tournament_id = bracket.tournament_id
                      and entry.user_id = viewer_user_id
                      and entry.team_number in (bracket.team_one_number, bracket.team_two_number)
                )
                or exists (
                    select 1 from public.marble_team_tournaments tournament
                    where tournament.id = bracket.tournament_id and tournament.host_user_id = viewer_user_id
                )
            ) as allowed
    ) room_access
    where bracket.tournament_id = target_tournament_id;

    select match_data into v_active
    from jsonb_array_elements(v_matches) match_data
    where coalesce((match_data ->> 'selfMatch')::boolean, false)
      and match_data ->> 'status' in ('READY', 'ACTIVE')
    order by (match_data ->> 'round')::integer, (match_data ->> 'slot')::integer
    limit 1;

    return v_summary || jsonb_build_object('entries', v_entries, 'matches', v_matches, 'activeMatch', v_active);
end;
$$;

create or replace function private.marble_create_team_tournament_match(
    target_tournament_id uuid,
    target_round smallint,
    target_slot smallint,
    target_team_one smallint,
    target_team_two smallint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_one_users uuid[];
    v_one_profiles text[];
    v_one_names text[];
    v_two_users uuid[];
    v_two_profiles text[];
    v_two_names text[];
    v_users uuid[];
    v_profiles text[];
    v_names text[];
    v_room_id uuid;
    v_match_id uuid;
begin
    select
        array_agg(entry.user_id order by entry.seed),
        array_agg(entry.profile_id order by entry.seed),
        array_agg(entry.display_name order by entry.seed)
    into v_one_users, v_one_profiles, v_one_names
    from public.marble_team_tournament_entries entry
    where entry.tournament_id = target_tournament_id and entry.team_number = target_team_one;

    select
        array_agg(entry.user_id order by entry.seed),
        array_agg(entry.profile_id order by entry.seed),
        array_agg(entry.display_name order by entry.seed)
    into v_two_users, v_two_profiles, v_two_names
    from public.marble_team_tournament_entries entry
    where entry.tournament_id = target_tournament_id and entry.team_number = target_team_two;

    if coalesce(array_length(v_one_users, 1), 0) <> 2 or coalesce(array_length(v_two_users, 1), 0) <> 2 then
        raise exception 'A Team Clash match requires two complete two-player teams.' using errcode = '22023';
    end if;

    v_users := array[v_one_users[1], v_two_users[1], v_one_users[2], v_two_users[2]];
    v_profiles := array[v_one_profiles[1], v_two_profiles[1], v_one_profiles[2], v_two_profiles[2]];
    v_names := array[v_one_names[1], v_two_names[1], v_one_names[2], v_two_names[2]];

    v_room_id := private.marble_create_competitive_room(
        v_users,
        v_profiles,
        v_names,
        'TEAM',
        jsonb_build_object(
            'teamTournamentId', target_tournament_id::text,
            'tournamentRound', target_round,
            'tournamentSlot', target_slot,
            'teamOneNumber', target_team_one,
            'teamTwoNumber', target_team_two,
            'createdBy', 'V66_TEAM_TOURNAMENT'
        )
    );

    insert into public.marble_team_tournament_matches (
        tournament_id, round_number, slot_number, team_one_number, team_two_number, room_id, status
    ) values (
        target_tournament_id, target_round, target_slot, target_team_one, target_team_two, v_room_id, 'READY'
    )
    on conflict (tournament_id, round_number, slot_number) do update set
        team_one_number = excluded.team_one_number,
        team_two_number = excluded.team_two_number,
        room_id = excluded.room_id,
        status = 'READY',
        updated_at = now()
    returning id into v_match_id;

    return v_match_id;
end;
$$;

create or replace function private.marble_start_team_tournament(target_tournament_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_tournament public.marble_team_tournaments%rowtype;
    v_entry record;
    v_seed smallint := 0;
begin
    select * into v_tournament from public.marble_team_tournaments tournament
    where tournament.id = target_tournament_id for update;
    if not found or v_tournament.status <> 'OPEN' or v_tournament.entry_count <> v_tournament.player_capacity then return; end if;

    for v_entry in
        select entry.user_id from public.marble_team_tournament_entries entry
        where entry.tournament_id = target_tournament_id
        order by entry.joined_at, entry.user_id
    loop
        v_seed := v_seed + 1;
        update public.marble_team_tournament_entries
        set seed = v_seed, team_number = ceil(v_seed / 2.0)::smallint
        where tournament_id = target_tournament_id and user_id = v_entry.user_id;
    end loop;

    if v_tournament.player_capacity = 4 then
        perform private.marble_create_team_tournament_match(target_tournament_id, 1, 1, 1, 2);
    else
        perform private.marble_create_team_tournament_match(target_tournament_id, 1, 1, 1, 2);
        perform private.marble_create_team_tournament_match(target_tournament_id, 1, 2, 3, 4);
    end if;

    update public.marble_team_tournaments
    set status = 'ACTIVE', current_round = 1, updated_at = now()
    where id = target_tournament_id;
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
    v_current jsonb;
    v_solo_id uuid;
    v_team_id uuid;
begin
    select coalesce(jsonb_agg(summary order by created_at desc), '[]'::jsonb)
    into v_tournaments
    from (
        select private.marble_tournament_summary(tournament.id, target_user_id) || jsonb_build_object('mode', 'SOLO', 'teamCount', 0) as summary,
               tournament.created_at
        from public.marble_tournaments tournament
        where tournament.status in ('OPEN', 'ACTIVE')
           or tournament.host_user_id = target_user_id
           or exists (select 1 from public.marble_tournament_entries entry where entry.tournament_id = tournament.id and entry.user_id = target_user_id)
        union all
        select private.marble_team_tournament_summary(tournament.id, target_user_id) as summary,
               tournament.created_at
        from public.marble_team_tournaments tournament
        where tournament.status in ('OPEN', 'ACTIVE')
           or tournament.host_user_id = target_user_id
           or exists (select 1 from public.marble_team_tournament_entries entry where entry.tournament_id = tournament.id and entry.user_id = target_user_id)
        order by created_at desc
        limit 24
    ) combined;

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

    select tournament.id into v_solo_id
    from public.marble_tournaments tournament
    join public.marble_tournament_entries entry on entry.tournament_id = tournament.id
    where entry.user_id = target_user_id and tournament.status in ('OPEN', 'ACTIVE')
    order by tournament.created_at desc limit 1;

    select tournament.id into v_team_id
    from public.marble_team_tournaments tournament
    join public.marble_team_tournament_entries entry on entry.tournament_id = tournament.id
    where entry.user_id = target_user_id and tournament.status in ('OPEN', 'ACTIVE')
    order by tournament.created_at desc limit 1;

    if v_team_id is not null then
        v_current := private.marble_team_tournament_detail(v_team_id, target_user_id);
    elsif v_solo_id is not null then
        v_current := private.marble_tournament_detail(v_solo_id, target_user_id) || jsonb_build_object('mode', 'SOLO', 'teamCount', 0);
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

create or replace function public.create_marble_competitive_tournament(
    p_profile_id text,
    p_display_name text,
    p_name text,
    p_capacity integer default 4,
    p_mode text default 'SOLO'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_user_id uuid := (select auth.uid());
    v_profile public.marble_competitive_profiles%rowtype;
    v_code text;
    v_attempt integer := 0;
    v_tournament public.marble_team_tournaments%rowtype;
begin
    if v_user_id is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
    if upper(coalesce(p_mode, 'SOLO')) <> 'TEAM' then
        return public.create_marble_tournament(p_profile_id, p_display_name, p_name, p_capacity);
    end if;
    if p_capacity not in (4, 8) then raise exception 'Team tournament capacity must be four or eight players.' using errcode = '22023'; end if;

    v_profile := private.marble_upsert_competitive_profile(v_user_id, p_profile_id, p_display_name);
    if exists (
        select 1 from public.marble_team_tournament_entries entry
        join public.marble_team_tournaments tournament on tournament.id = entry.tournament_id
        where entry.user_id = v_user_id and tournament.status in ('OPEN', 'ACTIVE')
    ) or exists (
        select 1 from public.marble_tournament_entries entry
        join public.marble_tournaments tournament on tournament.id = entry.tournament_id
        where entry.user_id = v_user_id and tournament.status in ('OPEN', 'ACTIVE')
    ) then
        raise exception 'Leave the active tournament before creating another one.' using errcode = '55000';
    end if;

    loop
        v_attempt := v_attempt + 1;
        v_code := upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 8));
        exit when not exists (select 1 from public.marble_tournaments tournament where tournament.tournament_code = v_code)
              and not exists (select 1 from public.marble_team_tournaments tournament where tournament.tournament_code = v_code);
        if v_attempt >= 12 then raise exception 'Could not generate a unique tournament code.'; end if;
    end loop;

    insert into public.marble_team_tournaments (
        tournament_code, host_user_id, host_profile_id, name, player_capacity, total_rounds
    ) values (
        v_code, v_user_id, v_profile.profile_id,
        left(regexp_replace(coalesce(p_name, 'ComePlayers Team Cup'), E'[\\r\\n\\t]+', ' ', 'g'), 48),
        p_capacity,
        case when p_capacity = 4 then 1 else 2 end
    ) returning * into v_tournament;

    insert into public.marble_team_tournament_entries (
        tournament_id, user_id, profile_id, display_name
    ) values (
        v_tournament.id, v_user_id, v_profile.profile_id, v_profile.display_name
    );
    update public.marble_team_tournaments set entry_count = 1, updated_at = now() where id = v_tournament.id;

    return private.marble_team_tournament_detail(v_tournament.id, v_user_id);
end;
$$;

create or replace function public.join_marble_competitive_tournament(
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
    v_code text := upper(regexp_replace(coalesce(p_tournament_code, ''), '[^A-Z0-9]', '', 'g'));
    v_tournament public.marble_team_tournaments%rowtype;
    v_profile public.marble_competitive_profiles%rowtype;
begin
    if v_user_id is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
    select * into v_tournament from public.marble_team_tournaments tournament
    where tournament.tournament_code = v_code for update;
    if not found then return public.join_marble_tournament(v_code, p_profile_id, p_display_name); end if;
    if v_tournament.status <> 'OPEN' then raise exception 'Team tournament registration is closed.' using errcode = '55000'; end if;
    if v_tournament.entry_count >= v_tournament.player_capacity then raise exception 'Team tournament is full.' using errcode = 'P0001'; end if;

    if exists (
        select 1 from public.marble_team_tournament_entries entry
        join public.marble_team_tournaments tournament on tournament.id = entry.tournament_id
        where entry.user_id = v_user_id and tournament.status in ('OPEN', 'ACTIVE') and tournament.id <> v_tournament.id
    ) or exists (
        select 1 from public.marble_tournament_entries entry
        join public.marble_tournaments tournament on tournament.id = entry.tournament_id
        where entry.user_id = v_user_id and tournament.status in ('OPEN', 'ACTIVE')
    ) then
        raise exception 'You are already registered in another active tournament.' using errcode = '55000';
    end if;

    v_profile := private.marble_upsert_competitive_profile(v_user_id, p_profile_id, p_display_name);
    insert into public.marble_team_tournament_entries (tournament_id, user_id, profile_id, display_name)
    values (v_tournament.id, v_user_id, v_profile.profile_id, v_profile.display_name)
    on conflict (tournament_id, user_id) do update set profile_id = excluded.profile_id, display_name = excluded.display_name;

    update public.marble_team_tournaments tournament
    set entry_count = (select count(*) from public.marble_team_tournament_entries entry where entry.tournament_id = tournament.id),
        updated_at = now()
    where tournament.id = v_tournament.id returning * into v_tournament;

    if v_tournament.entry_count = v_tournament.player_capacity then
        perform pg_advisory_xact_lock(hashtextextended('marble-team-tournament:' || v_tournament.id::text, 0));
        perform private.marble_start_team_tournament(v_tournament.id);
    end if;

    return private.marble_team_tournament_detail(v_tournament.id, v_user_id);
end;
$$;

create or replace function public.get_marble_competitive_tournament(p_tournament_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_user_id uuid := (select auth.uid());
    v_code text := upper(regexp_replace(coalesce(p_tournament_code, ''), '[^A-Z0-9]', '', 'g'));
    v_id uuid;
begin
    if v_user_id is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
    select tournament.id into v_id from public.marble_team_tournaments tournament where tournament.tournament_code = v_code;
    if v_id is not null then return private.marble_team_tournament_detail(v_id, v_user_id); end if;
    return public.get_marble_tournament(v_code);
end;
$$;

create or replace function public.advance_marble_competitive_tournament(p_tournament_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_user_id uuid := (select auth.uid());
    v_code text := upper(regexp_replace(coalesce(p_tournament_code, ''), '[^A-Z0-9]', '', 'g'));
    v_tournament public.marble_team_tournaments%rowtype;
    v_bracket record;
    v_authority public.marble_authoritative_matches%rowtype;
    v_winner_color text;
    v_winner_team smallint;
    v_loser_team smallint;
    v_left smallint;
    v_right smallint;
    v_final public.marble_team_tournament_matches%rowtype;
begin
    if v_user_id is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
    select * into v_tournament from public.marble_team_tournaments tournament
    where tournament.tournament_code = v_code for update;
    if not found then return public.advance_marble_tournament(v_code); end if;

    if not exists (
        select 1 from public.marble_team_tournament_entries entry
        where entry.tournament_id = v_tournament.id and entry.user_id = v_user_id
    ) and v_tournament.host_user_id <> v_user_id then
        raise exception 'Tournament membership is required.' using errcode = '42501';
    end if;

    perform pg_advisory_xact_lock(hashtextextended('marble-team-tournament:' || v_tournament.id::text, 0));

    for v_bracket in
        select bracket.* from public.marble_team_tournament_matches bracket
        where bracket.tournament_id = v_tournament.id and bracket.status in ('READY', 'ACTIVE')
        order by bracket.round_number, bracket.slot_number for update
    loop
        select * into v_authority from public.marble_authoritative_matches match
        where match.room_id = v_bracket.room_id and match.phase = 'FINISHED';
        if found then
            v_winner_color := coalesce(v_authority.state ->> 'winnerTeamId', '');
            if v_winner_color in ('BLUE', 'GOLD') then
                v_winner_team := case when v_winner_color = 'BLUE' then v_bracket.team_one_number else v_bracket.team_two_number end;
                v_loser_team := case when v_winner_color = 'BLUE' then v_bracket.team_two_number else v_bracket.team_one_number end;
                update public.marble_team_tournament_matches
                set winner_team_number = v_winner_team, status = 'FINISHED', updated_at = now()
                where id = v_bracket.id and status <> 'FINISHED';
                update public.marble_team_tournament_entries
                set eliminated = true
                where tournament_id = v_tournament.id and team_number = v_loser_team;
                update public.marble_competitive_profiles profile
                set rating = least(10000, profile.rating + 18), season_points = profile.season_points + 120,
                    wins = profile.wins + 1, streak = profile.streak + 1,
                    best_streak = greatest(profile.best_streak, profile.streak + 1), updated_at = now()
                where profile.user_id in (
                    select entry.user_id from public.marble_team_tournament_entries entry
                    where entry.tournament_id = v_tournament.id and entry.team_number = v_winner_team
                );
                update public.marble_competitive_profiles profile
                set rating = greatest(0, profile.rating - 12), season_points = profile.season_points + 40,
                    losses = profile.losses + 1, streak = 0, updated_at = now()
                where profile.user_id in (
                    select entry.user_id from public.marble_team_tournament_entries entry
                    where entry.tournament_id = v_tournament.id and entry.team_number = v_loser_team
                );
            end if;
        elsif exists (select 1 from public.marble_authoritative_matches match where match.room_id = v_bracket.room_id) then
            update public.marble_team_tournament_matches set status = 'ACTIVE', updated_at = now() where id = v_bracket.id;
        end if;
    end loop;

    if v_tournament.player_capacity = 8 and not exists (
        select 1 from public.marble_team_tournament_matches bracket
        where bracket.tournament_id = v_tournament.id and bracket.round_number = 2 and bracket.slot_number = 1
    ) then
        select winner_team_number into v_left from public.marble_team_tournament_matches
        where tournament_id = v_tournament.id and round_number = 1 and slot_number = 1 and status = 'FINISHED';
        select winner_team_number into v_right from public.marble_team_tournament_matches
        where tournament_id = v_tournament.id and round_number = 1 and slot_number = 2 and status = 'FINISHED';
        if v_left > 0 and v_right > 0 then
            perform private.marble_create_team_tournament_match(v_tournament.id, 2, 1, v_left, v_right);
            update public.marble_team_tournaments set current_round = 2, updated_at = now() where id = v_tournament.id;
        end if;
    end if;

    select * into v_final from public.marble_team_tournament_matches bracket
    where bracket.tournament_id = v_tournament.id
      and bracket.round_number = v_tournament.total_rounds and bracket.slot_number = 1;

    if v_final.status = 'FINISHED' and v_final.winner_team_number > 0 and v_tournament.status <> 'FINISHED' then
        update public.marble_team_tournaments tournament
        set status = 'FINISHED', current_round = total_rounds,
            champion_team_number = v_final.winner_team_number,
            champion_profile_id = 'TEAM-' || v_final.winner_team_number::text,
            champion_display_name = private.marble_team_name(v_tournament.id, v_final.winner_team_number),
            updated_at = now()
        where tournament.id = v_tournament.id;
        update public.marble_competitive_profiles profile
        set tournament_wins = profile.tournament_wins + 1,
            season_points = profile.season_points + 500,
            rating = least(10000, profile.rating + 40),
            updated_at = now()
        where profile.user_id in (
            select entry.user_id from public.marble_team_tournament_entries entry
            where entry.tournament_id = v_tournament.id and entry.team_number = v_final.winner_team_number
        );
    end if;

    return private.marble_team_tournament_detail(v_tournament.id, v_user_id);
end;
$$;

revoke all on function private.marble_validate_cross_tournament_code() from public;
revoke all on function private.marble_prevent_cross_tournament_membership() from public;
revoke all on function private.marble_competitive_season_id() from public;
revoke all on function private.marble_rollover_competitive_season() from public;
revoke all on function private.marble_notify_competitive_user(uuid, text, jsonb) from public;
revoke all on function private.marble_ranked_queue_notify_trigger() from public;
revoke all on function private.marble_team_name(uuid, smallint) from public;
revoke all on function private.marble_team_tournament_summary(uuid, uuid) from public;
revoke all on function private.marble_team_tournament_detail(uuid, uuid) from public;
revoke all on function private.marble_create_team_tournament_match(uuid, smallint, smallint, smallint, smallint) from public;
revoke all on function private.marble_start_team_tournament(uuid) from public;
revoke all on function public.create_marble_competitive_tournament(text, text, text, integer, text) from public, anon;
revoke all on function public.join_marble_competitive_tournament(text, text, text) from public, anon;
revoke all on function public.get_marble_competitive_tournament(text) from public, anon;
revoke all on function public.advance_marble_competitive_tournament(text) from public, anon;

grant execute on function public.create_marble_competitive_tournament(text, text, text, integer, text) to authenticated;
grant execute on function public.join_marble_competitive_tournament(text, text, text) to authenticated;
grant execute on function public.get_marble_competitive_tournament(text) to authenticated;
grant execute on function public.advance_marble_competitive_tournament(text) to authenticated;

-- Schedule a monthly rollover only when Supabase Cron / pg_cron has already been enabled.
do $$
declare
    v_job_id bigint;
begin
    if exists (select 1 from pg_extension where extname = 'pg_cron') then
        select jobid into v_job_id from cron.job where jobname = 'comeplayers-marble-season-rollover' limit 1;
        if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
        perform cron.schedule(
            'comeplayers-marble-season-rollover',
            '5 0 1 * *',
            'select private.marble_rollover_competitive_season();'
        );
    end if;
exception when undefined_table or insufficient_privilege then
    raise notice 'Supabase Cron is not enabled; season rollover will run lazily when competitive RPCs are used.';
end;
$$;

-- ComePlayers Marble V64: durable replay archives, share codes, public library, and paged replay access.
-- Apply after 20260720101500_marble_v63_spectator_replay.sql.

create table if not exists public.marble_authoritative_replays (
    id uuid primary key default gen_random_uuid(),
    replay_code text not null unique check (replay_code ~ '^[A-Z0-9]{8}$'),
    owner_user_id uuid not null references auth.users(id) on delete cascade,
    source_room_id uuid not null,
    source_match_id uuid not null,
    title text not null check (char_length(title) between 1 and 80),
    visibility text not null default 'UNLISTED' check (visibility in ('PRIVATE', 'UNLISTED', 'PUBLIC')),
    mode text not null check (mode in ('SOLO', 'TEAM')),
    winner_profile_id text not null default '',
    winner_team_id text not null default '' check (winner_team_id in ('', 'BLUE', 'GOLD')),
    finish_reason text not null default '',
    completed_round integer not null default 1 check (completed_round between 1 and 999),
    event_count integer not null default 0 check (event_count >= 0),
    checksum text not null check (checksum ~ '^[a-f0-9]{64}$'),
    final_snapshot jsonb not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (owner_user_id, source_match_id)
);

create table if not exists public.marble_authoritative_replay_events (
    replay_id uuid not null references public.marble_authoritative_replays(id) on delete cascade,
    sequence bigint not null check (sequence > 0),
    kind text not null check (char_length(kind) between 1 and 64),
    actor_profile_id text not null default '',
    payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null,
    primary key (replay_id, sequence)
);

create index if not exists marble_authoritative_replays_owner_created_idx
    on public.marble_authoritative_replays (owner_user_id, created_at desc);
create index if not exists marble_authoritative_replays_public_created_idx
    on public.marble_authoritative_replays (created_at desc)
    where visibility = 'PUBLIC';
create index if not exists marble_authoritative_replay_events_page_idx
    on public.marble_authoritative_replay_events (replay_id, sequence);

alter table public.marble_authoritative_replays enable row level security;
alter table public.marble_authoritative_replay_events enable row level security;

revoke all on public.marble_authoritative_replays from public, anon, authenticated;
revoke all on public.marble_authoritative_replay_events from public, anon, authenticated;

create or replace function private.marble_authoritative_replay_summary(
    target_replay_id uuid,
    viewer_user_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
    select jsonb_build_object(
        'replayId', replay.id::text,
        'replayCode', replay.replay_code,
        'ownerUserId', replay.owner_user_id::text,
        'sourceRoomId', replay.source_room_id::text,
        'sourceMatchId', replay.source_match_id::text,
        'title', replay.title,
        'visibility', replay.visibility,
        'mode', replay.mode,
        'winnerProfileId', replay.winner_profile_id,
        'winnerTeamId', replay.winner_team_id,
        'finishReason', replay.finish_reason,
        'round', replay.completed_round,
        'eventCount', replay.event_count,
        'checksum', replay.checksum,
        'createdAt', (extract(epoch from replay.created_at) * 1000)::bigint,
        'owned', replay.owner_user_id = viewer_user_id
    )
    from public.marble_authoritative_replays replay
    where replay.id = target_replay_id;
$$;

revoke all on function private.marble_authoritative_replay_summary(uuid, uuid) from public;

create or replace function public.publish_marble_authoritative_replay(
    p_room_id uuid,
    p_visibility text default 'UNLISTED'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_user_id uuid := (select auth.uid());
    v_match public.marble_authoritative_matches%rowtype;
    v_replay public.marble_authoritative_replays%rowtype;
    v_visibility text := upper(coalesce(p_visibility, 'UNLISTED'));
    v_code text;
    v_checksum text;
    v_event_count integer;
    v_snapshot jsonb;
    v_attempt integer := 0;
begin
    if v_user_id is null then
        raise exception 'Authentication is required.' using errcode = '42501';
    end if;
    if v_visibility not in ('PRIVATE', 'UNLISTED', 'PUBLIC') then
        raise exception 'Replay visibility must be PRIVATE, UNLISTED, or PUBLIC.' using errcode = '22023';
    end if;
    if not (select private.marble_is_room_host(p_room_id)) then
        raise exception 'Only the room host can publish this replay.' using errcode = '42501';
    end if;

    select * into v_match
    from public.marble_authoritative_matches match
    where match.room_id = p_room_id;

    if not found then
        raise exception 'No authoritative match exists for this room.' using errcode = 'P0002';
    end if;
    if v_match.phase <> 'FINISHED' then
        raise exception 'Finish the authoritative match before publishing its replay.' using errcode = '55000';
    end if;

    select * into v_replay
    from public.marble_authoritative_replays replay
    where replay.owner_user_id = v_user_id
      and replay.source_match_id = v_match.id
    for update;

    if found then
        update public.marble_authoritative_replays
        set visibility = v_visibility, updated_at = now()
        where id = v_replay.id
        returning * into v_replay;
        return private.marble_authoritative_replay_summary(v_replay.id, v_user_id);
    end if;

    select
        count(*)::integer,
        encode(digest(coalesce(string_agg(
            event.sequence::text || '|' || event.kind || '|' || event.actor_profile_id || '|' || event.payload::text || '|' || event.created_at::text,
            '||' order by event.sequence
        ), ''), 'sha256'), 'hex')
    into v_event_count, v_checksum
    from public.marble_authoritative_match_events event
    where event.match_id = v_match.id;

    if v_event_count = 0 then
        raise exception 'The match has no replayable events.' using errcode = '55000';
    end if;

    v_snapshot := private.marble_authoritative_snapshot(v_match.id);

    loop
        v_attempt := v_attempt + 1;
        v_code := upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 8));
        begin
            insert into public.marble_authoritative_replays (
                replay_code,
                owner_user_id,
                source_room_id,
                source_match_id,
                title,
                visibility,
                mode,
                winner_profile_id,
                winner_team_id,
                finish_reason,
                completed_round,
                event_count,
                checksum,
                final_snapshot
            ) values (
                v_code,
                v_user_id,
                p_room_id,
                v_match.id,
                left('ComePlayers Marble ' || v_match.id::text, 80),
                v_visibility,
                coalesce(v_match.state ->> 'mode', 'SOLO'),
                coalesce(v_match.state ->> 'winnerProfileId', ''),
                coalesce(v_match.state ->> 'winnerTeamId', ''),
                coalesce(v_match.state ->> 'finishReason', ''),
                v_match.round,
                v_event_count,
                v_checksum,
                v_snapshot
            )
            returning * into v_replay;
            exit;
        exception when unique_violation then
            if v_attempt >= 8 then raise; end if;
        end;
    end loop;

    update public.marble_authoritative_replays
    set title = 'ComePlayers Marble Replay ' || replay_code
    where id = v_replay.id
    returning * into v_replay;

    insert into public.marble_authoritative_replay_events (
        replay_id, sequence, kind, actor_profile_id, payload, created_at
    )
    select
        v_replay.id,
        event.sequence,
        event.kind,
        event.actor_profile_id,
        event.payload,
        event.created_at
    from public.marble_authoritative_match_events event
    where event.match_id = v_match.id
    order by event.sequence;

    return private.marble_authoritative_replay_summary(v_replay.id, v_user_id);
end;
$$;

create or replace function public.list_marble_authoritative_replays(
    p_limit integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_user_id uuid := (select auth.uid());
    v_limit integer := greatest(1, least(40, coalesce(p_limit, 20)));
    v_entries jsonb;
begin
    if v_user_id is null then
        raise exception 'Authentication is required.' using errcode = '42501';
    end if;

    select coalesce(jsonb_agg(private.marble_authoritative_replay_summary(replay.id, v_user_id) order by replay.created_at desc), '[]'::jsonb)
    into v_entries
    from (
        select replay.id, replay.created_at
        from public.marble_authoritative_replays replay
        where replay.owner_user_id = v_user_id
           or replay.visibility = 'PUBLIC'
        order by replay.created_at desc
        limit v_limit
    ) replay;

    return jsonb_build_object(
        'entries', v_entries,
        'count', jsonb_array_length(v_entries)
    );
end;
$$;

create or replace function public.get_marble_authoritative_replay_by_code(
    p_replay_code text,
    p_after_sequence bigint default 0,
    p_limit integer default 180
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_user_id uuid := (select auth.uid());
    v_replay public.marble_authoritative_replays%rowtype;
    v_after bigint := greatest(0, coalesce(p_after_sequence, 0));
    v_limit integer := greatest(1, least(180, coalesce(p_limit, 180)));
    v_events jsonb := '[]'::jsonb;
    v_first_sequence bigint := 0;
    v_last_sequence bigint := 0;
    v_has_more boolean := false;
    v_page_checksum text;
begin
    if v_user_id is null then
        raise exception 'Authentication is required.' using errcode = '42501';
    end if;

    select * into v_replay
    from public.marble_authoritative_replays replay
    where replay.replay_code = upper(regexp_replace(coalesce(p_replay_code, ''), '[^A-Z0-9]', '', 'g'));

    if not found then
        raise exception 'Replay share code was not found.' using errcode = 'P0002';
    end if;
    if v_replay.visibility = 'PRIVATE' and v_replay.owner_user_id <> v_user_id then
        raise exception 'This replay is private.' using errcode = '42501';
    end if;

    with page as (
        select event.sequence, event.kind, event.actor_profile_id, event.payload, event.created_at
        from public.marble_authoritative_replay_events event
        where event.replay_id = v_replay.id
          and event.sequence > v_after
        order by event.sequence
        limit v_limit
    )
    select
        coalesce(jsonb_agg(jsonb_build_object(
            'matchId', v_replay.source_match_id::text,
            'sequence', page.sequence,
            'kind', page.kind,
            'actorProfileId', page.actor_profile_id,
            'payload', page.payload,
            'createdAt', (extract(epoch from page.created_at) * 1000)::bigint
        ) order by page.sequence), '[]'::jsonb),
        coalesce(min(page.sequence), 0),
        coalesce(max(page.sequence), 0),
        encode(digest(coalesce(string_agg(
            page.sequence::text || '|' || page.kind || '|' || page.actor_profile_id || '|' || page.payload::text || '|' || page.created_at::text,
            '||' order by page.sequence
        ), ''), 'sha256'), 'hex')
    into v_events, v_first_sequence, v_last_sequence, v_page_checksum
    from page;

    if v_last_sequence > 0 then
        select exists (
            select 1
            from public.marble_authoritative_replay_events event
            where event.replay_id = v_replay.id
              and event.sequence > v_last_sequence
        ) into v_has_more;
    end if;

    return jsonb_build_object(
        'archive', private.marble_authoritative_replay_summary(v_replay.id, v_user_id),
        'snapshot', v_replay.final_snapshot,
        'events', v_events,
        'firstSequence', v_first_sequence,
        'lastSequence', v_last_sequence,
        'hasMore', v_has_more,
        'checksum', v_page_checksum
    );
end;
$$;

create or replace function public.delete_marble_authoritative_replay(p_replay_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_user_id uuid := (select auth.uid());
    v_deleted integer;
begin
    if v_user_id is null then
        raise exception 'Authentication is required.' using errcode = '42501';
    end if;
    delete from public.marble_authoritative_replays replay
    where replay.id = p_replay_id
      and replay.owner_user_id = v_user_id;
    get diagnostics v_deleted = row_count;
    if v_deleted = 0 then
        raise exception 'Replay was not found or is not owned by this user.' using errcode = '42501';
    end if;
    return jsonb_build_object('deleted', true, 'replayId', p_replay_id::text);
end;
$$;

revoke all on function public.publish_marble_authoritative_replay(uuid, text) from public, anon;
revoke all on function public.list_marble_authoritative_replays(integer) from public, anon;
revoke all on function public.get_marble_authoritative_replay_by_code(text, bigint, integer) from public, anon;
revoke all on function public.delete_marble_authoritative_replay(uuid) from public, anon;

grant execute on function public.publish_marble_authoritative_replay(uuid, text) to authenticated;
grant execute on function public.list_marble_authoritative_replays(integer) to authenticated;
grant execute on function public.get_marble_authoritative_replay_by_code(text, bigint, integer) to authenticated;
grant execute on function public.delete_marble_authoritative_replay(uuid) to authenticated;

comment on table public.marble_authoritative_replays is 'Durable authoritative replay archives. Direct Data API access is revoked; use restricted RPC functions.';
comment on function public.publish_marble_authoritative_replay(uuid, text) is 'Copies a finished host-owned authoritative match into a durable replay archive and returns an eight-character share code.';
comment on function public.get_marble_authoritative_replay_by_code(text, bigint, integer) is 'Returns one bounded replay event page for an authenticated viewer; private archives are owner-only.';

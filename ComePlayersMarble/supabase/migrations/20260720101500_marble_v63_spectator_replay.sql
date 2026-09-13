-- ComePlayers Marble V63: durable spectator catch-up and authoritative replay history.
-- Apply after 20260719091500_marble_v61_cinematic_loadouts.sql.
-- V62 was client-only and did not require a database migration.

create or replace function public.get_marble_authoritative_event_history(
    p_room_id uuid,
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
    v_match_id uuid;
    v_after bigint := greatest(0, coalesce(p_after_sequence, 0));
    v_limit integer := greatest(1, least(180, coalesce(p_limit, 180)));
    v_events jsonb := '[]'::jsonb;
    v_first_sequence bigint := 0;
    v_last_sequence bigint := 0;
    v_has_more boolean := false;
    v_checksum text;
begin
    if v_user_id is null then
        raise exception 'Authentication is required.' using errcode = '42501';
    end if;
    if not (select private.marble_is_room_member(p_room_id)) then
        raise exception 'Room membership is required to read match history.' using errcode = '42501';
    end if;

    select match.id into v_match_id
    from public.marble_authoritative_matches match
    where match.room_id = p_room_id;

    if v_match_id is null then
        raise exception 'No authoritative match exists for this room.' using errcode = 'P0002';
    end if;

    with page as (
        select
            event.sequence,
            event.kind,
            event.actor_profile_id,
            event.payload,
            event.created_at
        from public.marble_authoritative_match_events event
        where event.match_id = v_match_id
          and event.sequence > v_after
        order by event.sequence
        limit v_limit
    )
    select
        coalesce(jsonb_agg(jsonb_build_object(
            'matchId', v_match_id::text,
            'sequence', page.sequence,
            'kind', page.kind,
            'actorProfileId', page.actor_profile_id,
            'payload', page.payload,
            'createdAt', (extract(epoch from page.created_at) * 1000)::bigint
        ) order by page.sequence), '[]'::jsonb),
        coalesce(min(page.sequence), 0),
        coalesce(max(page.sequence), 0),
        encode(digest(coalesce(string_agg(
            page.sequence::text || '|' || page.kind || '|' || coalesce(page.actor_profile_id, '') || '|' || page.payload::text || '|' || page.created_at::text,
            '||' order by page.sequence
        ), ''), 'sha256'), 'hex')
    into v_events, v_first_sequence, v_last_sequence, v_checksum
    from page;

    if v_last_sequence > 0 then
        select exists (
            select 1
            from public.marble_authoritative_match_events event
            where event.match_id = v_match_id
              and event.sequence > v_last_sequence
        ) into v_has_more;
    end if;

    return jsonb_build_object(
        'snapshot', private.marble_authoritative_snapshot(v_match_id),
        'events', v_events,
        'firstSequence', v_first_sequence,
        'lastSequence', v_last_sequence,
        'hasMore', v_has_more,
        'checksum', v_checksum
    );
end;
$$;

revoke all on function public.get_marble_authoritative_event_history(uuid, bigint, integer) from public, anon;
grant execute on function public.get_marble_authoritative_event_history(uuid, bigint, integer) to authenticated;

comment on function public.get_marble_authoritative_event_history(uuid, bigint, integer)
is 'Returns a bounded, ordered authoritative event page plus the latest snapshot for an authenticated room member, including spectators.';

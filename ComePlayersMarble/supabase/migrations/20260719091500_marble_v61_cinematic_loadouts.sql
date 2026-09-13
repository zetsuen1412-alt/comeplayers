-- ComePlayers Marble V61: server loadouts, active skills, round events, and cinematic event payloads.
-- Apply after 20260719074500_marble_v60_authoritative_special_tiles.sql.

alter table public.marble_realtime_room_members
    add column if not exists character_id text not null default 'alexia',
    add column if not exists active_skill_id text not null default 'route-override',
    add column if not exists pendant_id text not null default '',
    add column if not exists booster_id text not null default '';

alter table public.marble_authoritative_match_players
    add column if not exists character_id text not null default 'alexia',
    add column if not exists active_skill_id text not null default 'route-override',
    add column if not exists skill_used boolean not null default false,
    add column if not exists pendant_id text not null default '',
    add column if not exists booster_id text not null default '',
    add column if not exists free_upgrade_credits smallint not null default 0 check (free_upgrade_credits between 0 and 8);

alter table public.marble_authoritative_match_events
    drop constraint if exists marble_authoritative_match_events_kind_check;
alter table public.marble_authoritative_match_events
    add constraint marble_authoritative_match_events_kind_check check (kind in (
        'MATCH_STARTED', 'DICE_ROLLED', 'LANDING_RESOLVED', 'PROPERTY_PURCHASED',
        'PROPERTY_UPGRADED', 'RENT_PAID', 'PROPERTY_TAKEN_OVER', 'ASSET_LIQUIDATED',
        'PLAYER_BANKRUPT', 'SPECIAL_TILE_RESOLVED', 'FORTUNE_CARD_DRAWN',
        'GAME_CENTER_RESOLVED', 'OLYMPIC_APPLIED', 'OLYMPIC_EXPIRED',
        'WORLD_TRAVEL_COMPLETED', 'LOADOUT_APPLIED', 'CHARACTER_SKILL_ACTIVATED',
        'WORLD_EVENT_RESOLVED', 'ISLAND_ENTERED', 'ISLAND_TURN_SKIPPED',
        'TURN_ENDED', 'MATCH_FINISHED'
    ));

alter table public.marble_authoritative_match_commands
    drop constraint if exists marble_authoritative_match_commands_command_check;
alter table public.marble_authoritative_match_commands
    add constraint marble_authoritative_match_commands_command_check check (command in (
        'ROLL', 'PURCHASE', 'UPGRADE', 'TAKEOVER', 'GAME_CENTER_CHOICE',
        'SELECT_OLYMPIC', 'SELECT_TRAVEL', 'ACTIVATE_SKILL', 'END_TURN'
    ));

create or replace function public.configure_marble_authoritative_loadout(
    p_room_id uuid,
    p_character_id text,
    p_active_skill_id text,
    p_pendant_id text default '',
    p_booster_id text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_user_id uuid := (select auth.uid());
    v_room public.marble_realtime_rooms%rowtype;
    v_character text := lower(coalesce(p_character_id, ''));
    v_skill text := lower(coalesce(p_active_skill_id, ''));
    v_pendant text := lower(coalesce(p_pendant_id, ''));
    v_booster text := lower(coalesce(p_booster_id, ''));
begin
    if v_user_id is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
    select * into v_room from public.marble_realtime_rooms room where room.id = p_room_id for update;
    if not found then raise exception 'Realtime room was not found.' using errcode = 'P0002'; end if;
    if v_room.phase <> 'LOBBY' then raise exception 'Loadout can only be changed in the lobby.' using errcode = '55000'; end if;
    if v_character not in ('alexia','nova','lux','onyx','mira','volt') then raise exception 'Unknown character loadout.' using errcode = '22023'; end if;
    if v_skill not in ('route-override','turbo-capital','instant-permit','rent-barrier','safe-passage','overcharge') then raise exception 'Unknown character skill.' using errcode = '22023'; end if;
    if (v_character = 'alexia' and v_skill <> 'route-override')
       or (v_character = 'nova' and v_skill <> 'turbo-capital')
       or (v_character = 'lux' and v_skill <> 'instant-permit')
       or (v_character = 'onyx' and v_skill <> 'rent-barrier')
       or (v_character = 'mira' and v_skill <> 'safe-passage')
       or (v_character = 'volt' and v_skill <> 'overcharge') then
        raise exception 'Character and skill do not match.' using errcode = '22023';
    end if;
    if v_pendant not in ('','banker-badge','travel-compass','architect-blueprint','insurance-charm') then
        raise exception 'Unknown pendant loadout.' using errcode = '22023';
    end if;
    if v_booster not in ('','marble-fund','upgrade-permit','first-class-ticket','rent-shield') then
        raise exception 'Unknown booster loadout.' using errcode = '22023';
    end if;
    update public.marble_realtime_room_members
    set character_id = v_character,
        active_skill_id = v_skill,
        pendant_id = v_pendant,
        booster_id = v_booster,
        last_seen_at = now()
    where room_id = p_room_id and user_id = v_user_id and role = 'PLAYER';
    if not found then raise exception 'Only a player member can configure a match loadout.' using errcode = '42501'; end if;
    return jsonb_build_object(
        'roomId', p_room_id::text,
        'characterId', v_character,
        'activeSkillId', v_skill,
        'pendantId', v_pendant,
        'boosterId', v_booster
    );
end;
$$;

revoke all on function public.configure_marble_authoritative_loadout(uuid, text, text, text, text) from public, anon;
grant execute on function public.configure_marble_authoritative_loadout(uuid, text, text, text, text) to authenticated;

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
        'mode', coalesce(match.state ->> 'mode', room.mode, 'SOLO'),
        'revision', match.revision,
        'round', match.round,
        'maxRounds', coalesce((match.state ->> 'maxRounds')::integer, 12),
        'currentTurnSeat', match.current_turn_seat,
        'currentTurnProfileId', coalesce(current_player.profile_id, ''),
        'awaitingEndTurn', coalesce((match.state ->> 'awaitingEndTurn')::boolean, false),
        'lastDice', match.state -> 'lastDice',
        'pendingAction', match.state -> 'pendingAction',
        'landing', match.state -> 'landing',
        'specialResult', match.state -> 'specialResult',
        'worldEvent', match.state -> 'worldEvent',
        'winnerProfileId', coalesce(match.state ->> 'winnerProfileId', ''),
        'winnerTeamId', coalesce(match.state ->> 'winnerTeamId', ''),
        'finishReason', coalesce(match.state ->> 'finishReason', ''),
        'lastEventSequence', coalesce((
            select max(event.sequence) from public.marble_authoritative_match_events event where event.match_id = match.id
        ), 0),
        'players', coalesce((
            select jsonb_agg(jsonb_build_object(
                'profileId', player.profile_id,
                'displayName', player.display_name,
                'seat', player.seat,
                'teamId', player.team_id,
                'position', player.position,
                'money', player.money,
                'bankrupt', player.bankrupt,
                'islandTurns', player.island_turns,
                'travelCredits', player.travel_credits,
                'rentShieldPercent', player.rent_shield_percent,
                'rentShieldCharges', player.rent_shield_charges,
                'characterId', player.character_id,
                'activeSkillId', player.active_skill_id,
                'skillUsed', player.skill_used,
                'pendantId', player.pendant_id,
                'boosterId', player.booster_id,
                'freeUpgradeCredits', player.free_upgrade_credits,
                'propertyCount', (select count(*) from public.marble_authoritative_match_properties property where property.match_id = match.id and property.owner_user_id = player.user_id),
                'netWorth', player.money + coalesce((select sum(private.marble_property_value(property.tile_index, property.building_level)) from public.marble_authoritative_match_properties property where property.match_id = match.id and property.owner_user_id = player.user_id), 0)
            ) order by player.seat)
            from public.marble_authoritative_match_players player where player.match_id = match.id
        ), '[]'::jsonb),
        'properties', coalesce((
            select jsonb_agg(jsonb_build_object(
                'tileIndex', property.tile_index,
                'displayName', private.marble_board_tile(property.tile_index) ->> 'displayName',
                'tileType', private.marble_board_tile(property.tile_index) ->> 'tileType',
                'ownerProfileId', property.owner_profile_id,
                'ownerSeat', owner.seat,
                'buildingLevel', property.building_level,
                'rent', private.marble_property_rent(property.tile_index, property.building_level, property.rent_multiplier),
                'propertyValue', private.marble_property_value(property.tile_index, property.building_level),
                'takeoverCost', private.marble_property_value(property.tile_index, property.building_level) * 2,
                'rentMultiplier', property.rent_multiplier,
                'protected', property.protected,
                'olympicUntilRound', property.olympic_expires_round
            ) order by property.tile_index)
            from public.marble_authoritative_match_properties property
            join public.marble_authoritative_match_players owner on owner.match_id = property.match_id and owner.user_id = property.owner_user_id
            where property.match_id = match.id
        ), '[]'::jsonb),
        'updatedAt', (extract(epoch from match.updated_at) * 1000)::bigint
    )
    from public.marble_authoritative_matches match
    join public.marble_realtime_rooms room on room.id = match.room_id
    left join public.marble_authoritative_match_players current_player
      on current_player.match_id = match.id and current_player.seat = match.current_turn_seat
    where match.id = target_match_id;
$$;
revoke all on function private.marble_authoritative_snapshot(uuid) from public;

alter function public.start_marble_authoritative_match(uuid)
    rename to start_marble_authoritative_match_v60;
alter function public.submit_marble_authoritative_command(uuid, text, bigint, text, jsonb)
    rename to submit_marble_authoritative_command_v60;

revoke all on function public.start_marble_authoritative_match_v60(uuid) from public, anon, authenticated;
revoke all on function public.submit_marble_authoritative_command_v60(uuid, text, bigint, text, jsonb) from public, anon, authenticated;

create or replace function public.start_marble_authoritative_match(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_snapshot jsonb;
    v_match_id uuid;
    v_sequence bigint;
begin
    if (select auth.uid()) is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
    v_snapshot := public.start_marble_authoritative_match_v60(p_room_id);
    v_match_id := (v_snapshot ->> 'matchId')::uuid;

    update public.marble_authoritative_match_players player
    set character_id = member.character_id,
        active_skill_id = member.active_skill_id,
        skill_used = false,
        pendant_id = member.pendant_id,
        booster_id = member.booster_id,
        money = least(2000000000, player.money
            + case when member.pendant_id = 'banker-badge' then 200000 else 0 end
            + case when member.booster_id = 'marble-fund' then 150000 else 0 end),
        travel_credits = least(8, player.travel_credits
            + case when member.pendant_id = 'travel-compass' then 1 else 0 end
            + case when member.booster_id = 'first-class-ticket' then 1 else 0 end),
        free_upgrade_credits = least(8, player.free_upgrade_credits
            + case when member.pendant_id = 'architect-blueprint' then 1 else 0 end
            + case when member.booster_id = 'upgrade-permit' then 1 else 0 end),
        rent_shield_percent = greatest(player.rent_shield_percent,
            case when member.pendant_id = 'insurance-charm' then 35 else 0 end,
            case when member.booster_id = 'rent-shield' then 50 else 0 end),
        rent_shield_charges = least(8, player.rent_shield_charges
            + case when member.pendant_id = 'insurance-charm' then 1 else 0 end
            + case when member.booster_id = 'rent-shield' then 1 else 0 end)
    from public.marble_realtime_room_members member
    where player.match_id = v_match_id
      and member.room_id = p_room_id
      and member.user_id = player.user_id;

    select coalesce(max(event.sequence), 0) into v_sequence
    from public.marble_authoritative_match_events event where event.match_id = v_match_id;
    insert into public.marble_authoritative_match_events (
        match_id, sequence, kind, actor_user_id, actor_profile_id, payload
    )
    select
        v_match_id,
        v_sequence + row_number() over (order by player.seat),
        'LOADOUT_APPLIED',
        player.user_id,
        player.profile_id,
        jsonb_build_object(
            'characterId', player.character_id,
            'activeSkillId', player.active_skill_id,
            'pendantId', player.pendant_id,
            'boosterId', player.booster_id,
            'freeUpgradeCredits', player.free_upgrade_credits,
            'travelCredits', player.travel_credits,
            'rentShieldPercent', player.rent_shield_percent
        )
    from public.marble_authoritative_match_players player
    where player.match_id = v_match_id;

    update public.marble_authoritative_matches
    set revision = revision + 1,
        state = state || jsonb_build_object('worldEvent', null, 'lastWorldEventRound', 0),
        updated_at = now()
    where id = v_match_id;
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
    v_message text := '';
    v_amount bigint := 0;
    v_round_event jsonb := null;
    v_random integer;
    v_target_profile text := '';
    v_pending_before jsonb := null;
    v_free_upgrade_cost bigint := 0;
    v_round_events_enabled boolean := true;
begin
    if v_user_id is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
    if p_command not in (
        'ROLL','PURCHASE','UPGRADE','TAKEOVER','GAME_CENTER_CHOICE',
        'SELECT_OLYMPIC','SELECT_TRAVEL','ACTIVATE_SKILL','END_TURN'
    ) then raise exception 'Unsupported authoritative command.' using errcode = '22023'; end if;
    if p_idempotency_key !~ '^[A-Za-z0-9_-]{8,80}$' then raise exception 'Invalid idempotency key.' using errcode = '22023'; end if;

    select command.result into v_existing
    from public.marble_authoritative_match_commands command
    where command.match_id = p_match_id and command.user_id = v_user_id and command.idempotency_key = p_idempotency_key;
    if v_existing is not null then return v_existing; end if;

    select * into v_match from public.marble_authoritative_matches match where match.id = p_match_id for update;
    if not found then raise exception 'Authoritative match was not found.' using errcode = 'P0002'; end if;
    if v_match.phase <> 'ACTIVE' then raise exception 'The authoritative match is not active.' using errcode = '55000'; end if;
    if v_match.revision <> p_expected_revision then raise exception 'Revision conflict. Refresh authoritative state.' using errcode = '40001'; end if;
    select * into v_player from public.marble_authoritative_match_players player
    where player.match_id = p_match_id and player.user_id = v_user_id for update;
    if not found or v_player.seat <> v_match.current_turn_seat then raise exception 'It is not your authoritative turn.' using errcode = '42501'; end if;

    if p_command = 'ACTIVATE_SKILL' then
        if v_player.skill_used then raise exception 'Character skill was already used this match.' using errcode = '55000'; end if;
        if coalesce((v_match.state ->> 'awaitingEndTurn')::boolean, false) or v_match.state -> 'pendingAction' is not null then
            raise exception 'Activate the character skill before rolling or choosing another action.' using errcode = '55000';
        end if;
        if v_player.active_skill_id = 'route-override' then
            update public.marble_authoritative_match_players set travel_credits = least(8, travel_credits + 1), skill_used = true
            where match_id = p_match_id and user_id = v_user_id;
            v_message := 'Route Override granted one World Travel credit.';
        elsif v_player.active_skill_id = 'turbo-capital' then
            v_amount := 250000;
            update public.marble_authoritative_match_players set money = least(2000000000, money + v_amount), skill_used = true
            where match_id = p_match_id and user_id = v_user_id;
            v_message := 'Turbo Capital awarded CP 250,000.';
        elsif v_player.active_skill_id = 'instant-permit' then
            update public.marble_authoritative_match_players set free_upgrade_credits = least(8, free_upgrade_credits + 1), skill_used = true
            where match_id = p_match_id and user_id = v_user_id;
            v_message := 'Instant Permit granted one free upgrade credit.';
        elsif v_player.active_skill_id = 'rent-barrier' then
            update public.marble_authoritative_match_players
            set rent_shield_percent = greatest(rent_shield_percent, 60), rent_shield_charges = least(8, rent_shield_charges + 1), skill_used = true
            where match_id = p_match_id and user_id = v_user_id;
            v_message := 'Rent Barrier protects the next rent payment by 60%.';
        elsif v_player.active_skill_id = 'safe-passage' then
            update public.marble_authoritative_match_players
            set island_turns = 0, travel_credits = least(8, travel_credits + 1), skill_used = true
            where match_id = p_match_id and user_id = v_user_id;
            v_message := 'Safe Passage cleared Island detention and granted one travel credit.';
        elsif v_player.active_skill_id = 'overcharge' then
            v_amount := 120000;
            update public.marble_authoritative_match_players
            set money = least(2000000000, money + v_amount), free_upgrade_credits = least(8, free_upgrade_credits + 1), skill_used = true
            where match_id = p_match_id and user_id = v_user_id;
            v_message := 'Overcharge awarded CP 120,000 and one free upgrade credit.';
        else
            raise exception 'The configured character skill is invalid.' using errcode = '22023';
        end if;
        select coalesce(max(event.sequence), 0) + 1 into v_sequence
        from public.marble_authoritative_match_events event where event.match_id = p_match_id;
        update public.marble_authoritative_matches set revision = revision + 1, updated_at = now() where id = p_match_id;
        insert into public.marble_authoritative_match_events (
            match_id, sequence, kind, actor_user_id, actor_profile_id, payload
        ) values (
            p_match_id, v_sequence, 'CHARACTER_SKILL_ACTIVATED', v_user_id, v_player.profile_id,
            jsonb_build_object('characterId',v_player.character_id,'skillId',v_player.active_skill_id,'message',v_message,'amount',v_amount)
        );
        v_snapshot := private.marble_authoritative_snapshot(p_match_id);
        insert into public.marble_authoritative_match_commands (
            match_id,user_id,idempotency_key,command,expected_revision,result
        ) values (p_match_id,v_user_id,p_idempotency_key,p_command,p_expected_revision,v_snapshot);
        return v_snapshot;
    end if;

    if p_command = 'UPGRADE' and v_player.free_upgrade_credits > 0
       and coalesce(v_match.state -> 'pendingAction' ->> 'kind','') = 'UPGRADE' then
        v_pending_before := v_match.state -> 'pendingAction';
        v_free_upgrade_cost := coalesce((v_pending_before ->> 'cost')::bigint, 0);
    end if;

    v_snapshot := public.submit_marble_authoritative_command_v60(
        p_match_id,p_command,p_expected_revision,p_idempotency_key,p_payload
    );

    if p_command = 'UPGRADE' and v_free_upgrade_cost > 0 then
        update public.marble_authoritative_match_players
        set money = least(2000000000, money + v_free_upgrade_cost),
            free_upgrade_credits = greatest(0, free_upgrade_credits - 1)
        where match_id = p_match_id and user_id = v_user_id and free_upgrade_credits > 0;
        if found then
            select coalesce(max(event.sequence), 0) + 1 into v_sequence
            from public.marble_authoritative_match_events event where event.match_id = p_match_id;
            update public.marble_authoritative_matches set revision = revision + 1, updated_at = now() where id = p_match_id;
            insert into public.marble_authoritative_match_events (
                match_id,sequence,kind,actor_user_id,actor_profile_id,payload
            ) values (
                p_match_id,v_sequence,'LOADOUT_APPLIED',v_user_id,v_player.profile_id,
                jsonb_build_object('effect','FREE_UPGRADE_USED','amount',v_free_upgrade_cost,'tileIndex',coalesce((v_pending_before ->> 'tileIndex')::integer,0))
            );
            v_snapshot := private.marble_authoritative_snapshot(p_match_id);
            update public.marble_authoritative_match_commands set result = v_snapshot
            where match_id = p_match_id and user_id = v_user_id and idempotency_key = p_idempotency_key;
        end if;
    end if;

    if p_command = 'END_TURN' then
        select * into v_match from public.marble_authoritative_matches match where match.id = p_match_id for update;
        select coalesce((room.settings ->> 'roundEvents')::boolean, true) into v_round_events_enabled
        from public.marble_realtime_rooms room where room.id = v_match.room_id;
        if v_round_events_enabled and v_match.phase = 'ACTIVE' and mod(v_match.round,2) = 0
           and v_match.round > coalesce((v_match.state ->> 'lastWorldEventRound')::integer,0) then
            v_random := get_byte(gen_random_bytes(1),0) % 6;
            if v_random = 0 then
                v_amount := 120000;
                update public.marble_authoritative_match_players set money = least(2000000000,money+v_amount)
                where match_id = p_match_id and bankrupt = false;
                v_round_event := jsonb_build_object('id','SPONSOR_DROP','title','Sponsor Drop','message','All active players received CP 120,000.','amount',v_amount,'round',v_match.round,'targetProfileId','');
            elsif v_random = 1 then
                update public.marble_authoritative_match_players set free_upgrade_credits = least(8,free_upgrade_credits+1)
                where match_id = p_match_id and bankrupt = false;
                v_round_event := jsonb_build_object('id','CONSTRUCTION_GRANT','title','Construction Grant','message','All active players received one free upgrade credit.','amount',1,'round',v_match.round,'targetProfileId','');
            elsif v_random = 2 then
                update public.marble_authoritative_match_players set travel_credits = least(8,travel_credits+1)
                where match_id = p_match_id and bankrupt = false;
                v_round_event := jsonb_build_object('id','TRAVEL_FESTIVAL','title','Travel Festival','message','All active players received one World Travel credit.','amount',1,'round',v_match.round,'targetProfileId','');
            elsif v_random = 3 then
                update public.marble_authoritative_match_players
                set rent_shield_percent = greatest(rent_shield_percent,35), rent_shield_charges = least(8,rent_shield_charges+1)
                where match_id = p_match_id and bankrupt = false;
                v_round_event := jsonb_build_object('id','INSURANCE_DAY','title','Insurance Day','message','All active players received one 35% rent shield.','amount',35,'round',v_match.round,'targetProfileId','');
            elsif v_random = 4 then
                update public.marble_authoritative_match_players player
                set money = greatest(0,player.money - 15000 * (select count(*) from public.marble_authoritative_match_properties property where property.match_id=p_match_id and property.owner_user_id=player.user_id))
                where player.match_id = p_match_id and player.bankrupt = false;
                v_round_event := jsonb_build_object('id','CITY_MAINTENANCE','title','City Maintenance','message','Owners paid CP 15,000 per city.','amount',-15000,'round',v_match.round,'targetProfileId','');
            else
                select player.profile_id into v_target_profile
                from public.marble_authoritative_match_players player
                where player.match_id=p_match_id and player.bankrupt=false
                order by player.money,player.seat limit 1;
                v_amount := 250000;
                update public.marble_authoritative_match_players set money=least(2000000000,money+v_amount)
                where match_id=p_match_id and profile_id=v_target_profile;
                v_round_event := jsonb_build_object('id','COMEBACK_FUND','title','Comeback Fund','message','The lowest-balance player received CP 250,000.','amount',v_amount,'round',v_match.round,'targetProfileId',coalesce(v_target_profile,''));
            end if;
            select coalesce(max(event.sequence),0)+1 into v_sequence
            from public.marble_authoritative_match_events event where event.match_id=p_match_id;
            update public.marble_authoritative_matches
            set revision=revision+1,
                state=state || jsonb_build_object('worldEvent',v_round_event,'lastWorldEventRound',v_match.round),
                updated_at=now()
            where id=p_match_id;
            insert into public.marble_authoritative_match_events (
                match_id,sequence,kind,actor_user_id,actor_profile_id,payload
            ) values (p_match_id,v_sequence,'WORLD_EVENT_RESOLVED',v_user_id,v_player.profile_id,v_round_event);
            v_snapshot := private.marble_authoritative_snapshot(p_match_id);
            update public.marble_authoritative_match_commands set result=v_snapshot
            where match_id=p_match_id and user_id=v_user_id and idempotency_key=p_idempotency_key;
        end if;
    end if;
    return v_snapshot;
end;
$$;

revoke all on function public.start_marble_authoritative_match(uuid) from public, anon;
revoke all on function public.submit_marble_authoritative_command(uuid, text, bigint, text, jsonb) from public, anon;
grant execute on function public.start_marble_authoritative_match(uuid) to authenticated;
grant execute on function public.submit_marble_authoritative_command(uuid, text, bigint, text, jsonb) to authenticated;

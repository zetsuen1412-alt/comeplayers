-- ComePlayers Marble V60: authoritative special tiles and live-board snapshot fields.
-- Apply after 20260719061200_marble_v59_authoritative_economy.sql.

alter table public.marble_authoritative_match_players
    add column if not exists island_turns smallint not null default 0 check (island_turns between 0 and 8),
    add column if not exists travel_credits smallint not null default 0 check (travel_credits between 0 and 8),
    add column if not exists rent_shield_percent smallint not null default 0 check (rent_shield_percent between 0 and 90),
    add column if not exists rent_shield_charges smallint not null default 0 check (rent_shield_charges between 0 and 8);

alter table public.marble_authoritative_match_properties
    add column if not exists olympic_expires_round integer not null default 0 check (olympic_expires_round between 0 and 999);

alter table public.marble_authoritative_match_events
    drop constraint if exists marble_authoritative_match_events_kind_check;
alter table public.marble_authoritative_match_events
    add constraint marble_authoritative_match_events_kind_check check (kind in (
        'MATCH_STARTED', 'DICE_ROLLED', 'LANDING_RESOLVED', 'PROPERTY_PURCHASED',
        'PROPERTY_UPGRADED', 'RENT_PAID', 'PROPERTY_TAKEN_OVER', 'ASSET_LIQUIDATED',
        'PLAYER_BANKRUPT', 'SPECIAL_TILE_RESOLVED', 'FORTUNE_CARD_DRAWN',
        'GAME_CENTER_RESOLVED', 'OLYMPIC_APPLIED', 'OLYMPIC_EXPIRED',
        'WORLD_TRAVEL_COMPLETED', 'ISLAND_ENTERED', 'ISLAND_TURN_SKIPPED',
        'TURN_ENDED', 'MATCH_FINISHED'
    ));

alter table public.marble_authoritative_match_commands
    drop constraint if exists marble_authoritative_match_commands_command_check;
alter table public.marble_authoritative_match_commands
    add constraint marble_authoritative_match_commands_command_check check (command in (
        'ROLL', 'PURCHASE', 'UPGRADE', 'TAKEOVER', 'GAME_CENTER_CHOICE',
        'SELECT_OLYMPIC', 'SELECT_TRAVEL', 'END_TURN'
    ));

-- Replace payment so a one-use rent shield is consumed by the server before liquidation.
create or replace function private.marble_apply_authoritative_payment(
    p_match_id uuid,
    p_debtor_user_id uuid,
    p_creditor_user_id uuid,
    p_amount bigint,
    p_reason text,
    p_tile_index integer,
    p_sequence_start bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_debtor public.marble_authoritative_match_players%rowtype;
    v_property public.marble_authoritative_match_properties%rowtype;
    v_value bigint;
    v_sale bigint;
    v_paid bigint;
    v_effective_amount bigint := greatest(0, p_amount);
    v_discount bigint := 0;
    v_sequence bigint := p_sequence_start;
    v_bankrupt boolean := false;
    v_remaining_count integer := 0;
begin
    select * into v_debtor from public.marble_authoritative_match_players player
    where player.match_id = p_match_id and player.user_id = p_debtor_user_id for update;
    if not found then
        raise exception 'Payment debtor is not a match player.' using errcode = 'P0002';
    end if;

    if p_reason = 'RENT' and v_debtor.rent_shield_charges > 0 and v_debtor.rent_shield_percent > 0 then
        v_discount := round(v_effective_amount * v_debtor.rent_shield_percent / 100.0)::bigint;
        v_effective_amount := greatest(0, v_effective_amount - v_discount);
        update public.marble_authoritative_match_players
        set rent_shield_charges = greatest(0, rent_shield_charges - 1),
            rent_shield_percent = case when rent_shield_charges <= 1 then 0 else rent_shield_percent end
        where match_id = p_match_id and user_id = p_debtor_user_id
        returning * into v_debtor;
    end if;

    while v_debtor.money < v_effective_amount loop
        select * into v_property
        from public.marble_authoritative_match_properties property
        where property.match_id = p_match_id and property.owner_user_id = p_debtor_user_id
        order by private.marble_property_value(property.tile_index, property.building_level) desc, property.tile_index
        limit 1 for update;
        exit when not found;
        v_value := private.marble_property_value(v_property.tile_index, v_property.building_level);
        v_sale := round(v_value * 0.70)::bigint;
        delete from public.marble_authoritative_match_properties
        where match_id = p_match_id and tile_index = v_property.tile_index;
        update public.marble_authoritative_match_players
        set money = money + v_sale where match_id = p_match_id and user_id = p_debtor_user_id
        returning * into v_debtor;
        insert into public.marble_authoritative_match_events (
            match_id, sequence, kind, actor_user_id, actor_profile_id, payload
        ) values (
            p_match_id, v_sequence, 'ASSET_LIQUIDATED', p_debtor_user_id, v_debtor.profile_id,
            jsonb_build_object('tileIndex', v_property.tile_index, 'propertyValue', v_value, 'saleValue', v_sale, 'reason', p_reason)
        );
        v_sequence := v_sequence + 1;
    end loop;

    v_paid := least(v_effective_amount, v_debtor.money);
    update public.marble_authoritative_match_players
    set money = money - v_paid where match_id = p_match_id and user_id = p_debtor_user_id
    returning * into v_debtor;
    if p_creditor_user_id is not null and v_paid > 0 then
        update public.marble_authoritative_match_players
        set money = money + v_paid where match_id = p_match_id and user_id = p_creditor_user_id;
    end if;

    if v_paid < v_effective_amount then
        v_bankrupt := true;
        select count(*) into v_remaining_count
        from public.marble_authoritative_match_properties property
        where property.match_id = p_match_id and property.owner_user_id = p_debtor_user_id;
        delete from public.marble_authoritative_match_properties
        where match_id = p_match_id and owner_user_id = p_debtor_user_id;
        update public.marble_authoritative_match_players
        set money = 0, bankrupt = true where match_id = p_match_id and user_id = p_debtor_user_id;
        insert into public.marble_authoritative_match_events (
            match_id, sequence, kind, actor_user_id, actor_profile_id, payload
        ) values (
            p_match_id, v_sequence, 'PLAYER_BANKRUPT', p_debtor_user_id, v_debtor.profile_id,
            jsonb_build_object('reason', p_reason, 'amountDue', v_effective_amount, 'amountPaid', v_paid, 'propertiesReturned', v_remaining_count)
        );
        v_sequence := v_sequence + 1;
    end if;
    return jsonb_build_object(
        'paid', v_paid,
        'discount', v_discount,
        'effectiveAmount', v_effective_amount,
        'bankrupt', v_bankrupt,
        'nextSequence', v_sequence
    );
end;
$$;
revoke all on function private.marble_apply_authoritative_payment(uuid, uuid, uuid, bigint, text, integer, bigint) from public;

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

-- Preserve the V59 reducers behind authenticated wrappers.
alter function public.start_marble_authoritative_match(uuid)
    rename to start_marble_authoritative_match_v59;
alter function public.submit_marble_authoritative_command(uuid, text, bigint, text, jsonb)
    rename to submit_marble_authoritative_command_v59;

revoke all on function public.start_marble_authoritative_match_v59(uuid) from public, anon, authenticated;
revoke all on function public.submit_marble_authoritative_command_v59(uuid, text, bigint, text, jsonb) from public, anon, authenticated;

create or replace function public.start_marble_authoritative_match(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_snapshot jsonb;
    v_match_id uuid;
begin
    if (select auth.uid()) is null then
        raise exception 'Authentication is required.' using errcode = '42501';
    end if;
    v_snapshot := public.start_marble_authoritative_match_v59(p_room_id);
    v_match_id := (v_snapshot ->> 'matchId')::uuid;
    update public.marble_authoritative_matches
    set state = state || jsonb_build_object('specialResult', null), updated_at = now()
    where id = v_match_id and not (state ? 'specialResult');
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
    v_existing jsonb;
    v_snapshot jsonb;
    v_match public.marble_authoritative_matches%rowtype;
    v_player public.marble_authoritative_match_players%rowtype;
    v_property public.marble_authoritative_match_properties%rowtype;
    v_sequence bigint;
    v_landing_type text;
    v_tile_index integer;
    v_tile jsonb;
    v_pending jsonb := null;
    v_special jsonb := null;
    v_options jsonb := '[]'::jsonb;
    v_random integer;
    v_amount bigint := 0;
    v_payment jsonb;
    v_selected integer;
    v_server_number integer;
    v_cost bigint;
    v_target_name text;
    v_changed integer := 0;
    v_event_kind text;
begin
    if v_user_id is null then
        raise exception 'Authentication is required.' using errcode = '42501';
    end if;
    if p_command not in (
        'ROLL', 'PURCHASE', 'UPGRADE', 'TAKEOVER', 'GAME_CENTER_CHOICE',
        'SELECT_OLYMPIC', 'SELECT_TRAVEL', 'END_TURN'
    ) then
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
    if v_existing is not null then return v_existing; end if;

    -- Island turns are server-side skipped rolls, not client timers.
    if p_command = 'ROLL' then
        select * into v_match from public.marble_authoritative_matches match where match.id = p_match_id for update;
        if not found then raise exception 'Authoritative match was not found.' using errcode = 'P0002'; end if;
        if v_match.phase <> 'ACTIVE' then raise exception 'The authoritative match is not active.' using errcode = '55000'; end if;
        if v_match.revision <> p_expected_revision then raise exception 'Revision conflict. Refresh authoritative state.' using errcode = '40001'; end if;
        select * into v_player from public.marble_authoritative_match_players player
        where player.match_id = p_match_id and player.user_id = v_user_id for update;
        if not found or v_player.seat <> v_match.current_turn_seat then
            raise exception 'It is not your authoritative turn.' using errcode = '42501';
        end if;
        if v_player.island_turns > 0 then
            select coalesce(max(event.sequence), 0) + 1 into v_sequence
            from public.marble_authoritative_match_events event where event.match_id = p_match_id;
            update public.marble_authoritative_match_players
            set island_turns = greatest(0, island_turns - 1)
            where match_id = p_match_id and user_id = v_user_id
            returning * into v_player;
            v_special := jsonb_build_object(
                'kind', 'ISLAND', 'title', 'Island Detention',
                'message', case when v_player.island_turns > 0 then 'Turn skipped. One Island turn remains.' else 'Turn skipped. You may roll normally next turn.' end,
                'amount', 0, 'tileIndex', 8, 'targetTileIndex', 8, 'cardId', ''
            );
            update public.marble_authoritative_matches
            set revision = revision + 1,
                state = state || jsonb_build_object(
                    'awaitingEndTurn', true,
                    'lastDice', null,
                    'pendingAction', null,
                    'landing', jsonb_build_object('tileIndex', 8, 'tileType', 'ISLAND', 'displayName', 'Island'),
                    'specialResult', v_special
                ),
                updated_at = now()
            where id = p_match_id;
            insert into public.marble_authoritative_match_events (
                match_id, sequence, kind, actor_user_id, actor_profile_id, payload
            ) values (
                p_match_id, v_sequence, 'ISLAND_TURN_SKIPPED', v_user_id, v_player.profile_id,
                jsonb_build_object('remainingTurns', v_player.island_turns)
            );
            v_snapshot := private.marble_authoritative_snapshot(p_match_id);
            insert into public.marble_authoritative_match_commands (
                match_id, user_id, idempotency_key, command, expected_revision, result
            ) values (p_match_id, v_user_id, p_idempotency_key, p_command, p_expected_revision, v_snapshot);
            return v_snapshot;
        end if;
    end if;

    if p_command in ('ROLL', 'PURCHASE', 'UPGRADE', 'TAKEOVER', 'END_TURN') then
        v_snapshot := public.submit_marble_authoritative_command_v59(
            p_match_id, p_command, p_expected_revision, p_idempotency_key, p_payload
        );

        if p_command = 'ROLL' then
            v_landing_type := coalesce(v_snapshot -> 'landing' ->> 'tileType', '');
            v_tile_index := coalesce((v_snapshot -> 'landing' ->> 'tileIndex')::integer, 0);
            select * into v_match from public.marble_authoritative_matches match where match.id = p_match_id for update;
            select * into v_player from public.marble_authoritative_match_players player
            where player.match_id = p_match_id and player.user_id = v_user_id for update;
            select coalesce(max(event.sequence), 0) + 1 into v_sequence
            from public.marble_authoritative_match_events event where event.match_id = p_match_id;
            v_pending := v_match.state -> 'pendingAction';
            v_special := null;

            if v_landing_type = 'FORTUNE' then
                v_random := get_byte(gen_random_bytes(1), 0) % 6;
                if v_random = 0 then
                    v_amount := 250000;
                    update public.marble_authoritative_match_players set money = money + v_amount
                    where match_id = p_match_id and user_id = v_user_id;
                    v_special := jsonb_build_object('kind','FORTUNE','title','Marble Jackpot','message','Fortune awarded CP 250,000.','amount',v_amount,'tileIndex',v_tile_index,'targetTileIndex',v_tile_index,'cardId','JACKPOT');
                elsif v_random = 1 then
                    v_amount := 150000;
                    update public.marble_authoritative_match_players set money = money + v_amount
                    where match_id = p_match_id and user_id = v_user_id;
                    v_special := jsonb_build_object('kind','FORTUNE','title','Sponsor Contract','message','A sponsor awarded CP 150,000.','amount',v_amount,'tileIndex',v_tile_index,'targetTileIndex',v_tile_index,'cardId','SPONSOR');
                elsif v_random = 2 then
                    v_payment := private.marble_apply_authoritative_payment(p_match_id, v_user_id, null, 120000, 'FORTUNE_AUDIT', v_tile_index, v_sequence);
                    v_amount := -((v_payment ->> 'paid')::bigint);
                    v_sequence := (v_payment ->> 'nextSequence')::bigint;
                    v_special := jsonb_build_object('kind','FORTUNE','title','System Audit','message','Fortune charged an audit fee.','amount',v_amount,'tileIndex',v_tile_index,'targetTileIndex',v_tile_index,'cardId','AUDIT');
                elsif v_random = 3 then
                    update public.marble_authoritative_match_players set travel_credits = least(8, travel_credits + 1)
                    where match_id = p_match_id and user_id = v_user_id;
                    v_special := jsonb_build_object('kind','FORTUNE','title','First Class Pass','message','You received one free World Travel credit.','amount',0,'tileIndex',v_tile_index,'targetTileIndex',v_tile_index,'cardId','TRAVEL_PASS');
                elsif v_random = 4 then
                    update public.marble_authoritative_match_players
                    set rent_shield_percent = greatest(rent_shield_percent, 50),
                        rent_shield_charges = least(8, rent_shield_charges + 1)
                    where match_id = p_match_id and user_id = v_user_id;
                    v_special := jsonb_build_object('kind','FORTUNE','title','Rent Barrier','message','Your next rent payment is reduced by 50%.','amount',0,'tileIndex',v_tile_index,'targetTileIndex',v_tile_index,'cardId','RENT_SHIELD');
                else
                    v_amount := 100000;
                    update public.marble_authoritative_match_players set money = money + v_amount
                    where match_id = p_match_id and user_id = v_user_id;
                    v_special := jsonb_build_object('kind','FORTUNE','title','Tax Rebate','message','A city rebate awarded CP 100,000.','amount',v_amount,'tileIndex',v_tile_index,'targetTileIndex',v_tile_index,'cardId','REBATE');
                end if;
                insert into public.marble_authoritative_match_events (
                    match_id, sequence, kind, actor_user_id, actor_profile_id, payload
                ) values (p_match_id, v_sequence, 'FORTUNE_CARD_DRAWN', v_user_id, v_player.profile_id, v_special);

            elsif v_landing_type = 'GAME_CENTER' then
                v_pending := jsonb_build_object('kind','GAME_CENTER','tileIndex',v_tile_index,'displayName','Game Center','cost',0,'targetLevel',0,'ownerProfileId','','options',jsonb_build_array(1,2,3));
                v_special := jsonb_build_object('kind','GAME_CENTER','title','Game Center','message','Choose a number from 1 to 3. The server will draw the winning number.','amount',0,'tileIndex',v_tile_index,'targetTileIndex',v_tile_index,'cardId','');

            elsif v_landing_type = 'OLYMPIC' then
                select coalesce(jsonb_agg(option.tile_index order by option.tile_index), '[]'::jsonb) into v_options
                from (
                    select property.tile_index
                    from public.marble_authoritative_match_properties property
                    where property.match_id = p_match_id
                      and property.owner_user_id = v_user_id
                      and property.rent_multiplier < 3
                    order by property.tile_index limit 8
                ) option;
                if jsonb_array_length(v_options) > 0 then
                    v_pending := jsonb_build_object('kind','OLYMPIC','tileIndex',v_tile_index,'displayName','Olympic Host City','cost',0,'targetLevel',0,'ownerProfileId',v_player.profile_id,'options',v_options);
                    v_special := jsonb_build_object('kind','OLYMPIC','title','Olympic Selection','message','Select one of your cities for a temporary rent multiplier.','amount',0,'tileIndex',v_tile_index,'targetTileIndex',v_tile_index,'cardId','');
                else
                    v_special := jsonb_build_object('kind','OLYMPIC','title','Olympic Selection','message','No eligible owned city is available.','amount',0,'tileIndex',v_tile_index,'targetTileIndex',v_tile_index,'cardId','');
                end if;

            elsif v_landing_type = 'WORLD_TRAVEL' then
                if v_player.travel_credits > 0 or v_player.money >= 150000 then
                    select coalesce(jsonb_agg(option.tile_index order by option.tile_index), '[]'::jsonb) into v_options
                    from (
                        select board_index as tile_index
                        from generate_series(1,31) board_index
                        where (private.marble_board_tile(board_index) ->> 'purchasable')::boolean
                          and board_index <> v_player.position
                          and (
                              not exists (
                                  select 1 from public.marble_authoritative_match_properties property
                                  where property.match_id = p_match_id and property.tile_index = board_index
                              )
                              or exists (
                                  select 1 from public.marble_authoritative_match_properties property
                                  where property.match_id = p_match_id and property.tile_index = board_index and property.owner_user_id = v_user_id
                              )
                          )
                        order by board_index limit 8
                    ) option;
                    if jsonb_array_length(v_options) > 0 then
                        v_pending := jsonb_build_object('kind','WORLD_TRAVEL','tileIndex',v_tile_index,'displayName','World Travel','cost',case when v_player.travel_credits > 0 then 0 else 150000 end,'targetLevel',0,'ownerProfileId',v_player.profile_id,'options',v_options);
                        v_special := jsonb_build_object('kind','WORLD_TRAVEL','title','World Travel','message','Select a safe destination city.','amount',0,'tileIndex',v_tile_index,'targetTileIndex',v_tile_index,'cardId','');
                    else
                        v_special := jsonb_build_object('kind','WORLD_TRAVEL','title','World Travel','message','No safe destination is currently available.','amount',0,'tileIndex',v_tile_index,'targetTileIndex',v_tile_index,'cardId','');
                    end if;
                else
                    v_special := jsonb_build_object('kind','WORLD_TRAVEL','title','World Travel','message','CP 150,000 or one travel credit is required.','amount',0,'tileIndex',v_tile_index,'targetTileIndex',v_tile_index,'cardId','');
                end if;

            elsif v_landing_type = 'ISLAND' then
                update public.marble_authoritative_match_players set island_turns = 2
                where match_id = p_match_id and user_id = v_user_id;
                v_special := jsonb_build_object('kind','ISLAND','title','Island Detention','message','Your next two turns will be skipped.','amount',0,'tileIndex',v_tile_index,'targetTileIndex',v_tile_index,'cardId','');
                insert into public.marble_authoritative_match_events (
                    match_id, sequence, kind, actor_user_id, actor_profile_id, payload
                ) values (p_match_id, v_sequence, 'ISLAND_ENTERED', v_user_id, v_player.profile_id, jsonb_build_object('turns',2));

            elsif v_landing_type = 'TAX' then
                v_special := jsonb_build_object('kind','TAX','title','System Tax','message','The server resolved the CP 100,000 tax and any required liquidation.','amount',-100000,'tileIndex',v_tile_index,'targetTileIndex',v_tile_index,'cardId','');
            elsif v_landing_type = 'BONUS_GAME' then
                v_special := jsonb_build_object('kind','BONUS_GAME','title','Bonus Game','message','The server awarded CP 120,000.','amount',120000,'tileIndex',v_tile_index,'targetTileIndex',v_tile_index,'cardId','');
            end if;

            update public.marble_authoritative_matches
            set revision = revision + 1,
                state = state || jsonb_build_object('pendingAction', v_pending, 'specialResult', v_special),
                updated_at = now()
            where id = p_match_id;
            v_snapshot := private.marble_authoritative_snapshot(p_match_id);
            update public.marble_authoritative_match_commands
            set result = v_snapshot
            where match_id = p_match_id and user_id = v_user_id and idempotency_key = p_idempotency_key;
            return v_snapshot;
        end if;

        if p_command = 'END_TURN' then
            select * into v_match from public.marble_authoritative_matches match where match.id = p_match_id for update;
            update public.marble_authoritative_match_properties
            set rent_multiplier = 1, olympic_expires_round = 0, updated_at = now()
            where match_id = p_match_id
              and olympic_expires_round > 0
              and olympic_expires_round <= v_match.round;
            get diagnostics v_changed = row_count;
            if v_changed > 0 then
                select coalesce(max(event.sequence), 0) + 1 into v_sequence
                from public.marble_authoritative_match_events event where event.match_id = p_match_id;
                update public.marble_authoritative_matches set revision = revision + 1, updated_at = now() where id = p_match_id;
                insert into public.marble_authoritative_match_events (
                    match_id, sequence, kind, actor_user_id, actor_profile_id, payload
                ) values (
                    p_match_id, v_sequence, 'OLYMPIC_EXPIRED', v_user_id,
                    coalesce((select profile_id from public.marble_authoritative_match_players where match_id = p_match_id and user_id = v_user_id), ''),
                    jsonb_build_object('expiredProperties', v_changed, 'round', v_match.round)
                );
                v_snapshot := private.marble_authoritative_snapshot(p_match_id);
                update public.marble_authoritative_match_commands
                set result = v_snapshot
                where match_id = p_match_id and user_id = v_user_id and idempotency_key = p_idempotency_key;
            end if;
        end if;
        return v_snapshot;
    end if;

    -- Special-choice commands use the same revision, turn and membership checks as economy commands.
    select * into v_match from public.marble_authoritative_matches match where match.id = p_match_id for update;
    if not found then raise exception 'Authoritative match was not found.' using errcode = 'P0002'; end if;
    if v_match.phase <> 'ACTIVE' then raise exception 'The authoritative match is not active.' using errcode = '55000'; end if;
    if v_match.revision <> p_expected_revision then raise exception 'Revision conflict. Refresh authoritative state.' using errcode = '40001'; end if;
    select * into v_player from public.marble_authoritative_match_players player
    where player.match_id = p_match_id and player.user_id = v_user_id for update;
    if not found or v_player.seat <> v_match.current_turn_seat then
        raise exception 'It is not your authoritative turn.' using errcode = '42501';
    end if;
    select coalesce(max(event.sequence), 0) + 1 into v_sequence
    from public.marble_authoritative_match_events event where event.match_id = p_match_id;

    if p_command = 'GAME_CENTER_CHOICE' then
        if coalesce(v_match.state -> 'pendingAction' ->> 'kind','') <> 'GAME_CENTER' then
            raise exception 'No Game Center selection is pending.' using errcode = '55000';
        end if;
        v_selected := coalesce((p_payload ->> 'selectedNumber')::integer, 0);
        if v_selected < 1 or v_selected > 3 then raise exception 'Choose a Game Center number from 1 to 3.' using errcode = '22023'; end if;
        v_server_number := 1 + (get_byte(gen_random_bytes(1), 0) % 3);
        v_amount := case when v_selected = v_server_number then 240000 else 0 end;
        if v_amount > 0 then
            update public.marble_authoritative_match_players set money = money + v_amount
            where match_id = p_match_id and user_id = v_user_id;
        end if;
        v_special := jsonb_build_object(
            'kind','GAME_CENTER','title',case when v_amount > 0 then 'Game Center Win' else 'Game Center Result' end,
            'message',case when v_amount > 0 then 'Your number matched. CP 240,000 awarded.' else 'The server drew a different number.' end,
            'amount',v_amount,'tileIndex',5,'targetTileIndex',5,'cardId','',
            'selectedNumber',v_selected,'serverNumber',v_server_number
        );
        v_event_kind := 'GAME_CENTER_RESOLVED';

    elsif p_command = 'SELECT_OLYMPIC' then
        if coalesce(v_match.state -> 'pendingAction' ->> 'kind','') <> 'OLYMPIC' then
            raise exception 'No Olympic selection is pending.' using errcode = '55000';
        end if;
        v_selected := coalesce((p_payload ->> 'tileIndex')::integer, -1);
        if not exists (
            select 1 from jsonb_array_elements_text(v_match.state -> 'pendingAction' -> 'options') option
            where option::integer = v_selected
        ) then raise exception 'The selected Olympic property is not an allowed option.' using errcode = '22023'; end if;
        update public.marble_authoritative_match_properties
        set rent_multiplier = least(3, rent_multiplier + 0.5),
            olympic_expires_round = least(999, v_match.round + 3),
            updated_at = now()
        where match_id = p_match_id and tile_index = v_selected and owner_user_id = v_user_id
        returning * into v_property;
        if not found then raise exception 'The selected Olympic property is no longer owned by you.' using errcode = '40001'; end if;
        v_target_name := private.marble_board_tile(v_selected) ->> 'displayName';
        v_special := jsonb_build_object(
            'kind','OLYMPIC','title','Olympic Host Selected',
            'message',v_target_name || ' rent multiplier increased until round ' || v_property.olympic_expires_round || '.',
            'amount',0,'tileIndex',13,'targetTileIndex',v_selected,'cardId',''
        );
        v_event_kind := 'OLYMPIC_APPLIED';

    else
        if coalesce(v_match.state -> 'pendingAction' ->> 'kind','') <> 'WORLD_TRAVEL' then
            raise exception 'No World Travel selection is pending.' using errcode = '55000';
        end if;
        v_selected := coalesce((p_payload ->> 'tileIndex')::integer, -1);
        if not exists (
            select 1 from jsonb_array_elements_text(v_match.state -> 'pendingAction' -> 'options') option
            where option::integer = v_selected
        ) then raise exception 'The selected World Travel destination is not an allowed option.' using errcode = '22023'; end if;
        v_tile := private.marble_board_tile(v_selected);
        if not coalesce((v_tile ->> 'purchasable')::boolean, false) then
            raise exception 'World Travel can only target a city.' using errcode = '22023';
        end if;
        if v_player.travel_credits > 0 then
            update public.marble_authoritative_match_players
            set travel_credits = travel_credits - 1, position = v_selected
            where match_id = p_match_id and user_id = v_user_id returning * into v_player;
            v_cost := 0;
        else
            if v_player.money < 150000 then raise exception 'Insufficient balance for World Travel.' using errcode = '22023'; end if;
            update public.marble_authoritative_match_players
            set money = money - 150000, position = v_selected
            where match_id = p_match_id and user_id = v_user_id returning * into v_player;
            v_cost := 150000;
        end if;
        select * into v_property from public.marble_authoritative_match_properties property
        where property.match_id = p_match_id and property.tile_index = v_selected for update;
        if not found then
            if v_player.money >= (v_tile ->> 'purchasePrice')::bigint then
                v_pending := jsonb_build_object('kind','PURCHASE','tileIndex',v_selected,'displayName',v_tile ->> 'displayName','cost',(v_tile ->> 'purchasePrice')::bigint,'targetLevel',0,'ownerProfileId','','options','[]'::jsonb);
            end if;
        elsif v_property.owner_user_id = v_user_id then
            v_amount := private.marble_upgrade_cost(v_selected, v_property.building_level);
            if v_amount > 0 and v_player.money >= v_amount then
                v_pending := jsonb_build_object('kind','UPGRADE','tileIndex',v_selected,'displayName',v_tile ->> 'displayName','cost',v_amount,'targetLevel',v_property.building_level + 1,'ownerProfileId',v_player.profile_id,'options','[]'::jsonb);
            end if;
        else
            raise exception 'World Travel destination became unsafe. Refresh and choose again.' using errcode = '40001';
        end if;
        v_special := jsonb_build_object(
            'kind','WORLD_TRAVEL','title','World Travel Complete',
            'message','Traveled to ' || (v_tile ->> 'displayName') || case when v_cost = 0 then ' using a free pass.' else ' for CP 150,000.' end,
            'amount',-v_cost,'tileIndex',16,'targetTileIndex',v_selected,'cardId',''
        );
        v_event_kind := 'WORLD_TRAVEL_COMPLETED';
    end if;

    update public.marble_authoritative_matches
    set revision = revision + 1,
        state = state || jsonb_build_object(
            'pendingAction', v_pending,
            'landing', case when p_command = 'SELECT_TRAVEL' then jsonb_build_object('tileIndex',v_selected,'tileType',v_tile ->> 'tileType','displayName',v_tile ->> 'displayName') else state -> 'landing' end,
            'specialResult', v_special
        ),
        updated_at = now()
    where id = p_match_id;
    insert into public.marble_authoritative_match_events (
        match_id, sequence, kind, actor_user_id, actor_profile_id, payload
    ) values (p_match_id, v_sequence, v_event_kind, v_user_id, v_player.profile_id, v_special);
    v_snapshot := private.marble_authoritative_snapshot(p_match_id);
    insert into public.marble_authoritative_match_commands (
        match_id, user_id, idempotency_key, command, expected_revision, result
    ) values (p_match_id, v_user_id, p_idempotency_key, p_command, p_expected_revision, v_snapshot);
    return v_snapshot;
end;
$$;

revoke all on function public.start_marble_authoritative_match(uuid) from public, anon;
revoke all on function public.submit_marble_authoritative_command(uuid, text, bigint, text, jsonb) from public, anon;
grant execute on function public.start_marble_authoritative_match(uuid) to authenticated;
grant execute on function public.submit_marble_authoritative_command(uuid, text, bigint, text, jsonb) to authenticated;

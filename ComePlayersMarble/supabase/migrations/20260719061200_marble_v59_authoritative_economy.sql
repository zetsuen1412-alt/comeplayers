-- ComePlayers Marble V59: server-authoritative property economy, liquidation, bankruptcy, and victory.
-- Apply after 20260719045800_marble_v58_authoritative_turns.sql.

alter table public.marble_authoritative_match_events
    drop constraint if exists marble_authoritative_match_events_kind_check;
alter table public.marble_authoritative_match_events
    add constraint marble_authoritative_match_events_kind_check check (kind in (
        'MATCH_STARTED', 'DICE_ROLLED', 'LANDING_RESOLVED', 'PROPERTY_PURCHASED',
        'PROPERTY_UPGRADED', 'RENT_PAID', 'PROPERTY_TAKEN_OVER', 'ASSET_LIQUIDATED',
        'PLAYER_BANKRUPT', 'SPECIAL_TILE_RESOLVED', 'TURN_ENDED', 'MATCH_FINISHED'
    ));

alter table public.marble_authoritative_match_commands
    drop constraint if exists marble_authoritative_match_commands_command_check;
alter table public.marble_authoritative_match_commands
    add constraint marble_authoritative_match_commands_command_check check (command in (
        'ROLL', 'PURCHASE', 'UPGRADE', 'TAKEOVER', 'END_TURN'
    ));

create table if not exists public.marble_authoritative_match_properties (
    match_id uuid not null references public.marble_authoritative_matches(id) on delete cascade,
    tile_index smallint not null check (tile_index between 0 and 63),
    owner_user_id uuid not null references auth.users(id) on delete cascade,
    owner_profile_id text not null check (char_length(owner_profile_id) between 1 and 48),
    building_level smallint not null default 0 check (building_level between 0 and 4),
    rent_multiplier numeric(5,2) not null default 1 check (rent_multiplier between 0.5 and 6),
    protected boolean not null default false,
    acquired_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (match_id, tile_index)
);

create index if not exists marble_authoritative_properties_owner_idx
    on public.marble_authoritative_match_properties (match_id, owner_user_id);

alter table public.marble_authoritative_match_properties enable row level security;
revoke all on public.marble_authoritative_match_properties from anon, authenticated;
grant select on public.marble_authoritative_match_properties to authenticated;

drop policy if exists "marble room members read authoritative properties" on public.marble_authoritative_match_properties;
create policy "marble room members read authoritative properties"
on public.marble_authoritative_match_properties for select to authenticated
using (exists (
    select 1 from public.marble_authoritative_matches match
    where match.id = match_id
      and (select private.marble_is_room_member(match.room_id))
));

create or replace function private.marble_board_tile(p_index integer)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
    v_type text;
    v_name text;
    v_tier integer;
    v_purchase bigint;
    v_base_rent bigint;
    v_city_ordinal integer;
    v_city_names text[] := array[
        'Nova Bay', 'Aurora Port', 'Zenith', 'Luma City', 'Orion', 'Solara', 'Vesper',
        'Arcadia', 'Nexus', 'Celestia', 'Astra', 'Helios', 'Mirage', 'Titan', 'Eclipse',
        'Polaris', 'Neon Harbor', 'Silverpeak', 'Goldhaven', 'Alexia City', 'Quantum'
    ];
begin
    if p_index < 0 or p_index > 31 then
        raise exception 'Board tile index is outside the V59 board.' using errcode = '22023';
    end if;
    v_type := case p_index
        when 0 then 'START'
        when 2 then 'FORTUNE'
        when 5 then 'GAME_CENTER'
        when 8 then 'ISLAND'
        when 10 then 'FORTUNE'
        when 13 then 'OLYMPIC'
        when 16 then 'WORLD_TRAVEL'
        when 18 then 'FORTUNE'
        when 21 then 'TAX'
        when 24 then 'BONUS_GAME'
        when 26 then 'FORTUNE'
        when 29 then 'TOURIST_AREA'
        else 'CITY'
    end;
    if v_type in ('CITY', 'TOURIST_AREA') then
        select count(*) into v_city_ordinal
        from unnest(array[1,3,4,6,7,9,11,12,14,15,17,19,20,22,23,25,27,28,29,30,31]) as city_index(value)
        where value <= p_index;
        v_name := v_city_names[v_city_ordinal];
        v_tier := 1 + floor(p_index / 8.0)::integer;
        v_purchase := 80000 + v_tier * 20000;
        v_base_rent := 14000 + v_tier * 5000;
    else
        v_name := case v_type
            when 'START' then 'START'
            when 'FORTUNE' then 'Fortune Signal'
            when 'GAME_CENTER' then 'Game Center'
            when 'ISLAND' then 'Island'
            when 'OLYMPIC' then 'Olympic'
            when 'WORLD_TRAVEL' then 'World Travel'
            when 'TAX' then 'System Tax'
            when 'BONUS_GAME' then 'Bonus Game'
            else 'Special Tile'
        end;
        v_purchase := 0;
        v_base_rent := 0;
    end if;
    return jsonb_build_object(
        'tileIndex', p_index,
        'tileType', v_type,
        'displayName', v_name,
        'purchasable', v_type in ('CITY', 'TOURIST_AREA'),
        'purchasePrice', v_purchase,
        'baseRent', v_base_rent,
        'colorGroup', case when v_type in ('CITY', 'TOURIST_AREA') then 'group-' || floor(p_index / 4.0)::integer else 'special' end
    );
end;
$$;

create or replace function private.marble_property_value(p_tile_index integer, p_building_level integer)
returns bigint
language sql
immutable
set search_path = ''
as $$
    select ((private.marble_board_tile(p_tile_index) ->> 'purchasePrice')::bigint)
        + case greatest(0, least(4, p_building_level))
            when 0 then 0
            when 1 then 30000
            when 2 then 80000
            when 3 then 160000
            else 340000
          end;
$$;

create or replace function private.marble_upgrade_cost(p_tile_index integer, p_building_level integer)
returns bigint
language sql
immutable
set search_path = ''
as $$
    select case greatest(0, least(4, p_building_level))
        when 0 then 30000
        when 1 then 50000
        when 2 then 80000
        when 3 then 180000
        else 0
    end;
$$;

create or replace function private.marble_property_rent(p_tile_index integer, p_building_level integer, p_multiplier numeric)
returns bigint
language sql
immutable
set search_path = ''
as $$
    select round((case greatest(0, least(4, p_building_level))
        when 0 then (private.marble_board_tile(p_tile_index) ->> 'baseRent')::numeric
        when 1 then 30000
        when 2 then 65000
        when 3 then 120000
        else 220000
    end) * greatest(0.5, least(6, coalesce(p_multiplier, 1))))::bigint;
$$;

create or replace function private.marble_next_active_seat(p_match_id uuid, p_current_seat integer)
returns integer
language sql
stable
set search_path = ''
as $$
    select coalesce(
        (select player.seat from public.marble_authoritative_match_players player
         where player.match_id = p_match_id and player.bankrupt = false and player.seat > p_current_seat
         order by player.seat limit 1),
        (select player.seat from public.marble_authoritative_match_players player
         where player.match_id = p_match_id and player.bankrupt = false
         order by player.seat limit 1),
        p_current_seat
    )::integer;
$$;

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
    v_sequence bigint := p_sequence_start;
    v_bankrupt boolean := false;
    v_remaining_count integer := 0;
begin
    select * into v_debtor from public.marble_authoritative_match_players player
    where player.match_id = p_match_id and player.user_id = p_debtor_user_id for update;
    if not found then
        raise exception 'Payment debtor is not a match player.' using errcode = 'P0002';
    end if;
    while v_debtor.money < greatest(0, p_amount) loop
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

    v_paid := least(greatest(0, p_amount), v_debtor.money);
    update public.marble_authoritative_match_players
    set money = money - v_paid where match_id = p_match_id and user_id = p_debtor_user_id
    returning * into v_debtor;
    if p_creditor_user_id is not null and v_paid > 0 then
        update public.marble_authoritative_match_players
        set money = money + v_paid where match_id = p_match_id and user_id = p_creditor_user_id;
    end if;

    if v_paid < greatest(0, p_amount) then
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
            jsonb_build_object('reason', p_reason, 'amountDue', p_amount, 'amountPaid', v_paid, 'propertiesReturned', v_remaining_count)
        );
        v_sequence := v_sequence + 1;
    end if;
    return jsonb_build_object('paid', v_paid, 'bankrupt', v_bankrupt, 'nextSequence', v_sequence);
end;
$$;

revoke all on function private.marble_board_tile(integer) from public;
revoke all on function private.marble_property_value(integer, integer) from public;
revoke all on function private.marble_upgrade_cost(integer, integer) from public;
revoke all on function private.marble_property_rent(integer, integer, numeric) from public;
revoke all on function private.marble_next_active_seat(uuid, integer) from public;
revoke all on function private.marble_apply_authoritative_payment(uuid, uuid, uuid, bigint, text, integer, bigint) from public;

update public.marble_authoritative_matches match
set state = match.state || jsonb_build_object(
        'pendingAction', null,
        'landing', null,
        'mode', room.mode,
        'maxRounds', case
            when coalesce(room.settings ->> 'maxRounds', '') ~ '^[0-9]{1,3}$'
                then greatest(4, least(50, (room.settings ->> 'maxRounds')::integer))
            else 12
        end,
        'winnerProfileId', coalesce(match.state ->> 'winnerProfileId', ''),
        'winnerTeamId', coalesce(match.state ->> 'winnerTeamId', ''),
        'finishReason', coalesce(match.state ->> 'finishReason', '')
    ),
    updated_at = now()
from public.marble_realtime_rooms room
where room.id = match.room_id;

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
                'protected', property.protected
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
    v_starting_money bigint := 2000000;
    v_max_rounds integer := 12;
begin
    if v_user_id is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
    select * into v_room from public.marble_realtime_rooms room where room.id = p_room_id for update;
    if not found or v_room.host_user_id <> v_user_id then
        raise exception 'Only the room host can start the authoritative match.' using errcode = '42501';
    end if;
    select * into v_match from public.marble_authoritative_matches match where match.room_id = v_room.id for update;
    if found then return private.marble_authoritative_snapshot(v_match.id); end if;
    select count(*) into v_player_count from public.marble_realtime_room_members member
    where member.room_id = v_room.id and member.role = 'PLAYER' and member.ready = true and member.connected = true;
    if v_player_count < 2 then raise exception 'At least two connected and ready players are required.' using errcode = '22023'; end if;
    if coalesce(v_room.settings ->> 'startingMoney', '') ~ '^[0-9]{6,8}$' then
        v_starting_money := greatest(500000, least(5000000, (v_room.settings ->> 'startingMoney')::bigint));
    end if;
    if coalesce(v_room.settings ->> 'maxRounds', '') ~ '^[0-9]{1,3}$' then
        v_max_rounds := greatest(4, least(50, (v_room.settings ->> 'maxRounds')::integer));
    end if;
    insert into public.marble_authoritative_matches (room_id, topic, phase, state)
    values (v_room.id, v_room.topic, 'ACTIVE', jsonb_build_object(
        'awaitingEndTurn', false, 'lastDice', null, 'pendingAction', null, 'landing', null,
        'mode', v_room.mode, 'maxRounds', v_max_rounds,
        'winnerProfileId', '', 'winnerTeamId', '', 'finishReason', ''
    )) returning * into v_match;
    insert into public.marble_authoritative_match_players (
        match_id, user_id, profile_id, display_name, seat, team_id, money
    )
    select v_match.id, member.user_id, member.profile_id, member.display_name,
        (row_number() over (order by member.joined_at, member.user_id) - 1)::smallint,
        member.team_id, v_starting_money
    from public.marble_realtime_room_members member
    where member.room_id = v_room.id and member.role = 'PLAYER' and member.ready = true and member.connected = true
    order by member.joined_at, member.user_id limit 4;
    update public.marble_realtime_rooms set phase = 'MATCH', updated_at = now(), expires_at = now() + interval '3 hours' where id = v_room.id;
    insert into public.marble_authoritative_match_events (
        match_id, sequence, kind, actor_user_id, actor_profile_id, payload
    ) values (
        v_match.id, 1, 'MATCH_STARTED', v_user_id,
        coalesce((select profile_id from public.marble_authoritative_match_players where match_id = v_match.id and user_id = v_user_id), ''),
        jsonb_build_object('roomId', v_room.id::text, 'playerCount', v_player_count, 'mode', v_room.mode, 'startingMoney', v_starting_money, 'maxRounds', v_max_rounds)
    );
    return private.marble_authoritative_snapshot(v_match.id);
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
    v_owner public.marble_authoritative_match_players%rowtype;
    v_property public.marble_authoritative_match_properties%rowtype;
    v_existing jsonb;
    v_snapshot jsonb;
    v_sequence bigint;
    v_first integer;
    v_second integer;
    v_total integer;
    v_old_position integer;
    v_new_position integer;
    v_passed_start boolean;
    v_is_double boolean;
    v_tile jsonb;
    v_tile_type text;
    v_landing jsonb;
    v_pending jsonb := null;
    v_cost bigint := 0;
    v_rent bigint := 0;
    v_payment jsonb;
    v_paid bigint := 0;
    v_bankrupt boolean := false;
    v_next_seat integer;
    v_next_round integer;
    v_active_count integer;
    v_active_team_count integer;
    v_mode text;
    v_max_rounds integer;
    v_winner_profile text := '';
    v_winner_team text := '';
    v_finish_reason text := '';
    v_should_finish boolean := false;
    v_actor_team text;
    v_owner_team text;
begin
    if v_user_id is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
    if p_command not in ('ROLL', 'PURCHASE', 'UPGRADE', 'TAKEOVER', 'END_TURN') then
        raise exception 'Unsupported authoritative command.' using errcode = '22023';
    end if;
    if p_idempotency_key !~ '^[A-Za-z0-9_-]{8,80}$' then raise exception 'Invalid idempotency key.' using errcode = '22023'; end if;
    select command.result into v_existing from public.marble_authoritative_match_commands command
    where command.match_id = p_match_id and command.user_id = v_user_id and command.idempotency_key = p_idempotency_key;
    if v_existing is not null then return v_existing; end if;
    select * into v_match from public.marble_authoritative_matches match where match.id = p_match_id for update;
    if not found then raise exception 'Authoritative match was not found.' using errcode = 'P0002'; end if;
    if v_match.phase <> 'ACTIVE' then raise exception 'The authoritative match is not active.' using errcode = '55000'; end if;
    if v_match.revision <> p_expected_revision then raise exception 'Revision conflict. Refresh authoritative state.' using errcode = '40001'; end if;
    select * into v_player from public.marble_authoritative_match_players player
    where player.match_id = v_match.id and player.user_id = v_user_id for update;
    if not found then raise exception 'Only match players can submit commands.' using errcode = '42501'; end if;
    if v_player.seat <> v_match.current_turn_seat then raise exception 'It is not your authoritative turn.' using errcode = '42501'; end if;
    select coalesce(max(event.sequence), 0) + 1 into v_sequence from public.marble_authoritative_match_events event where event.match_id = v_match.id;
    v_mode := coalesce(v_match.state ->> 'mode', 'SOLO');
    v_max_rounds := coalesce((v_match.state ->> 'maxRounds')::integer, 12);

    if p_command = 'ROLL' then
        if coalesce((v_match.state ->> 'awaitingEndTurn')::boolean, false) then raise exception 'Resolve or end the current turn before rolling again.' using errcode = '55000'; end if;
        if v_player.bankrupt then raise exception 'A bankrupt player cannot roll.' using errcode = '55000'; end if;
        v_first := 1 + (get_byte(gen_random_bytes(1), 0) % 6);
        v_second := 1 + (get_byte(gen_random_bytes(1), 0) % 6);
        v_total := v_first + v_second;
        v_old_position := v_player.position;
        v_new_position := (v_old_position + v_total) % v_match.board_size;
        v_passed_start := (v_old_position + v_total) >= v_match.board_size;
        update public.marble_authoritative_match_players
        set position = v_new_position, money = money + case when v_passed_start then 200000 else 0 end
        where match_id = v_match.id and user_id = v_user_id returning * into v_player;
        insert into public.marble_authoritative_match_events (match_id, sequence, kind, actor_user_id, actor_profile_id, payload)
        values (v_match.id, v_sequence, 'DICE_ROLLED', v_user_id, v_player.profile_id,
            jsonb_build_object('first', v_first, 'second', v_second, 'total', v_total, 'isDouble', v_first = v_second,
                'from', v_old_position, 'to', v_new_position, 'passedStart', v_passed_start, 'salary', case when v_passed_start then 200000 else 0 end));
        v_sequence := v_sequence + 1;
        v_tile := private.marble_board_tile(v_new_position);
        v_tile_type := v_tile ->> 'tileType';
        v_landing := jsonb_build_object('tileIndex', v_new_position, 'tileType', v_tile_type, 'displayName', v_tile ->> 'displayName');

        if coalesce((v_tile ->> 'purchasable')::boolean, false) then
            select * into v_property from public.marble_authoritative_match_properties property
            where property.match_id = v_match.id and property.tile_index = v_new_position for update;
            if not found then
                v_cost := (v_tile ->> 'purchasePrice')::bigint;
                if v_player.money >= v_cost then
                    v_pending := jsonb_build_object('kind', 'PURCHASE', 'tileIndex', v_new_position, 'displayName', v_tile ->> 'displayName', 'cost', v_cost, 'targetLevel', 0, 'ownerProfileId', '');
                end if;
            elsif v_property.owner_user_id = v_user_id then
                v_cost := private.marble_upgrade_cost(v_new_position, v_property.building_level);
                if v_cost > 0 and v_player.money >= v_cost then
                    v_pending := jsonb_build_object('kind', 'UPGRADE', 'tileIndex', v_new_position, 'displayName', v_tile ->> 'displayName', 'cost', v_cost, 'targetLevel', v_property.building_level + 1, 'ownerProfileId', v_player.profile_id);
                end if;
            else
                select * into v_owner from public.marble_authoritative_match_players owner
                where owner.match_id = v_match.id and owner.user_id = v_property.owner_user_id for update;
                v_actor_team := coalesce(v_player.team_id, '');
                v_owner_team := coalesce(v_owner.team_id, '');
                if v_mode = 'TEAM' and v_actor_team <> '' and v_actor_team = v_owner_team then
                    insert into public.marble_authoritative_match_events (match_id, sequence, kind, actor_user_id, actor_profile_id, payload)
                    values (v_match.id, v_sequence, 'RENT_PAID', v_user_id, v_player.profile_id,
                        jsonb_build_object('tileIndex', v_new_position, 'ownerProfileId', v_owner.profile_id, 'amountDue', 0, 'amountPaid', 0, 'teamExempt', true));
                    v_sequence := v_sequence + 1;
                else
                    v_rent := private.marble_property_rent(v_new_position, v_property.building_level, v_property.rent_multiplier);
                    v_payment := private.marble_apply_authoritative_payment(v_match.id, v_user_id, v_property.owner_user_id, v_rent, 'RENT', v_new_position, v_sequence);
                    v_paid := (v_payment ->> 'paid')::bigint;
                    v_bankrupt := (v_payment ->> 'bankrupt')::boolean;
                    v_sequence := (v_payment ->> 'nextSequence')::bigint;
                    insert into public.marble_authoritative_match_events (match_id, sequence, kind, actor_user_id, actor_profile_id, payload)
                    values (v_match.id, v_sequence, 'RENT_PAID', v_user_id, v_player.profile_id,
                        jsonb_build_object('tileIndex', v_new_position, 'ownerProfileId', v_owner.profile_id, 'amountDue', v_rent, 'amountPaid', v_paid, 'teamExempt', false, 'bankrupt', v_bankrupt));
                    v_sequence := v_sequence + 1;
                    if not v_bankrupt and v_property.building_level < 4 and not v_property.protected then
                        v_cost := private.marble_property_value(v_new_position, v_property.building_level) * 2;
                        select * into v_player from public.marble_authoritative_match_players player where player.match_id = v_match.id and player.user_id = v_user_id;
                        if v_player.money >= v_cost then
                            v_pending := jsonb_build_object('kind', 'TAKEOVER', 'tileIndex', v_new_position, 'displayName', v_tile ->> 'displayName', 'cost', v_cost, 'targetLevel', v_property.building_level, 'ownerProfileId', v_owner.profile_id);
                        end if;
                    end if;
                end if;
            end if;
        elsif v_tile_type = 'TAX' then
            v_payment := private.marble_apply_authoritative_payment(v_match.id, v_user_id, null, 100000, 'TAX', v_new_position, v_sequence);
            v_paid := (v_payment ->> 'paid')::bigint;
            v_bankrupt := (v_payment ->> 'bankrupt')::boolean;
            v_sequence := (v_payment ->> 'nextSequence')::bigint;
            insert into public.marble_authoritative_match_events (match_id, sequence, kind, actor_user_id, actor_profile_id, payload)
            values (v_match.id, v_sequence, 'SPECIAL_TILE_RESOLVED', v_user_id, v_player.profile_id,
                jsonb_build_object('tileIndex', v_new_position, 'tileType', v_tile_type, 'moneyDelta', -v_paid, 'bankrupt', v_bankrupt));
            v_sequence := v_sequence + 1;
        elsif v_tile_type = 'BONUS_GAME' then
            update public.marble_authoritative_match_players set money = money + 120000
            where match_id = v_match.id and user_id = v_user_id;
            insert into public.marble_authoritative_match_events (match_id, sequence, kind, actor_user_id, actor_profile_id, payload)
            values (v_match.id, v_sequence, 'SPECIAL_TILE_RESOLVED', v_user_id, v_player.profile_id,
                jsonb_build_object('tileIndex', v_new_position, 'tileType', v_tile_type, 'moneyDelta', 120000));
            v_sequence := v_sequence + 1;
        end if;
        insert into public.marble_authoritative_match_events (match_id, sequence, kind, actor_user_id, actor_profile_id, payload)
        values (v_match.id, v_sequence, 'LANDING_RESOLVED', v_user_id, v_player.profile_id,
            v_landing || jsonb_build_object('pendingAction', v_pending));
        update public.marble_authoritative_matches set revision = revision + 1,
            state = v_match.state || jsonb_build_object(
                'awaitingEndTurn', true,
                'lastDice', jsonb_build_object('first', v_first, 'second', v_second, 'total', v_total, 'isDouble', v_first = v_second),
                'pendingAction', v_pending, 'landing', v_landing
            ), updated_at = now() where id = v_match.id;

    elsif p_command = 'PURCHASE' then
        if coalesce(v_match.state -> 'pendingAction' ->> 'kind', '') <> 'PURCHASE' then raise exception 'No server purchase is pending.' using errcode = '55000'; end if;
        v_new_position := (v_match.state -> 'pendingAction' ->> 'tileIndex')::integer;
        v_tile := private.marble_board_tile(v_new_position);
        v_cost := (v_tile ->> 'purchasePrice')::bigint;
        if exists (select 1 from public.marble_authoritative_match_properties property where property.match_id = v_match.id and property.tile_index = v_new_position) then raise exception 'This property is no longer available.' using errcode = '40001'; end if;
        if v_player.money < v_cost then raise exception 'Insufficient server balance for this purchase.' using errcode = '22023'; end if;
        insert into public.marble_authoritative_match_properties (match_id, tile_index, owner_user_id, owner_profile_id)
        values (v_match.id, v_new_position, v_user_id, v_player.profile_id);
        update public.marble_authoritative_match_players set money = money - v_cost
        where match_id = v_match.id and user_id = v_user_id returning * into v_player;
        v_cost := private.marble_upgrade_cost(v_new_position, 0);
        if v_player.money >= v_cost then
            v_pending := jsonb_build_object('kind', 'UPGRADE', 'tileIndex', v_new_position, 'displayName', v_tile ->> 'displayName', 'cost', v_cost, 'targetLevel', 1, 'ownerProfileId', v_player.profile_id);
        else v_pending := null; end if;
        insert into public.marble_authoritative_match_events (match_id, sequence, kind, actor_user_id, actor_profile_id, payload)
        values (v_match.id, v_sequence, 'PROPERTY_PURCHASED', v_user_id, v_player.profile_id,
            jsonb_build_object('tileIndex', v_new_position, 'displayName', v_tile ->> 'displayName', 'cost', (v_tile ->> 'purchasePrice')::bigint));
        update public.marble_authoritative_matches set revision = revision + 1,
            state = v_match.state || jsonb_build_object('pendingAction', v_pending), updated_at = now() where id = v_match.id;

    elsif p_command = 'UPGRADE' then
        if coalesce(v_match.state -> 'pendingAction' ->> 'kind', '') <> 'UPGRADE' then raise exception 'No server upgrade is pending.' using errcode = '55000'; end if;
        v_new_position := (v_match.state -> 'pendingAction' ->> 'tileIndex')::integer;
        select * into v_property from public.marble_authoritative_match_properties property
        where property.match_id = v_match.id and property.tile_index = v_new_position for update;
        if not found or v_property.owner_user_id <> v_user_id then raise exception 'Only the property owner can upgrade.' using errcode = '42501'; end if;
        v_cost := private.marble_upgrade_cost(v_new_position, v_property.building_level);
        if v_cost <= 0 then raise exception 'This property is already a Landmark.' using errcode = '55000'; end if;
        if v_player.money < v_cost then raise exception 'Insufficient server balance for this upgrade.' using errcode = '22023'; end if;
        update public.marble_authoritative_match_properties set building_level = building_level + 1, updated_at = now()
        where match_id = v_match.id and tile_index = v_new_position returning * into v_property;
        update public.marble_authoritative_match_players set money = money - v_cost
        where match_id = v_match.id and user_id = v_user_id returning * into v_player;
        if v_property.building_level < 4
            and v_player.money >= private.marble_upgrade_cost(v_new_position, v_property.building_level) then
            v_pending := jsonb_build_object('kind', 'UPGRADE', 'tileIndex', v_new_position,
                'displayName', private.marble_board_tile(v_new_position) ->> 'displayName',
                'cost', private.marble_upgrade_cost(v_new_position, v_property.building_level),
                'targetLevel', v_property.building_level + 1, 'ownerProfileId', v_player.profile_id);
        else v_pending := null; end if;
        insert into public.marble_authoritative_match_events (match_id, sequence, kind, actor_user_id, actor_profile_id, payload)
        values (v_match.id, v_sequence, 'PROPERTY_UPGRADED', v_user_id, v_player.profile_id,
            jsonb_build_object('tileIndex', v_new_position, 'cost', v_cost, 'buildingLevel', v_property.building_level,
                'landmark', v_property.building_level = 4));
        update public.marble_authoritative_matches set revision = revision + 1,
            state = v_match.state || jsonb_build_object('pendingAction', v_pending), updated_at = now() where id = v_match.id;

    elsif p_command = 'TAKEOVER' then
        if coalesce(v_match.state -> 'pendingAction' ->> 'kind', '') <> 'TAKEOVER' then raise exception 'No server takeover is pending.' using errcode = '55000'; end if;
        v_new_position := (v_match.state -> 'pendingAction' ->> 'tileIndex')::integer;
        select * into v_property from public.marble_authoritative_match_properties property
        where property.match_id = v_match.id and property.tile_index = v_new_position for update;
        if not found or v_property.owner_user_id = v_user_id then raise exception 'The takeover target is invalid.' using errcode = '40001'; end if;
        if v_property.building_level >= 4 or v_property.protected then raise exception 'Landmark or protected properties cannot be taken over.' using errcode = '55000'; end if;
        select * into v_owner from public.marble_authoritative_match_players owner
        where owner.match_id = v_match.id and owner.user_id = v_property.owner_user_id for update;
        if v_mode = 'TEAM' and coalesce(v_player.team_id, '') <> '' and v_player.team_id = v_owner.team_id then raise exception 'A teammate property cannot be taken over.' using errcode = '42501'; end if;
        v_cost := private.marble_property_value(v_new_position, v_property.building_level) * 2;
        if v_player.money < v_cost then raise exception 'Insufficient server balance for this takeover.' using errcode = '22023'; end if;
        update public.marble_authoritative_match_players set money = money - v_cost where match_id = v_match.id and user_id = v_user_id;
        update public.marble_authoritative_match_players set money = money + v_cost where match_id = v_match.id and user_id = v_property.owner_user_id;
        update public.marble_authoritative_match_properties
        set owner_user_id = v_user_id, owner_profile_id = v_player.profile_id, acquired_at = now(), updated_at = now()
        where match_id = v_match.id and tile_index = v_new_position;
        insert into public.marble_authoritative_match_events (match_id, sequence, kind, actor_user_id, actor_profile_id, payload)
        values (v_match.id, v_sequence, 'PROPERTY_TAKEN_OVER', v_user_id, v_player.profile_id,
            jsonb_build_object('tileIndex', v_new_position, 'cost', v_cost, 'previousOwnerProfileId', v_owner.profile_id, 'buildingLevel', v_property.building_level));
        update public.marble_authoritative_matches set revision = revision + 1,
            state = v_match.state || jsonb_build_object('pendingAction', null), updated_at = now() where id = v_match.id;

    else
        if not coalesce((v_match.state ->> 'awaitingEndTurn')::boolean, false) then raise exception 'Roll before ending the authoritative turn.' using errcode = '55000'; end if;
        v_is_double := coalesce((v_match.state -> 'lastDice' ->> 'isDouble')::boolean, false) and not v_player.bankrupt;
        select count(*) into v_active_count from public.marble_authoritative_match_players player where player.match_id = v_match.id and player.bankrupt = false;
        select count(distinct player.team_id) into v_active_team_count from public.marble_authoritative_match_players player
        where player.match_id = v_match.id and player.bankrupt = false and player.team_id is not null;
        if v_mode = 'TEAM' and v_active_team_count <= 1 then
            v_should_finish := true; v_finish_reason := 'LAST_TEAM_STANDING';
            select coalesce(max(player.team_id), '') into v_winner_team from public.marble_authoritative_match_players player
            where player.match_id = v_match.id and player.bankrupt = false;
        elsif v_mode <> 'TEAM' and v_active_count <= 1 then
            v_should_finish := true; v_finish_reason := 'LAST_PLAYER_STANDING';
            select coalesce(max(player.profile_id), '') into v_winner_profile from public.marble_authoritative_match_players player
            where player.match_id = v_match.id and player.bankrupt = false;
        end if;
        v_next_seat := case when v_is_double then v_match.current_turn_seat else private.marble_next_active_seat(v_match.id, v_match.current_turn_seat) end;
        v_next_round := v_match.round + case when not v_is_double and v_next_seat <= v_match.current_turn_seat then 1 else 0 end;
        if not v_should_finish and v_next_round > v_max_rounds then
            v_should_finish := true; v_finish_reason := 'ROUND_LIMIT_NET_WORTH';
            if v_mode = 'TEAM' then
                select coalesce(score.team_id, '') into v_winner_team from (
                    select player.team_id,
                        sum(player.money + coalesce((select sum(private.marble_property_value(property.tile_index, property.building_level))
                            from public.marble_authoritative_match_properties property where property.match_id = v_match.id and property.owner_user_id = player.user_id), 0)) as wealth
                    from public.marble_authoritative_match_players player
                    where player.match_id = v_match.id and player.team_id is not null
                    group by player.team_id order by wealth desc, player.team_id limit 1
                ) score;
            else
                select player.profile_id into v_winner_profile from public.marble_authoritative_match_players player
                where player.match_id = v_match.id
                order by player.money + coalesce((select sum(private.marble_property_value(property.tile_index, property.building_level))
                    from public.marble_authoritative_match_properties property where property.match_id = v_match.id and property.owner_user_id = player.user_id), 0) desc,
                    player.seat limit 1;
            end if;
        end if;
        if v_should_finish then
            update public.marble_authoritative_matches set phase = 'FINISHED', revision = revision + 1,
                state = v_match.state || jsonb_build_object('awaitingEndTurn', false, 'pendingAction', null,
                    'winnerProfileId', v_winner_profile, 'winnerTeamId', v_winner_team, 'finishReason', v_finish_reason), updated_at = now()
            where id = v_match.id;
            insert into public.marble_authoritative_match_events (match_id, sequence, kind, actor_user_id, actor_profile_id, payload)
            values (v_match.id, v_sequence, 'MATCH_FINISHED', v_user_id, v_player.profile_id,
                jsonb_build_object('winnerProfileId', v_winner_profile, 'winnerTeamId', v_winner_team, 'finishReason', v_finish_reason, 'round', v_match.round));
        else
            update public.marble_authoritative_matches set revision = revision + 1, round = v_next_round,
                current_turn_seat = v_next_seat,
                state = v_match.state || jsonb_build_object('awaitingEndTurn', false, 'pendingAction', null, 'landing', null), updated_at = now()
            where id = v_match.id;
            insert into public.marble_authoritative_match_events (match_id, sequence, kind, actor_user_id, actor_profile_id, payload)
            values (v_match.id, v_sequence, 'TURN_ENDED', v_user_id, v_player.profile_id,
                jsonb_build_object('extraTurn', v_is_double, 'nextSeat', v_next_seat, 'round', v_next_round));
        end if;
    end if;

    v_snapshot := private.marble_authoritative_snapshot(v_match.id);
    insert into public.marble_authoritative_match_commands (match_id, user_id, idempotency_key, command, expected_revision, result)
    values (v_match.id, v_user_id, p_idempotency_key, p_command, p_expected_revision, v_snapshot);
    return v_snapshot;
end;
$$;

revoke all on function public.start_marble_authoritative_match(uuid) from public, anon;
revoke all on function public.submit_marble_authoritative_command(uuid, text, bigint, text, jsonb) from public, anon;
grant execute on function public.start_marble_authoritative_match(uuid) to authenticated;
grant execute on function public.submit_marble_authoritative_command(uuid, text, bigint, text, jsonb) to authenticated;

-- Read-only export of the existing server functions, 2026-09-29.
-- TEST FIXTURE ONLY. The minimal local schema is defined by the test runner.
CREATE OR REPLACE FUNCTION public.crwt_replace_player(p_state jsonb, p_seat integer, p_player jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select jsonb_set(
    p_state,
    '{players}',
    coalesce((
      select jsonb_agg(case when (x->>'seat')::integer=p_seat then p_player else x end order by (x->>'seat')::integer)
      from jsonb_array_elements(p_state->'players') x
    ),'[]'::jsonb),
    true
  )
$function$
;

CREATE OR REPLACE FUNCTION public.crwt_v18_get_tile(p_map_id text, p_tile_id integer)
 RETURNS crwt_board_tiles
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select row(mt.tile_id,mt.name,mt.kind,mt.group_id,mt.price)::public.crwt_board_tiles
  from public.crwt_map_tiles mt
  where mt.map_id=p_map_id and mt.tile_id=p_tile_id
$function$
;

CREATE OR REPLACE FUNCTION public.crwt_v18_map_rules(p_map_id text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (select rules from public.crwt_map_catalog where id=p_map_id and enabled=true),
    (select rules from public.crwt_map_catalog where id='world_tour')
  )
$function$
;

CREATE OR REPLACE FUNCTION public.crwt_upgrade_cost(p_price integer, p_current_level integer, p_discount boolean DEFAULT false)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select greatest(1,round(
    p_price *
    case greatest(0,least(coalesce(p_current_level,0),3))
      when 0 then 0.65
      when 1 then 0.90
      when 2 then 1.20
      else 1.60
    end *
    case when p_discount then 0.75 else 1 end
  )::integer)
$function$
;

CREATE OR REPLACE FUNCTION public.crwt_v18_rent_amount(p_map_id text, p_kind text, p_price integer, p_level integer, p_group_id integer, p_festival_group integer, p_festival_until integer, p_round integer)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r jsonb:=public.crwt_v18_map_rules(p_map_id);
  base numeric;
  rent_mult numeric:=coalesce((r->>'rent_mult')::numeric,1.0);
  resort_mult numeric:=coalesce((r->>'resort_rent_mult')::numeric,1.0);
  fest_mult numeric:=coalesce((r->>'festival_mult')::numeric,2.0);
begin
  base:=p_price *
    case greatest(0,least(coalesce(p_level,0),4))
      when 0 then 0.30
      when 1 then 0.55
      when 2 then 0.90
      when 3 then 1.40
      else 2.20
    end;
  if p_kind='resort' then base:=base*resort_mult; end if;
  base:=base*rent_mult;
  if p_festival_group is not null
     and p_group_id=p_festival_group
     and p_round<=coalesce(p_festival_until,0) then
    base:=base*fest_mult;
  end if;
  return greatest(40,round(base)::integer);
end
$function$
;

CREATE OR REPLACE FUNCTION public.crwt_rent_amount(p_price integer, p_level integer, p_group_id integer, p_festival_group integer, p_festival_until integer, p_round integer)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select greatest(40,
    round(
      p_price *
      case greatest(0,least(coalesce(p_level,0),4))
        when 0 then 0.30
        when 1 then 0.55
        when 2 then 0.90
        when 3 then 1.40
        else 2.20
      end *
      case when p_festival_group is not null and p_group_id=p_festival_group and p_round<=coalesce(p_festival_until,0) then 2 else 1 end
    )::integer
  )
$function$
;

CREATE OR REPLACE FUNCTION public.crwt_v15_takeover_cost(p_price integer, p_invested integer, p_level integer)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select greatest(p_price*2,round(coalesce(p_invested,p_price)*2.1 + greatest(0,coalesce(p_level,0))*p_price*0.25)::integer)
$function$
;

CREATE OR REPLACE FUNCTION public.crwt_v15_charge(p_state jsonb, p_seat integer, p_amount integer, p_creditor_seat integer, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare
  v_state jsonb:=p_state;
  v_player jsonb;
  v_creditor jsonb;
  v_cash integer;
  v_props jsonb;
  v_has_assets boolean;
  v_pending jsonb;
begin
  v_player:=v_state->'players'->(p_seat-1);
  v_cash:=coalesce((v_player->>'cash')::integer,0);
  if p_amount<=0 then
    return jsonb_build_object('state',v_state,'liquidation',false,'paid',0);
  end if;

  if v_cash>=p_amount then
    v_player:=jsonb_set(v_player,'{cash}',to_jsonb(v_cash-p_amount),true);
    v_state:=public.crwt_replace_player(v_state,p_seat,v_player);
    if p_creditor_seat is not null then
      v_creditor:=v_state->'players'->(p_creditor_seat-1);
      v_creditor:=jsonb_set(v_creditor,'{cash}',to_jsonb(coalesce((v_creditor->>'cash')::integer,0)+p_amount),true);
      v_state:=public.crwt_replace_player(v_state,p_creditor_seat,v_creditor);
    end if;
    return jsonb_build_object('state',v_state,'liquidation',false,'paid',p_amount);
  end if;

  v_props:=coalesce(v_state->'properties','{}'::jsonb);
  select exists(
    select 1 from jsonb_each(v_props) e
    where coalesce((e.value->>'owner_seat')::integer,0)=p_seat
  ) into v_has_assets;

  if v_has_assets then
    v_pending:=jsonb_build_object(
      'type','liquidation','debt',p_amount,'creditor_seat',p_creditor_seat,
      'reason',p_reason,'cash',v_cash
    );
    return jsonb_build_object('state',v_state,'liquidation',true,'paid',0,'pending',v_pending);
  end if;

  if p_creditor_seat is not null and v_cash>0 then
    v_creditor:=v_state->'players'->(p_creditor_seat-1);
    v_creditor:=jsonb_set(v_creditor,'{cash}',to_jsonb(coalesce((v_creditor->>'cash')::integer,0)+v_cash),true);
    v_state:=public.crwt_replace_player(v_state,p_creditor_seat,v_creditor);
  end if;
  v_player:=v_state->'players'->(p_seat-1);
  v_player:=jsonb_set(v_player,'{cash}','0'::jsonb,true);
  v_player:=jsonb_set(v_player,'{bankrupt}','true'::jsonb,true);
  v_state:=public.crwt_replace_player(v_state,p_seat,v_player);
  return jsonb_build_object('state',v_state,'liquidation',false,'bankrupt',true,'paid',v_cash);
end $function$
;

CREATE OR REPLACE FUNCTION public.crwt_v15_advance(p_match_id uuid, p_state jsonb, p_current_seat integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_match public.crwt_matches;
  v_room public.crwt_rooms;
  v_alive integer[];
  v_next integer;
  v_round integer;
  v_state jsonb:=p_state;
  v_winner integer;
  v_player jsonb;
  v_skip integer;
  v_loops integer:=0;
begin
  select * into v_match from public.crwt_matches where id=p_match_id;
  select * into v_room from public.crwt_rooms where id=v_match.room_id;

  select array_agg((p->>'seat')::integer order by (p->>'seat')::integer)
  into v_alive
  from jsonb_array_elements(v_state->'players') p
  where coalesce((p->>'bankrupt')::boolean,false)=false;

  if coalesce(array_length(v_alive,1),0)<=1 then
    v_winner:=case when array_length(v_alive,1)=1 then v_alive[1] else null end;
    v_state:=jsonb_set(v_state,'{phase}','"finished"'::jsonb,true);
    v_state:=jsonb_set(v_state,'{winner_seat}',to_jsonb(v_winner),true);
    v_state:=jsonb_set(v_state,'{win_condition}','"bankruptcy"'::jsonb,true);
    v_state:=jsonb_set(v_state,'{message}','"Pertandingan selesai: hanya satu pemain yang belum bangkrut."'::jsonb,true);

    update public.crwt_matches
      set status='finished',state=v_state,version=version+1,ended_at=now(),deadline_at=null
      where id=p_match_id;

    update public.crwt_rooms
      set status='finished',finished_at=now(),updated_at=now(),win_condition='bankruptcy'
      where id=v_match.room_id;

    perform public.crwt_v15_finalize_ranked(p_match_id,v_state);

    return jsonb_build_object(
      'state',v_state,
      'turn_seat',v_match.turn_seat,
      'round',v_match.round,
      'finished',true
    );
  end if;

  v_next:=p_current_seat;
  v_round:=v_match.round;

  loop
    v_loops:=v_loops+1;
    exit when v_loops>32;

    select s into v_next
    from unnest(v_alive) s
    where s>v_next
    order by s
    limit 1;

    if v_next is null then
      v_next:=v_alive[1];
      v_round:=v_round+1;
    end if;

    v_player:=v_state->'players'->(v_next-1);
    v_skip:=coalesce((v_player->>'skip_turns')::integer,0);

    if v_skip>0 then
      v_player:=jsonb_set(v_player,'{skip_turns}',to_jsonb(v_skip-1),true);
      v_state:=public.crwt_replace_player(v_state,v_next,v_player);
      v_state:=jsonb_set(
        v_state,
        '{message}',
        to_jsonb((v_player->>'name')||' melewatkan giliran karena Pulau.'),
        true
      );
    else
      exit;
    end if;
  end loop;

  if coalesce((v_state->>'festival_until_round')::integer,0)<v_round then
    v_state:=jsonb_set(v_state,'{festival_group}','null'::jsonb,true);
  end if;

  v_state:=jsonb_set(v_state,'{phase}','"await_roll"'::jsonb,true);
  v_state:=jsonb_set(v_state,'{pending}','null'::jsonb,true);
  v_state:=jsonb_set(v_state,'{win_condition}','"bankruptcy"'::jsonb,true);

  update public.crwt_matches
    set state=v_state,
        turn_seat=v_next,
        round=v_round,
        version=version+1,
        deadline_at=now()+interval '10 seconds'
    where id=p_match_id;

  return jsonb_build_object(
    'state',v_state,
    'turn_seat',v_next,
    'round',v_round,
    'finished',false
  );
end
$function$
;

CREATE OR REPLACE FUNCTION public.crwt_is_room_member(p_room_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select exists(select 1 from public.crwt_room_members m where m.room_id=p_room_id and m.user_id=auth.uid()) $function$
;

CREATE OR REPLACE FUNCTION public.crwt_v18_roll_core(p_match_id uuid, p_seat integer, p_actor uuid, p_idempotency_key text, p_bot_auto boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_match public.crwt_matches;
  v_state jsonb;
  v_player jsonb;
  v_owner jsonb;
  v_tile public.crwt_board_tiles;
  v_props jsonb;
  v_prop jsonb;
  v_effects jsonb;
  v_d1 integer; v_d2 integer; v_total integer; v_old integer; v_new integer;
  v_cash integer; v_rent integer; v_owner_seat integer; v_level integer; v_price integer; v_upgrade integer;
  v_takeover integer; v_event text:=''; v_pending jsonb:='null'::jsonb; v_result jsonb; v_charge jsonb;
  v_doubles boolean; v_focus text; v_tries integer:=0; v_lucky integer; v_shield integer; v_discount integer;
  v_festival_group integer; v_festival_until integer; v_extra integer; v_target integer; v_group integer;
  v_seq bigint; v_payload jsonb; v_existing jsonb; v_is_bot boolean;
  v_map_id text; v_rules jsonb; v_start_bonus integer; v_tax_amount integer; v_bonus_amount integer;
  v_chance_good_prob numeric; v_chance_good_cash integer; v_chance_bad_cash integer;
  v_island_skip integer; v_festival_rounds integer;
begin
  if p_idempotency_key is null or char_length(p_idempotency_key)<8 then raise exception 'invalid_idempotency_key'; end if;
  select payload into v_existing from public.crwt_match_events where match_id=p_match_id and idempotency_key=p_idempotency_key;
  if found then return v_existing; end if;

  select * into v_match from public.crwt_matches where id=p_match_id for update;
  if not found or v_match.status<>'active' then raise exception 'match_not_active'; end if;
  if p_seat<>v_match.turn_seat then raise exception 'not_current_seat'; end if;
  v_state:=v_match.state;
  v_map_id:=coalesce(nullif(v_state->>'map_id',''),'world_tour');
  v_rules:=public.crwt_v18_map_rules(v_map_id);
  v_start_bonus:=coalesce((v_rules->>'start_bonus')::integer,350);
  v_tax_amount:=coalesce((v_rules->>'tax')::integer,150);
  v_bonus_amount:=coalesce((v_rules->>'bonus')::integer,200);
  v_chance_good_prob:=coalesce((v_rules->>'chance_good_prob')::numeric,0.58);
  v_chance_good_cash:=coalesce((v_rules->>'chance_good_cash')::integer,250);
  v_chance_bad_cash:=coalesce((v_rules->>'chance_bad_cash')::integer,150);
  v_island_skip:=coalesce((v_rules->>'island_skip')::integer,1);
  v_festival_rounds:=greatest(1,coalesce((v_rules->>'festival_rounds')::integer,3));
  if v_state->>'phase'<>'await_roll' then raise exception 'roll_not_allowed'; end if;
  v_player:=v_state->'players'->(p_seat-1);
  if v_player is null or coalesce((v_player->>'bankrupt')::boolean,false) then raise exception 'player_unavailable'; end if;
  v_is_bot:=v_player->>'bot_key' is not null;
  v_effects:=coalesce(v_player->'effects','{}'::jsonb);
  v_focus:=v_effects->>'dice_focus';

  loop
    v_d1:=floor(random()*7)::integer;
    v_d2:=floor(random()*7)::integer;
    v_total:=v_d1+v_d2;
    v_tries:=v_tries+1;
    exit when v_focus is null
      or (v_focus='odd' and mod(v_total,2)=1)
      or (v_focus='even' and mod(v_total,2)=0)
      or v_tries>=12;
  end loop;
  if v_focus is not null then
    v_effects:=jsonb_set(v_effects,'{dice_focus}','null'::jsonb,true);
    v_player:=jsonb_set(v_player,'{effects}',v_effects,true);
  end if;

  v_doubles:=v_d1=v_d2;
  v_old:=coalesce((v_player->>'position')::integer,0);
  v_new:=(v_old+v_total)%32;
  v_cash:=coalesce((v_player->>'cash')::integer,2000);
  if v_old+v_total>=32 then
    v_cash:=v_cash+v_start_bonus;
    v_event:='Lewat START +'||v_start_bonus||' K';
  end if;
  v_player:=jsonb_set(v_player,'{position}',to_jsonb(v_new),true);
  v_player:=jsonb_set(v_player,'{cash}',to_jsonb(v_cash),true);
  v_state:=public.crwt_replace_player(v_state,p_seat,v_player);

  select * into v_tile from public.crwt_v18_get_tile(v_map_id,v_new);
  v_props:=coalesce(v_state->'properties','{}'::jsonb);
  v_festival_group:=case when v_state->>'festival_group' is null then null else (v_state->>'festival_group')::integer end;
  v_festival_until:=coalesce((v_state->>'festival_until_round')::integer,0);

  if v_total=0 then
    v_event:='ZERO ROLL • tetap di tempat • tidak memicu tile';
  elsif v_tile.kind in ('city','resort') then
    v_prop:=v_props->(v_new::text);
    if v_prop is null then
      v_player:=v_state->'players'->(p_seat-1);
      v_cash:=coalesce((v_player->>'cash')::integer,0);
      if p_bot_auto then
        if v_cash>=v_tile.price+250 then
          v_player:=jsonb_set(v_player,'{cash}',to_jsonb(v_cash-v_tile.price),true);
          v_state:=public.crwt_replace_player(v_state,p_seat,v_player);
          v_props:=jsonb_set(v_props,array[v_new::text],jsonb_build_object('owner_seat',p_seat,'level',0,'invested',v_tile.price),true);
          v_state:=jsonb_set(v_state,'{properties}',v_props,true);
          v_event:=case when v_event='' then 'BOT membeli '||v_tile.name else v_event||' • BOT membeli '||v_tile.name end;
        else
          v_event:=case when v_event='' then 'BOT melewati '||v_tile.name else v_event||' • BOT melewati '||v_tile.name end;
        end if;
      else
        v_pending:=jsonb_build_object('type','buy','tile_id',v_new,'name',v_tile.name,'price',v_tile.price,'auction_min',greatest(10,round(v_tile.price*0.5)::integer));
        v_event:=case when v_event='' then 'Bisa membeli '||v_tile.name else v_event||' • bisa membeli '||v_tile.name end;
      end if;
    else
      v_owner_seat:=(v_prop->>'owner_seat')::integer;
      v_level:=coalesce((v_prop->>'level')::integer,0);
      if v_owner_seat=p_seat then
        if v_level<4 then
          v_effects:=coalesce((v_state->'players'->(p_seat-1))->'effects','{}'::jsonb);
          v_upgrade:=public.crwt_upgrade_cost(v_tile.price,v_level,coalesce((v_effects->>'builder_discount')::boolean,false));
          v_player:=v_state->'players'->(p_seat-1);
          if p_bot_auto then
            if coalesce((v_player->>'cash')::integer,0)>=v_upgrade+250 then
              v_player:=jsonb_set(v_player,'{cash}',to_jsonb((v_player->>'cash')::integer-v_upgrade),true);
              if coalesce((v_effects->>'builder_discount')::boolean,false) then
                v_effects:=jsonb_set(v_effects,'{builder_discount}','false'::jsonb,true);
                v_player:=jsonb_set(v_player,'{effects}',v_effects,true);
              end if;
              v_state:=public.crwt_replace_player(v_state,p_seat,v_player);
              v_prop:=jsonb_set(v_prop,'{level}',to_jsonb(v_level+1),true);
              v_prop:=jsonb_set(v_prop,'{invested}',to_jsonb(coalesce((v_prop->>'invested')::integer,0)+v_upgrade),true);
              v_props:=jsonb_set(v_props,array[v_new::text],v_prop,true);
              v_state:=jsonb_set(v_state,'{properties}',v_props,true);
              v_event:='BOT upgrade '||v_tile.name;
            else v_event:='BOT di properti sendiri'; end if;
          else
            v_pending:=jsonb_build_object('type','upgrade','tile_id',v_new,'name',v_tile.name,'current_level',v_level,'next_level',v_level+1,'price',v_upgrade);
            v_event:='Bisa upgrade '||v_tile.name;
          end if;
        else v_event:='Landmark milik sendiri'; end if;
      else
        v_rent:=public.crwt_v18_rent_amount(v_map_id,v_tile.kind,v_tile.price,v_level,v_tile.group_id,v_festival_group,v_festival_until,v_match.round);
        v_player:=v_state->'players'->(p_seat-1);
        v_effects:=coalesce(v_player->'effects','{}'::jsonb);
        v_shield:=coalesce((v_effects->>'shield')::integer,0);
        v_discount:=coalesce((v_effects->>'rent_discount')::integer,0);
        if v_shield>0 then
          v_effects:=jsonb_set(v_effects,'{shield}',to_jsonb(v_shield-1),true);
          v_player:=jsonb_set(v_player,'{effects}',v_effects,true);
          v_state:=public.crwt_replace_player(v_state,p_seat,v_player);
          v_event:='Rent Shield memblokir sewa!';
        else
          if v_discount>0 then
            v_rent:=greatest(1,round(v_rent*0.5)::integer);
            v_effects:=jsonb_set(v_effects,'{rent_discount}',to_jsonb(v_discount-1),true);
            v_player:=jsonb_set(v_player,'{effects}',v_effects,true);
            v_state:=public.crwt_replace_player(v_state,p_seat,v_player);
          end if;
          v_charge:=public.crwt_v15_charge(v_state,p_seat,v_rent,v_owner_seat,'Sewa '||v_tile.name);
          v_state:=v_charge->'state';
          if coalesce((v_charge->>'liquidation')::boolean,false) then
            v_pending:=v_charge->'pending';
            v_event:='Dana tidak cukup untuk sewa '||v_rent||' K • jual aset';
          elsif coalesce((v_charge->>'bankrupt')::boolean,false) then
            v_event:='Bangkrut karena sewa '||v_tile.name;
          else
            v_event:='Bayar sewa '||v_rent||' K ke '||((v_state->'players'->(v_owner_seat-1))->>'name');
            v_player:=v_state->'players'->(p_seat-1);
            v_takeover:=public.crwt_v15_takeover_cost(v_tile.price,coalesce((v_prop->>'invested')::integer,v_tile.price),v_level);
            if p_bot_auto then
              if coalesce((v_player->>'cash')::integer,0)>=v_takeover+500 then
                v_player:=jsonb_set(v_player,'{cash}',to_jsonb((v_player->>'cash')::integer-v_takeover),true);
                v_state:=public.crwt_replace_player(v_state,p_seat,v_player);
                v_owner:=v_state->'players'->(v_owner_seat-1);
                v_owner:=jsonb_set(v_owner,'{cash}',to_jsonb((v_owner->>'cash')::integer+v_takeover),true);
                v_state:=public.crwt_replace_player(v_state,v_owner_seat,v_owner);
                v_prop:=jsonb_set(v_prop,'{owner_seat}',to_jsonb(p_seat),true);
                v_props:=jsonb_set(v_props,array[v_new::text],v_prop,true);
                v_state:=jsonb_set(v_state,'{properties}',v_props,true);
                v_event:=v_event||' • BOT takeover '||v_tile.name;
              end if;
            elsif coalesce((v_player->>'cash')::integer,0)>=v_takeover then
              v_pending:=jsonb_build_object('type','takeover','tile_id',v_new,'name',v_tile.name,'owner_seat',v_owner_seat,'price',v_takeover,'level',v_level);
            end if;
          end if;
        end if;
      end if;
    end if;
  elsif v_tile.kind='tax' then
    v_charge:=public.crwt_v15_charge(v_state,p_seat,v_tax_amount,null,'Pajak');
    v_state:=v_charge->'state';
    if coalesce((v_charge->>'liquidation')::boolean,false) then v_pending:=v_charge->'pending'; v_event:='Dana pajak kurang • jual aset';
    elsif coalesce((v_charge->>'bankrupt')::boolean,false) then v_event:='Bangkrut karena pajak';
    else v_event:='Pajak -'||v_tax_amount||' K'; end if;
  elsif v_tile.kind='bonus' then
    v_player:=v_state->'players'->(p_seat-1);
    v_player:=jsonb_set(v_player,'{cash}',to_jsonb(coalesce((v_player->>'cash')::integer,0)+v_bonus_amount),true);
    v_state:=public.crwt_replace_player(v_state,p_seat,v_player);
    v_event:='Bonus +'||v_bonus_amount||' K';
  elsif v_tile.kind='chance' then
    v_player:=v_state->'players'->(p_seat-1);
    v_effects:=coalesce(v_player->'effects','{}'::jsonb);
    v_lucky:=coalesce((v_effects->>'lucky_chance')::integer,0);
    if v_lucky>0 or random()<v_chance_good_prob then
      if v_lucky>0 then v_effects:=jsonb_set(v_effects,'{lucky_chance}',to_jsonb(v_lucky-1),true); end if;
      if random()<0.55 then
        v_player:=jsonb_set(v_player,'{cash}',to_jsonb(coalesce((v_player->>'cash')::integer,0)+v_chance_good_cash),true);
        v_event:='Lucky Card +'||v_chance_good_cash||' K';
      else
        v_effects:=jsonb_set(v_effects,'{shield}',to_jsonb(coalesce((v_effects->>'shield')::integer,0)+1),true);
        v_event:='Lucky Card: Rent Shield!';
      end if;
      v_player:=jsonb_set(v_player,'{effects}',v_effects,true);
      v_state:=public.crwt_replace_player(v_state,p_seat,v_player);
    else
      v_charge:=public.crwt_v15_charge(v_state,p_seat,v_chance_bad_cash,null,'Bad Chance Card');
      v_state:=v_charge->'state';
      if coalesce((v_charge->>'liquidation')::boolean,false) then v_pending:=v_charge->'pending'; v_event:='Bad Card: butuh '||v_chance_bad_cash||' K • jual aset';
      elsif coalesce((v_charge->>'bankrupt')::boolean,false) then v_event:='Bangkrut karena Bad Card';
      else v_event:='Bad Card -'||v_chance_bad_cash||' K'; end if;
    end if;
  elsif v_tile.kind='island' then
    v_player:=v_state->'players'->(p_seat-1);
    v_player:=jsonb_set(v_player,'{skip_turns}',to_jsonb(v_island_skip),true);
    v_state:=public.crwt_replace_player(v_state,p_seat,v_player);
    v_event:='Terjebak: lewati '||v_island_skip||' giliran';
  elsif v_tile.kind='travel' then
    if p_bot_auto then
      select tile_id into v_target from public.crwt_map_tiles t
      where t.map_id=v_map_id and t.kind in ('city','resort') and not (v_props ? t.tile_id::text)
      order by random() limit 1;
      if v_target is null then select tile_id into v_target from public.crwt_map_tiles where map_id=v_map_id and kind in ('city','resort') order by random() limit 1; end if;
      v_player:=v_state->'players'->(p_seat-1);
      v_player:=jsonb_set(v_player,'{position}',to_jsonb(v_target),true);
      v_state:=public.crwt_replace_player(v_state,p_seat,v_player);
      v_event:='BOT World Travel ke '||(select name from public.crwt_map_tiles where map_id=v_map_id and tile_id=v_target);
      v_new:=v_target;
    else
      v_pending:=jsonb_build_object('type','travel','name','World Travel');
      v_event:='Pilih tujuan World Travel';
    end if;
  elsif v_tile.kind='festival' then
    if p_bot_auto then
      v_group:=floor(random()*10)::integer;
      v_state:=jsonb_set(v_state,'{festival_group}',to_jsonb(v_group),true);
      v_state:=jsonb_set(v_state,'{festival_until_round}',to_jsonb(v_match.round+v_festival_rounds-1),true);
      v_event:='BOT memilih Festival distrik '||v_group||' selama '||v_festival_rounds||' putaran';
    else
      v_pending:=jsonb_build_object('type','festival','name','Festival');
      v_event:='Pilih distrik Festival x2';
    end if;
  else
    v_event:='Mendarat di '||v_tile.name;
  end if;

  v_state:=jsonb_set(v_state,'{last_roll}',jsonb_build_object(
    'seat',p_seat,'d1',v_d1,'d2',v_d2,'total',v_total,'doubles',v_doubles,'zero_roll',v_total=0,'dice_min',0,'dice_max',6,
    'from',v_old,'to',v_new,'tile',coalesce((select name from public.crwt_map_tiles where map_id=v_map_id and tile_id=v_new),v_tile.name),'event',v_event
  ),true);
  v_state:=jsonb_set(v_state,'{message}',to_jsonb(v_event),true);

  if v_pending<>'null'::jsonb then
    v_state:=jsonb_set(v_state,'{phase}',to_jsonb(case when v_pending->>'type'='liquidation' then 'liquidation' else 'decision' end),true);
    v_state:=jsonb_set(v_state,'{pending}',v_pending,true);
    update public.crwt_matches set state=v_state,version=version+1,deadline_at=now()+interval '15 seconds' where id=p_match_id;
  else
    v_player:=v_state->'players'->(p_seat-1);
    v_effects:=coalesce(v_player->'effects','{}'::jsonb);
    v_extra:=coalesce((v_effects->>'extra_roll')::integer,0);
    if coalesce((v_player->>'bankrupt')::boolean,false) then
      select public.crwt_v15_advance(p_match_id,v_state,p_seat) into v_result;
      v_state:=v_result->'state';
    elsif v_doubles or v_extra>0 then
      if not v_doubles and v_extra>0 then
        v_effects:=jsonb_set(v_effects,'{extra_roll}',to_jsonb(v_extra-1),true);
        v_player:=jsonb_set(v_player,'{effects}',v_effects,true);
        v_state:=public.crwt_replace_player(v_state,p_seat,v_player);
      end if;
      v_state:=jsonb_set(v_state,'{phase}','"await_roll"'::jsonb,true);
      v_state:=jsonb_set(v_state,'{pending}','null'::jsonb,true);
      update public.crwt_matches set state=v_state,version=version+1,deadline_at=now()+interval '10 seconds' where id=p_match_id;
    else
      select public.crwt_v15_advance(p_match_id,v_state,p_seat) into v_result;
      v_state:=v_result->'state';
    end if;
  end if;

  select coalesce(max(seq),1)+1 into v_seq from public.crwt_match_events where match_id=p_match_id;
  v_payload:=jsonb_build_object(
    'ok',true,'match_id',p_match_id,'roll',v_state->'last_roll','state',v_state,
    'turn_seat',(select turn_seat from public.crwt_matches where id=p_match_id),
    'round',(select round from public.crwt_matches where id=p_match_id),
    'version',(select version from public.crwt_matches where id=p_match_id),
    'deadline_at',(select deadline_at from public.crwt_matches where id=p_match_id)
  );
  insert into public.crwt_match_events(match_id,seq,actor_user_id,event_type,payload,idempotency_key)
  values(p_match_id,v_seq,p_actor,case when p_bot_auto then 'bot_roll_v18' else 'roll_v18' end,v_payload,p_idempotency_key);
  return v_payload;
end $function$
;

CREATE OR REPLACE FUNCTION public.crwt_v18_roll(p_match_id uuid, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_match public.crwt_matches; v_seat integer;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into v_match from public.crwt_matches where id=p_match_id;
  if not found then raise exception 'match_not_found'; end if;
  select seat into v_seat from public.crwt_room_members
  where room_id=v_match.room_id and user_id=auth.uid();
  if v_seat is null or v_seat<>v_match.turn_seat then raise exception 'not_your_turn'; end if;
  return public.crwt_v18_roll_core(p_match_id,v_seat,auth.uid(),p_idempotency_key,false);
end $function$
;

CREATE OR REPLACE FUNCTION public.crwt_v18_bot_step(p_match_id uuid, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_match public.crwt_matches; v_room public.crwt_rooms; v_seat integer;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into v_match from public.crwt_matches where id=p_match_id;
  if not found then raise exception 'match_not_found'; end if;
  select * into v_room from public.crwt_rooms where id=v_match.room_id;
  if v_room.host_user_id<>auth.uid() then raise exception 'host_only'; end if;
  v_seat:=v_match.turn_seat;
  if not exists(
    select 1 from public.crwt_room_members
    where room_id=v_match.room_id and seat=v_seat and bot_key is not null
  ) then raise exception 'current_player_not_bot'; end if;
  return public.crwt_v18_roll_core(p_match_id,v_seat,auth.uid(),p_idempotency_key,true);
end $function$
;

CREATE OR REPLACE FUNCTION public.crwt_v18_timeout_apply(p_match_id uuid, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_match public.crwt_matches; v_state jsonb; v_phase text; v_type text;
  v_seat integer; v_is_bot boolean; v_result jsonb; v_seq bigint;
  v_payload jsonb; v_existing jsonb;
begin
  select payload into v_existing
  from public.crwt_match_events
  where match_id=p_match_id and idempotency_key=p_idempotency_key;
  if found then return v_existing; end if;

  select * into v_match from public.crwt_matches where id=p_match_id for update;
  if not found then return jsonb_build_object('ok',false,'reason','match_not_found'); end if;
  if v_match.status<>'active' then return jsonb_build_object('ok',true,'acted',false,'reason','not_active'); end if;
  if v_match.deadline_at is null or now()<v_match.deadline_at then
    return jsonb_build_object('ok',true,'acted',false,'reason','not_due','deadline_at',v_match.deadline_at,'version',v_match.version);
  end if;

  v_state:=v_match.state; v_phase:=v_state->>'phase'; v_seat:=v_match.turn_seat;

  if v_phase='await_roll' then
    select exists(
      select 1 from public.crwt_room_members
      where room_id=v_match.room_id and seat=v_seat and bot_key is not null
    ) into v_is_bot;
    return public.crwt_v18_roll_core(p_match_id,v_seat,null,p_idempotency_key,v_is_bot);
  elsif v_phase='decision' then
    v_type:=v_state#>>'{pending,type}';
    v_state:=jsonb_set(v_state,'{message}',to_jsonb('Waktu habis • keputusan otomatis dilewati.'),true);
    if v_type in ('travel','festival') then
      v_state:=jsonb_set(v_state,'{pending}','null'::jsonb,true);
      select public.crwt_v15_advance(p_match_id,v_state,v_seat) into v_result;
    else
      select public.crwt_v15_after_property_decision(p_match_id,v_state,v_seat) into v_result;
    end if;
    v_state:=v_result->'state';
  elsif v_phase='auction' then
    select public.crwt_v15_finish_auction(p_match_id,v_state) into v_result;
    v_state:=v_result->'state';
  elsif v_phase='liquidation' then
    select public.crwt_v15_bankrupt_core(p_match_id,v_state,v_seat) into v_result;
    v_state:=v_result->'state';
  else
    update public.crwt_matches set deadline_at=now()+interval '10 seconds' where id=p_match_id;
    return jsonb_build_object('ok',true,'acted',false,'reason','unknown_phase','phase',v_phase);
  end if;

  select coalesce(max(seq),1)+1 into v_seq
  from public.crwt_match_events where match_id=p_match_id;

  v_payload:=jsonb_build_object(
    'ok',true,'acted',true,'timeout_phase',v_phase,'state',v_state,
    'turn_seat',(select turn_seat from public.crwt_matches where id=p_match_id),
    'round',(select round from public.crwt_matches where id=p_match_id),
    'version',(select version from public.crwt_matches where id=p_match_id),
    'deadline_at',(select deadline_at from public.crwt_matches where id=p_match_id)
  );

  insert into public.crwt_match_events(
    match_id,seq,actor_user_id,event_type,payload,idempotency_key
  ) values(
    p_match_id,v_seq,null,'timeout_v18',v_payload,p_idempotency_key
  ) on conflict(match_id,idempotency_key) do nothing;

  return v_payload;
end $function$
;

CREATE OR REPLACE FUNCTION public.crwt_v18_timeout_tick(p_match_id uuid, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_room uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select room_id into v_room from public.crwt_matches where id=p_match_id;
  if v_room is null then raise exception 'match_not_found'; end if;
  if not public.crwt_is_room_member(v_room) then raise exception 'not_in_match'; end if;
  return public.crwt_v18_timeout_apply(p_match_id,p_idempotency_key);
end $function$
;

CREATE OR REPLACE FUNCTION public.crwt_v15_timeout_sweep()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare rec record; v_count integer:=0; v_key text;
begin
  for rec in
    select id,version from public.crwt_matches
    where status='active' and deadline_at is not null and deadline_at<=now()
    order by deadline_at asc limit 50
  loop
    begin
      v_key:='cron18-'||rec.id::text||'-v'||rec.version::text;
      perform public.crwt_v18_timeout_apply(rec.id,v_key);
      v_count:=v_count+1;
    exception when others then
      raise warning 'CRWT v18 timeout sweep failed for %: %',rec.id,sqlerrm;
    end;
  end loop;
  return v_count;
end $function$
;

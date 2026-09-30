create table if not exists public.crwt_event_catalog (
  id text primary key,
  title text not null,
  subtitle text not null default '',
  description text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  accent text not null default 'gold',
  enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crwt_event_catalog_window check (ends_at > starts_at)
);

create table if not exists public.crwt_mission_catalog (
  id text primary key,
  event_id text references public.crwt_event_catalog(id) on delete set null,
  cadence text not null,
  title text not null,
  description text not null default '',
  metric text not null,
  target integer not null,
  reward_gold bigint not null default 0,
  reward_diamonds integer not null default 0,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crwt_mission_catalog_cadence check (cadence in ('daily','weekly')),
  constraint crwt_mission_catalog_metric check (metric in ('play_matches','win_matches','unlock_items','upgrade_items')),
  constraint crwt_mission_catalog_target check (target > 0),
  constraint crwt_mission_catalog_rewards check (reward_gold >= 0 and reward_diamonds >= 0),
  constraint crwt_mission_catalog_window check (ends_at is null or ends_at > starts_at)
);

create table if not exists public.crwt_mission_claims (
  user_id uuid not null,
  mission_id text not null references public.crwt_mission_catalog(id) on delete cascade,
  period_key text not null,
  reward_gold bigint not null default 0,
  reward_diamonds integer not null default 0,
  claimed_at timestamptz not null default now(),
  primary key (user_id, mission_id, period_key)
);

create index if not exists crwt_mission_claims_user_claimed_idx
  on public.crwt_mission_claims(user_id, claimed_at desc);

alter table public.crwt_event_catalog enable row level security;
alter table public.crwt_mission_catalog enable row level security;
alter table public.crwt_mission_claims enable row level security;

revoke all on table public.crwt_event_catalog from anon, authenticated;
revoke all on table public.crwt_mission_catalog from anon, authenticated;
revoke all on table public.crwt_mission_claims from anon, authenticated;

insert into public.crwt_event_catalog(id,title,subtitle,description,starts_at,ends_at,accent,enabled,sort_order)
values ('anime_world_opening','ANIME WORLD OPENING','Welcome to Crazy Rich: World Tour',
'Rayakan pembukaan Anime World dengan misi harian dan mingguan selama perjalananmu.',
'2026-09-30 00:00:00+00','2026-11-01 00:00:00+00','gold',true,10)
on conflict (id) do update set title=excluded.title,subtitle=excluded.subtitle,description=excluded.description,
starts_at=excluded.starts_at,ends_at=excluded.ends_at,accent=excluded.accent,enabled=excluded.enabled,
sort_order=excluded.sort_order,updated_at=now();

insert into public.crwt_mission_catalog
(id,event_id,cadence,title,description,metric,target,reward_gold,reward_diamonds,starts_at,ends_at,enabled,sort_order)
values
('daily_play_1',null,'daily','FIRST TRIP','Selesaikan 1 pertandingan hari ini.','play_matches',1,500,0,'2026-09-30 00:00:00+00',null,true,10),
('daily_play_3',null,'daily','WORLD HOPPER','Selesaikan 3 pertandingan hari ini.','play_matches',3,1200,0,'2026-09-30 00:00:00+00',null,true,20),
('daily_win_1',null,'daily','DAILY CHAMPION','Menangkan 1 pertandingan hari ini.','win_matches',1,800,2,'2026-09-30 00:00:00+00',null,true,30),
('weekly_play_10',null,'weekly','WORLD TOUR REGULAR','Selesaikan 10 pertandingan minggu ini.','play_matches',10,5000,15,'2026-09-30 00:00:00+00',null,true,110),
('weekly_win_5',null,'weekly','STAR TRAVELER','Menangkan 5 pertandingan minggu ini.','win_matches',5,7500,25,'2026-09-30 00:00:00+00',null,true,120),
('weekly_unlock_1',null,'weekly','COLLECTOR','Buka 1 item koleksi minggu ini.','unlock_items',1,1500,5,'2026-09-30 00:00:00+00',null,true,130)
on conflict (id) do update set event_id=excluded.event_id,cadence=excluded.cadence,title=excluded.title,
description=excluded.description,metric=excluded.metric,target=excluded.target,reward_gold=excluded.reward_gold,
reward_diamonds=excluded.reward_diamonds,starts_at=excluded.starts_at,ends_at=excluded.ends_at,
enabled=excluded.enabled,sort_order=excluded.sort_order,updated_at=now();

create or replace function public.crwt_event_snapshot_v30()
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid(); v_now timestamptz := now(); v_events jsonb; v_missions jsonb := '[]'::jsonb;
  v_claimable integer := 0; v_row record; v_period_start timestamptz; v_period_end timestamptz;
  v_period_key text; v_progress integer; v_claimed boolean;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  perform public.crwt_progression_bootstrap();
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'title',e.title,'subtitle',e.subtitle,
    'description',e.description,'starts_at',e.starts_at,'ends_at',e.ends_at,'accent',e.accent)
    order by e.sort_order),'[]'::jsonb)
  into v_events from public.crwt_event_catalog e
  where e.enabled=true and e.starts_at <= v_now and e.ends_at > v_now;

  for v_row in select * from public.crwt_mission_catalog m
    where m.enabled=true and m.starts_at <= v_now and (m.ends_at is null or m.ends_at > v_now)
    order by case when m.cadence='daily' then 0 else 1 end,m.sort_order,m.id
  loop
    if v_row.cadence='daily' then
      v_period_start := date_trunc('day',v_now at time zone 'UTC') at time zone 'UTC';
      v_period_end := v_period_start + interval '1 day';
      v_period_key := to_char(v_period_start at time zone 'UTC','YYYY-MM-DD');
    else
      v_period_start := date_trunc('week',v_now at time zone 'UTC') at time zone 'UTC';
      v_period_end := v_period_start + interval '7 days';
      v_period_key := to_char(v_period_start at time zone 'UTC','IYYY-"W"IW');
    end if;

    if v_row.metric='play_matches' then
      select count(distinct r.match_id)::integer into v_progress from public.crwt_match_results r
      where r.user_id=v_uid and r.created_at >= v_period_start and r.created_at < v_period_end;
    elsif v_row.metric='win_matches' then
      select count(distinct r.match_id)::integer into v_progress from public.crwt_match_results r
      where r.user_id=v_uid and r.placement=1 and r.created_at >= v_period_start and r.created_at < v_period_end;
    elsif v_row.metric='unlock_items' then
      select count(*)::integer into v_progress from public.crwt_progression_events p
      where p.user_id=v_uid and p.event_type='unlock' and p.created_at >= v_period_start and p.created_at < v_period_end;
    elsif v_row.metric='upgrade_items' then
      select count(*)::integer into v_progress from public.crwt_progression_events p
      where p.user_id=v_uid and p.event_type='upgrade' and p.created_at >= v_period_start and p.created_at < v_period_end;
    else v_progress := 0; end if;

    v_progress := least(coalesce(v_progress,0),v_row.target);
    select exists(select 1 from public.crwt_mission_claims c where c.user_id=v_uid
      and c.mission_id=v_row.id and c.period_key=v_period_key) into v_claimed;
    if v_progress >= v_row.target and not v_claimed then v_claimable := v_claimable + 1; end if;
    v_missions := v_missions || jsonb_build_array(jsonb_build_object(
      'id',v_row.id,'event_id',v_row.event_id,'cadence',v_row.cadence,'title',v_row.title,
      'description',v_row.description,'metric',v_row.metric,'target',v_row.target,'progress',v_progress,
      'completed',v_progress >= v_row.target,'claimed',v_claimed,'reward_gold',v_row.reward_gold,
      'reward_diamonds',v_row.reward_diamonds,'period_key',v_period_key,'reset_at',v_period_end));
  end loop;

  return jsonb_build_object('server_now',v_now,
    'daily_reset_at',(date_trunc('day',v_now at time zone 'UTC') at time zone 'UTC')+interval '1 day',
    'weekly_reset_at',(date_trunc('week',v_now at time zone 'UTC') at time zone 'UTC')+interval '7 days',
    'claimable',v_claimable,'events',v_events,'missions',v_missions);
end
$function$;

create or replace function public.crwt_claim_mission_v30(p_mission_id text)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_uid uuid:=auth.uid(); v_now timestamptz:=now(); v_mission public.crwt_mission_catalog%rowtype;
  v_period_start timestamptz; v_period_end timestamptz; v_period_key text; v_progress integer;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  perform public.crwt_progression_bootstrap();
  select * into v_mission from public.crwt_mission_catalog m where m.id=p_mission_id and m.enabled=true
    and m.starts_at <= v_now and (m.ends_at is null or m.ends_at > v_now);
  if not found then raise exception 'mission_not_found'; end if;
  perform 1 from public.crwt_player_profiles where user_id=v_uid for update;
  if v_mission.cadence='daily' then
    v_period_start:=date_trunc('day',v_now at time zone 'UTC') at time zone 'UTC';
    v_period_end:=v_period_start+interval '1 day';
    v_period_key:=to_char(v_period_start at time zone 'UTC','YYYY-MM-DD');
  else
    v_period_start:=date_trunc('week',v_now at time zone 'UTC') at time zone 'UTC';
    v_period_end:=v_period_start+interval '7 days';
    v_period_key:=to_char(v_period_start at time zone 'UTC','IYYY-"W"IW');
  end if;
  if exists(select 1 from public.crwt_mission_claims c where c.user_id=v_uid
    and c.mission_id=v_mission.id and c.period_key=v_period_key) then raise exception 'mission_already_claimed'; end if;
  if v_mission.metric='play_matches' then
    select count(distinct r.match_id)::integer into v_progress from public.crwt_match_results r
    where r.user_id=v_uid and r.created_at >= v_period_start and r.created_at < v_period_end;
  elsif v_mission.metric='win_matches' then
    select count(distinct r.match_id)::integer into v_progress from public.crwt_match_results r
    where r.user_id=v_uid and r.placement=1 and r.created_at >= v_period_start and r.created_at < v_period_end;
  elsif v_mission.metric='unlock_items' then
    select count(*)::integer into v_progress from public.crwt_progression_events p
    where p.user_id=v_uid and p.event_type='unlock' and p.created_at >= v_period_start and p.created_at < v_period_end;
  elsif v_mission.metric='upgrade_items' then
    select count(*)::integer into v_progress from public.crwt_progression_events p
    where p.user_id=v_uid and p.event_type='upgrade' and p.created_at >= v_period_start and p.created_at < v_period_end;
  else v_progress:=0; end if;
  if coalesce(v_progress,0) < v_mission.target then raise exception 'mission_not_complete'; end if;
  insert into public.crwt_mission_claims(user_id,mission_id,period_key,reward_gold,reward_diamonds)
    values(v_uid,v_mission.id,v_period_key,v_mission.reward_gold,v_mission.reward_diamonds);
  update public.crwt_player_profiles set gold=gold+v_mission.reward_gold,
    diamonds=diamonds+v_mission.reward_diamonds,updated_at=now() where user_id=v_uid;
  insert into public.crwt_progression_events(user_id,event_type,item_type,item_id,gold_delta,diamonds_delta,metadata)
    values(v_uid,'mission_claim','mission',v_mission.id,v_mission.reward_gold,v_mission.reward_diamonds,
      jsonb_build_object('period_key',v_period_key,'cadence',v_mission.cadence,'metric',v_mission.metric,'target',v_mission.target));
  return jsonb_build_object('ok',true,'mission_id',v_mission.id,'period_key',v_period_key,
    'reward_gold',v_mission.reward_gold,'reward_diamonds',v_mission.reward_diamonds,
    'events',public.crwt_event_snapshot_v30(),'progression',public.crwt_progression_snapshot());
end
$function$;

revoke all on function public.crwt_event_snapshot_v30() from public, anon;
grant execute on function public.crwt_event_snapshot_v30() to authenticated;
revoke all on function public.crwt_claim_mission_v30(text) from public, anon;
grant execute on function public.crwt_claim_mission_v30(text) to authenticated;

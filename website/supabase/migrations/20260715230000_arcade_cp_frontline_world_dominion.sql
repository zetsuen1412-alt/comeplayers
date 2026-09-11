-- ComePlayers Arcade: CP Frontline World Dominion progression and battle history.
-- Tables are server-managed. Browser roles cannot read or mutate them directly.
begin;

create extension if not exists pgcrypto;

create table if not exists public.arcade_frontline_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  level integer not null default 1,
  power integer not null default 900,
  wins integer not null default 0,
  highest_score bigint not null default 0,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint arcade_frontline_state_object_v59 check (jsonb_typeof(state) = 'object'),
  constraint arcade_frontline_level_v59 check (level between 1 and 100),
  constraint arcade_frontline_power_v59 check (power between 0 and 1000000000),
  constraint arcade_frontline_wins_v59 check (wins between 0 and 10000000),
  constraint arcade_frontline_high_score_v59 check (highest_score between 0 and 1000000000)
);

create index if not exists arcade_frontline_profiles_power_v59_idx
  on public.arcade_frontline_profiles(power desc, wins desc);
create index if not exists arcade_frontline_profiles_seen_v59_idx
  on public.arcade_frontline_profiles(last_seen_at desc);

create table if not exists public.arcade_frontline_battles (
  id uuid primary key default gen_random_uuid(),
  attacker_id uuid not null references public.profiles(id) on delete cascade,
  defender_id uuid references public.profiles(id) on delete set null,
  client_event_id text not null,
  result text not null,
  score bigint not null default 0,
  stars smallint not null default 0,
  mission_code text not null,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint arcade_frontline_distinct_players_v59 check (
    defender_id is null or attacker_id <> defender_id
  ),
  constraint arcade_frontline_event_id_v59 check (
    char_length(client_event_id) between 8 and 80
  ),
  constraint arcade_frontline_result_v59 check (result in ('victory', 'defeat')),
  constraint arcade_frontline_score_v59 check (score between 0 and 1000000000),
  constraint arcade_frontline_stars_v59 check (stars between 0 and 3),
  constraint arcade_frontline_mission_v59 check (
    mission_code in (
      'operation-first-light',
      'iron-rain',
      'silent-horizon',
      'black-tide',
      'skybreaker',
      'world-dominion'
    )
  ),
  constraint arcade_frontline_summary_object_v59 check (
    jsonb_typeof(summary) = 'object'
  ),
  constraint arcade_frontline_attacker_event_v59 unique (
    attacker_id,
    client_event_id
  )
);

create index if not exists arcade_frontline_battles_attacker_v59_idx
  on public.arcade_frontline_battles(attacker_id, created_at desc);
create index if not exists arcade_frontline_battles_defender_v59_idx
  on public.arcade_frontline_battles(defender_id, created_at desc)
  where defender_id is not null;

alter table public.arcade_frontline_profiles enable row level security;
alter table public.arcade_frontline_battles enable row level security;

revoke all on public.arcade_frontline_profiles from public, anon, authenticated;
revoke all on public.arcade_frontline_battles from public, anon, authenticated;
grant all on public.arcade_frontline_profiles to service_role;
grant all on public.arcade_frontline_battles to service_role;

comment on table public.arcade_frontline_profiles is
  'Server-managed CP Frontline progression and autosave state.';
comment on table public.arcade_frontline_battles is
  'Server-managed CP Frontline campaign and friend attack history.';

commit;

select 'arcade_cp_frontline_world_dominion_v59_ready' as status;

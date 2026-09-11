begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  organizer_name text not null,
  organizer_avatar_url text,
  title text not null,
  game_title text not null,
  game_mode text not null,
  description text not null,
  rules text not null,
  platform text not null,
  region text not null,
  tournament_format text not null,
  skill_level text not null default 'all_levels',
  team_size smallint not null default 1,
  max_participants integer not null,
  participant_count integer not null default 0,
  entry_fee numeric(14, 2) not null default 0,
  prize_pool numeric(14, 2) not null default 0,
  currency text not null default 'IDR',
  registration_deadline timestamptz not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  status text not null default 'published',
  is_featured boolean not null default false,
  is_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tournaments_title_length check (char_length(title) between 4 and 120),
  constraint tournaments_game_title_length check (char_length(game_title) between 2 and 80),
  constraint tournaments_game_mode_length check (char_length(game_mode) between 2 and 60),
  constraint tournaments_description_length check (char_length(description) between 20 and 5000),
  constraint tournaments_rules_length check (char_length(rules) between 10 and 12000),
  constraint tournaments_platform_length check (char_length(platform) between 2 and 40),
  constraint tournaments_region_length check (char_length(region) between 2 and 40),
  constraint tournaments_format_valid check (
    tournament_format in ('single_elimination', 'double_elimination', 'round_robin', 'swiss', 'battle_royale')
  ),
  constraint tournaments_skill_level_valid check (
    skill_level in ('all_levels', 'beginner', 'intermediate', 'advanced', 'pro')
  ),
  constraint tournaments_team_size_valid check (team_size between 1 and 100),
  constraint tournaments_capacity_valid check (max_participants between 2 and 4096),
  constraint tournaments_participant_count_valid check (
    participant_count between 0 and max_participants
  ),
  constraint tournaments_entry_fee_valid check (entry_fee >= 0),
  constraint tournaments_prize_pool_valid check (prize_pool >= 0),
  constraint tournaments_currency_valid check (currency ~ '^[A-Z]{3}$'),
  constraint tournaments_schedule_valid check (
    registration_deadline < starts_at
    and (ends_at is null or ends_at > starts_at)
  ),
  constraint tournaments_status_valid check (
    status in ('draft', 'published', 'registration_closed', 'live', 'completed', 'cancelled')
  )
);

create table public.tournament_registrations (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  player_name text not null,
  game_username text not null,
  team_name text,
  contact_handle text,
  notes text,
  status text not null default 'registered',
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tournament_registrations_unique_user unique (tournament_id, user_id),
  constraint tournament_registrations_player_name_length check (char_length(player_name) between 1 and 120),
  constraint tournament_registrations_game_username_length check (char_length(game_username) between 2 and 80),
  constraint tournament_registrations_team_name_length check (team_name is null or char_length(team_name) between 2 and 80),
  constraint tournament_registrations_contact_length check (contact_handle is null or char_length(contact_handle) <= 120),
  constraint tournament_registrations_notes_length check (notes is null or char_length(notes) <= 1000),
  constraint tournament_registrations_status_valid check (
    status in ('registered', 'checked_in', 'withdrawn', 'disqualified')
  )
);

create index tournaments_public_schedule_idx
  on public.tournaments (status, starts_at);
create index tournaments_host_idx
  on public.tournaments (host_id, created_at desc);
create index tournaments_game_idx
  on public.tournaments (game_title, starts_at);
create index tournament_registrations_tournament_status_idx
  on public.tournament_registrations (tournament_id, status);
create index tournament_registrations_user_idx
  on public.tournament_registrations (user_id, joined_at desc);

create or replace function private.cp_prepare_tournament()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_avatar text;
begin
  if tg_op = 'INSERT' then
    select
      coalesce(nullif(trim(p.full_name), ''), nullif(trim(p.username), ''), split_part(p.email, '@', 1), 'ComePlayers Organizer'),
      p.avatar_url
    into v_name, v_avatar
    from public.profiles p
    where p.id = new.host_id;

    if v_name is null then
      raise exception using errcode = 'P0001', message = 'Organizer profile is not available.';
    end if;

    new.organizer_name := left(v_name, 120);
    new.organizer_avatar_url := v_avatar;
    new.participant_count := 0;
    new.is_featured := false;
    new.is_verified := false;
    new.created_at := now();
    new.updated_at := now();
  else
    new.host_id := old.host_id;
    new.organizer_name := old.organizer_name;
    new.organizer_avatar_url := old.organizer_avatar_url;
    new.is_featured := old.is_featured;
    new.is_verified := old.is_verified;
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;

  if new.status = 'published'
     and (tg_op = 'INSERT' or old.status is distinct from new.status)
     and new.registration_deadline <= now() then
    raise exception using errcode = 'P0001', message = 'Registration deadline must be in the future.';
  end if;

  return new;
end;
$$;

create or replace function private.cp_guard_tournament_registration()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tournament public.tournaments%rowtype;
  v_active_count integer;
  v_actor uuid;
  v_player_name text;
begin
  v_actor := auth.uid();

  if tg_op = 'INSERT' then
    select *
    into v_tournament
    from public.tournaments t
    where t.id = new.tournament_id
    for update;

    if not found then
      raise exception using errcode = 'P0002', message = 'Tournament not found.';
    end if;

    if v_tournament.host_id = new.user_id then
      raise exception using errcode = 'P0001', message = 'Organizers cannot join their own tournament.';
    end if;

    if v_tournament.status <> 'published' then
      raise exception using errcode = 'P0001', message = 'Tournament registration is closed.';
    end if;

    if now() >= v_tournament.registration_deadline then
      raise exception using errcode = 'P0001', message = 'Tournament registration deadline has passed.';
    end if;

    select count(*)::integer
    into v_active_count
    from public.tournament_registrations r
    where r.tournament_id = new.tournament_id
      and r.status in ('registered', 'checked_in');

    if v_active_count >= v_tournament.max_participants then
      raise exception using errcode = 'P0001', message = 'Tournament is full.';
    end if;

    select coalesce(
      nullif(trim(p.full_name), ''),
      nullif(trim(p.username), ''),
      split_part(p.email, '@', 1),
      'ComePlayers Player'
    )
    into v_player_name
    from public.profiles p
    where p.id = new.user_id;

    if v_player_name is null then
      raise exception using errcode = 'P0001', message = 'Player profile is not available.';
    end if;

    new.player_name := left(v_player_name, 120);
    new.status := 'registered';
    new.joined_at := now();
    new.updated_at := now();
    return new;
  end if;

  new.tournament_id := old.tournament_id;
  new.user_id := old.user_id;
  new.player_name := old.player_name;
  new.joined_at := old.joined_at;
  new.updated_at := now();

  select *
  into v_tournament
  from public.tournaments t
  where t.id = old.tournament_id
  for update;

  if v_actor = old.user_id then
    if old.status = 'withdrawn' and new.status = 'registered' then
      if v_tournament.status <> 'published' or now() >= v_tournament.registration_deadline then
        raise exception using errcode = 'P0001', message = 'Tournament registration is closed.';
      end if;

      select count(*)::integer
      into v_active_count
      from public.tournament_registrations r
      where r.tournament_id = old.tournament_id
        and r.status in ('registered', 'checked_in')
        and r.id <> old.id;

      if v_active_count >= v_tournament.max_participants then
        raise exception using errcode = 'P0001', message = 'Tournament is full.';
      end if;
    elsif new.status = old.status then
      null;
    elsif new.status = 'withdrawn' and old.status in ('registered', 'checked_in') then
      null;
    else
      raise exception using errcode = 'P0001', message = 'Players can only update registration details or withdraw.';
    end if;
  elsif v_actor = v_tournament.host_id then
    if new.status not in ('registered', 'checked_in', 'withdrawn', 'disqualified') then
      raise exception using errcode = 'P0001', message = 'Invalid participant status.';
    end if;
  else
    raise exception using errcode = '42501', message = 'Registration update is not allowed.';
  end if;

  return new;
end;
$$;

create or replace function private.cp_sync_tournament_participant_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tournament_id uuid;
begin
  if tg_op = 'DELETE' then
    v_tournament_id := old.tournament_id;
  else
    v_tournament_id := new.tournament_id;
  end if;

  update public.tournaments t
  set participant_count = (
    select count(*)::integer
    from public.tournament_registrations r
    where r.tournament_id = v_tournament_id
      and r.status in ('registered', 'checked_in')
  )
  where t.id = v_tournament_id;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function private.cp_prepare_tournament() from public, anon, authenticated;
revoke all on function private.cp_guard_tournament_registration() from public, anon, authenticated;
revoke all on function private.cp_sync_tournament_participant_count() from public, anon, authenticated;

create trigger tournaments_prepare_before_write
before insert or update on public.tournaments
for each row execute function private.cp_prepare_tournament();

create trigger tournament_registrations_guard_before_write
before insert or update on public.tournament_registrations
for each row execute function private.cp_guard_tournament_registration();

create trigger tournament_registrations_sync_count_after_write
after insert or update or delete on public.tournament_registrations
for each row execute function private.cp_sync_tournament_participant_count();

alter table public.tournaments enable row level security;
alter table public.tournament_registrations enable row level security;

create policy tournaments_public_read
on public.tournaments
for select
to anon, authenticated
using (status in ('published', 'registration_closed', 'live', 'completed'));

create policy tournaments_host_read
on public.tournaments
for select
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = host_id);

create policy tournaments_host_insert
on public.tournaments
for insert
to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = host_id);

create policy tournaments_host_update
on public.tournaments
for update
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = host_id)
with check ((select auth.uid()) = host_id);

create policy tournaments_host_delete_draft
on public.tournaments
for delete
to authenticated
using ((select auth.uid()) = host_id and status = 'draft');

create policy tournament_registrations_owner_or_host_read
on public.tournament_registrations
for select
to authenticated
using (
  (select auth.uid()) = user_id
  or exists (
    select 1
    from public.tournaments t
    where t.id = tournament_id
      and t.host_id = (select auth.uid())
  )
);

create policy tournament_registrations_owner_insert
on public.tournament_registrations
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
  and status = 'registered'
  and exists (
    select 1
    from public.tournaments t
    where t.id = tournament_id
      and t.status = 'published'
      and t.registration_deadline > now()
  )
);

create policy tournament_registrations_owner_or_host_update
on public.tournament_registrations
for update
to authenticated
using (
  (select auth.uid()) = user_id
  or exists (
    select 1
    from public.tournaments t
    where t.id = tournament_id
      and t.host_id = (select auth.uid())
  )
)
with check (
  (select auth.uid()) = user_id
  or exists (
    select 1
    from public.tournaments t
    where t.id = tournament_id
      and t.host_id = (select auth.uid())
  )
);

revoke all on table public.tournaments from anon, authenticated;
revoke all on table public.tournament_registrations from anon, authenticated;

grant select on table public.tournaments to anon, authenticated;
grant insert (
  host_id,
  title,
  game_title,
  game_mode,
  description,
  rules,
  platform,
  region,
  tournament_format,
  skill_level,
  team_size,
  max_participants,
  entry_fee,
  prize_pool,
  currency,
  registration_deadline,
  starts_at,
  ends_at,
  status
) on table public.tournaments to authenticated;
grant update (
  title,
  game_title,
  game_mode,
  description,
  rules,
  platform,
  region,
  tournament_format,
  skill_level,
  team_size,
  max_participants,
  entry_fee,
  prize_pool,
  currency,
  registration_deadline,
  starts_at,
  ends_at,
  status
) on table public.tournaments to authenticated;
grant delete on table public.tournaments to authenticated;

grant select on table public.tournament_registrations to authenticated;
grant insert (
  tournament_id,
  user_id,
  game_username,
  team_name,
  contact_handle,
  notes,
  status
) on table public.tournament_registrations to authenticated;
grant update (
  game_username,
  team_name,
  contact_handle,
  notes,
  status
) on table public.tournament_registrations to authenticated;

grant all on table public.tournaments to service_role;
grant all on table public.tournament_registrations to service_role;

comment on table public.tournaments is 'User-hosted ComePlayers tournaments with public discovery metadata and trusted participant counts.';
comment on table public.tournament_registrations is 'Private player registrations visible only to the player and tournament organizer.';

commit;

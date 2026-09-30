-- CP numbers are public ComePlayers account identifiers, not telephone numbers.
-- Retain assignments even if a profile/account is deleted: numbers are never recycled.
create table cp_private.account_numbers (
  user_id uuid primary key,
  cp_number text not null unique check (cp_number ~ '^008[0-9]{10}$'),
  assigned_at timestamptz not null default now()
);
alter table cp_private.account_numbers enable row level security;
revoke all on cp_private.account_numbers from public, anon, authenticated, service_role;

create function cp_private.random_cp_number() returns text
language plpgsql volatile set search_path = ''
as $function$
declare
  suffix text := '';
  random_bytes bytea;
  digit integer;
  i integer;
begin
  -- Rejection sampling avoids modulo bias while preserving all leading zeroes.
  while length(suffix) < 10 loop
    random_bytes := extensions.gen_random_bytes(16);
    for i in 0..15 loop
      digit := get_byte(random_bytes, i);
      if digit < 250 then
        suffix := suffix || (digit % 10)::text;
        exit when length(suffix) = 10;
      end if;
    end loop;
  end loop;
  return '008' || suffix;
end;
$function$;
revoke all on function cp_private.random_cp_number() from public, anon, authenticated, service_role;

create function cp_private.cp_number_for_user(p_user_id uuid) returns text
language plpgsql volatile set search_path = ''
as $function$
declare
  assigned text;
  candidate text;
  attempt integer;
begin
  if p_user_id is null then raise exception 'A user ID is required'; end if;
  -- Concurrent auth/profile upserts for the same account share one assignment.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 82026));
  select cp_number into assigned from cp_private.account_numbers where user_id = p_user_id;
  if assigned is not null then return assigned; end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'CP numbers require an existing account';
  end if;
  for attempt in 1..128 loop
    candidate := cp_private.random_cp_number();
    insert into cp_private.account_numbers(user_id, cp_number)
      values (p_user_id, candidate)
      on conflict do nothing
      returning cp_number into assigned;
    if assigned is not null then return assigned; end if;
    select cp_number into assigned from cp_private.account_numbers where user_id = p_user_id;
    if assigned is not null then return assigned; end if;
  end loop;
  raise exception 'Unable to allocate a unique CP number. Retry account creation.';
end;
$function$;
revoke all on function cp_private.cp_number_for_user(uuid) from public, anon, authenticated, service_role;

create function cp_private.guard_cp_assignment() returns trigger
language plpgsql set search_path = ''
as $function$
begin
  raise exception 'CP number assignments are permanent' using errcode = '23514';
end;
$function$;
revoke all on function cp_private.guard_cp_assignment() from public, anon, authenticated, service_role;
create trigger immutable_cp_assignment before update or delete on cp_private.account_numbers
for each row execute function cp_private.guard_cp_assignment();

alter table public.profiles add column cp_number text;
create function cp_private.assign_profile_cp_number() returns trigger
language plpgsql security definer set search_path = ''
as $function$
declare assigned text;
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id then
      raise exception 'Account identity cannot be changed' using errcode = '23514';
    end if;
    if old.cp_number is not null then
      if new.cp_number is distinct from old.cp_number then
        raise exception 'CP number is permanent and cannot be changed' using errcode = '23514';
      end if;
      return new;
    end if;
  end if;
  assigned := cp_private.cp_number_for_user(new.id);
  if new.cp_number is not null and new.cp_number is distinct from assigned then
    raise exception 'CP number is assigned automatically' using errcode = '23514';
  end if;
  new.cp_number := assigned;
  return new;
end;
$function$;
revoke all on function cp_private.assign_profile_cp_number() from public, anon, authenticated, service_role;
create trigger cp_number_identity before insert or update on public.profiles
for each row execute function cp_private.assign_profile_cp_number();

create function cp_private.assign_auth_cp_number() returns trigger
language plpgsql security definer set search_path = ''
as $function$
begin
  perform cp_private.cp_number_for_user(new.id);
  return new;
end;
$function$;
revoke all on function cp_private.assign_auth_cp_number() from public, anon, authenticated, service_role;
create trigger cp_auth_number after insert on auth.users
for each row execute function cp_private.assign_auth_cp_number();

-- Existing and new accounts use the exact same allocator.
do $backfill$
declare account record;
begin
  for account in select id from auth.users order by id loop
    perform cp_private.cp_number_for_user(account.id);
  end loop;
end;
$backfill$;
update public.profiles set cp_number = cp_private.cp_number_for_user(id) where cp_number is null;
alter table public.profiles
  alter column cp_number set not null,
  add constraint profiles_cp_number_format check (cp_number ~ '^008[0-9]{10}$'),
  add constraint profiles_cp_number_key unique (cp_number);
comment on column public.profiles.cp_number is 'Permanent public ComePlayers number: 008 and ten random decimal digits. Not an E.164 telephone number.';
comment on table cp_private.account_numbers is 'Permanent CP number reservations; no phone/email or account deletion cascade. Never exposed to clients.';


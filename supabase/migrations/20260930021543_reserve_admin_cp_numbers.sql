-- Ten repeated-digit CP numbers are held for admin accounts designated later.
-- Never auto-assign them and never change an existing account's permanent identity.
create table cp_private.reserved_cp_numbers (
  cp_number text primary key check (cp_number ~ '^008[0-9]{10}$'),
  reserved_for text not null default 'admin' check (reserved_for = 'admin'),
  reserved_at timestamptz not null default now()
);
alter table cp_private.reserved_cp_numbers enable row level security;
revoke all on cp_private.reserved_cp_numbers from public, anon, authenticated, service_role;
insert into cp_private.reserved_cp_numbers(cp_number)
select '008' || repeat(digit::text, 10) from generate_series(0, 9) as digit;

do $check$
begin
  if exists (
    select 1 from cp_private.account_numbers as assigned
    join cp_private.reserved_cp_numbers as reserved using (cp_number)
  ) then
    raise exception 'An admin-reserved CP number is already assigned; do not reassign permanent identities.';
  end if;
end;
$check$;
create trigger immutable_admin_cp_reservation
before update or delete on cp_private.reserved_cp_numbers
for each row execute function cp_private.guard_cp_assignment();

create or replace function cp_private.cp_number_for_user(p_user_id uuid) returns text
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
    if exists (select 1 from cp_private.reserved_cp_numbers where cp_number = candidate) then
      continue;
    end if;
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


comment on table cp_private.reserved_cp_numbers is 'CP numbers reserved for future admin designation. Excluded from automatic allocation; no accounts assigned by this migration.';

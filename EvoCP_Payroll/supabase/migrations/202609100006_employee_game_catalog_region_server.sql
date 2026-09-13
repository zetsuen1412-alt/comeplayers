-- CP-OFS v0.11.0
-- Employee creation + controlled Product/Game catalog + Region/Server selection.

insert into public.permissions(code, description, category) values
('employees.manage','Create and maintain employees','employees'),
('catalog.view','View Product/Game catalog','catalog'),
('catalog.manage','Create and maintain Product/Game catalog','catalog')
on conflict (code) do nothing;

-- Existing global Owner role receives newly introduced permissions as well.
insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code in ('employees.manage','catalog.view','catalog.manage')
where r.code = 'owner' and r.organization_id is null
on conflict do nothing;

create table if not exists public.employee_code_sequences (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  last_value bigint not null default 0 check (last_value >= 0),
  updated_at timestamptz not null default now()
);

alter table public.employee_code_sequences enable row level security;
-- No browser write policy. Employee codes are issued through the controlled RPC below.

create or replace function public.cp_ofs_next_employee_code(p_organization_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next bigint;
  v_existing_max bigint;
begin
  select coalesce(max((regexp_match(employee_code, '^EMP-([0-9]+)$'))[1]::bigint), 0)
  into v_existing_max
  from public.employees
  where organization_id = p_organization_id;

  insert into public.employee_code_sequences (organization_id, last_value, updated_at)
  values (p_organization_id, v_existing_max + 1, now())
  on conflict (organization_id)
  do update set
    last_value = greatest(public.employee_code_sequences.last_value, v_existing_max) + 1,
    updated_at = now()
  returning last_value into v_next;

  return 'EMP-' || lpad(v_next::text, 4, '0');
end;
$$;

create or replace function public.cp_ofs_create_employee(
  p_organization_id uuid,
  p_display_name text,
  p_team_code text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee_id uuid;
  v_team_id uuid;
  v_employee_code text;
begin
  if not public.cp_ofs_has_permission(p_organization_id, 'employees.manage') then
    raise exception 'FORBIDDEN';
  end if;

  if nullif(btrim(p_display_name), '') is null then
    raise exception 'INVALID_EMPLOYEE_NAME';
  end if;

  select id into v_team_id
  from public.teams
  where organization_id = p_organization_id
    and team_code = upper(btrim(p_team_code))
    and status = 'active';

  if v_team_id is null then
    raise exception 'TEAM_NOT_FOUND';
  end if;

  if exists (
    select 1 from public.employees
    where organization_id = p_organization_id
      and lower(display_name) = lower(btrim(p_display_name))
      and archived_at is null
  ) then
    raise exception 'EMPLOYEE_NAME_ALREADY_EXISTS';
  end if;

  v_employee_code := public.cp_ofs_next_employee_code(p_organization_id);

  insert into public.employees(
    organization_id, employee_code, display_name, employment_type,
    status, joined_at, created_by
  ) values (
    p_organization_id, v_employee_code, btrim(p_display_name), 'production_share',
    'active', current_date, auth.uid()
  ) returning id into v_employee_id;

  insert into public.employee_team_history(
    organization_id, employee_id, team_id, valid_from, created_by
  ) values (
    p_organization_id, v_employee_id, v_team_id, current_date, auth.uid()
  );

  insert into public.audit_logs(
    organization_id, actor_user_id, actor_type, action, entity_type, entity_id, after_data
  ) values (
    p_organization_id, auth.uid(), 'user', 'employees.create', 'employee', v_employee_id::text,
    jsonb_build_object('employee_code', v_employee_code, 'display_name', btrim(p_display_name), 'team_code', upper(btrim(p_team_code)))
  );

  return v_employee_id;
end;
$$;

alter table public.games
  add column if not exists search_aliases text[] not null default '{}'::text[];

create unique index if not exists uq_games_org_code
  on public.games(organization_id, upper(code))
  where organization_id is not null;

create table if not exists public.game_regions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  code text not null,
  name text not null,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (game_id, code)
);

create table if not exists public.game_servers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  region_id uuid not null references public.game_regions(id) on delete cascade,
  code text not null,
  name text not null,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (region_id, code)
);

alter table public.games enable row level security;
alter table public.game_regions enable row level security;
alter table public.game_servers enable row level security;

drop policy if exists games_catalog_select on public.games;
create policy games_catalog_select on public.games for select using (
  organization_id is null
  or public.cp_ofs_has_permission(organization_id,'catalog.view')
  or public.cp_ofs_has_permission(organization_id,'orders.view')
);

drop policy if exists game_regions_catalog_select on public.game_regions;
create policy game_regions_catalog_select on public.game_regions for select using (
  public.cp_ofs_has_permission(organization_id,'catalog.view')
  or public.cp_ofs_has_permission(organization_id,'orders.view')
);

drop policy if exists game_servers_catalog_select on public.game_servers;
create policy game_servers_catalog_select on public.game_servers for select using (
  public.cp_ofs_has_permission(organization_id,'catalog.view')
  or public.cp_ofs_has_permission(organization_id,'orders.view')
);

create or replace function public.cp_ofs_create_game_catalog(
  p_organization_id uuid,
  p_code text,
  p_name text,
  p_aliases text[],
  p_regions jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game_id uuid;
  v_region jsonb;
  v_server jsonb;
  v_region_id uuid;
  v_region_code text;
  v_region_name text;
  v_server_code text;
  v_server_name text;
begin
  if not public.cp_ofs_has_permission(p_organization_id, 'catalog.manage') then
    raise exception 'FORBIDDEN';
  end if;

  if nullif(btrim(p_code), '') is null or nullif(btrim(p_name), '') is null then
    raise exception 'INVALID_GAME';
  end if;

  if jsonb_typeof(p_regions) <> 'array' or jsonb_array_length(p_regions) < 1 then
    raise exception 'GAME_REGION_REQUIRED';
  end if;

  insert into public.games(organization_id, code, name, status, search_aliases)
  values (p_organization_id, upper(btrim(p_code)), btrim(p_name), 'active', coalesce(p_aliases, '{}'::text[]))
  returning id into v_game_id;

  for v_region in select value from jsonb_array_elements(p_regions)
  loop
    v_region_code := upper(btrim(coalesce(v_region->>'code', v_region->>'name')));
    v_region_name := btrim(coalesce(v_region->>'name', v_region_code));
    if nullif(v_region_code, '') is null then
      raise exception 'INVALID_REGION';
    end if;

    insert into public.game_regions(organization_id, game_id, code, name)
    values (p_organization_id, v_game_id, v_region_code, v_region_name)
    returning id into v_region_id;

    if jsonb_typeof(v_region->'servers') <> 'array' or jsonb_array_length(v_region->'servers') < 1 then
      raise exception 'GAME_SERVER_REQUIRED';
    end if;

    for v_server in select value from jsonb_array_elements(v_region->'servers')
    loop
      if jsonb_typeof(v_server) = 'string' then
        v_server_name := trim(both '"' from v_server::text);
        v_server_code := upper(btrim(v_server_name));
      else
        v_server_code := upper(btrim(coalesce(v_server->>'code', v_server->>'name')));
        v_server_name := btrim(coalesce(v_server->>'name', v_server_code));
      end if;

      if nullif(v_server_code, '') is null then
        raise exception 'INVALID_SERVER';
      end if;

      insert into public.game_servers(organization_id, game_id, region_id, code, name)
      values (p_organization_id, v_game_id, v_region_id, v_server_code, v_server_name);
    end loop;
  end loop;

  insert into public.audit_logs(
    organization_id, actor_user_id, actor_type, action, entity_type, entity_id, after_data
  ) values (
    p_organization_id, auth.uid(), 'user', 'catalog.game.create', 'game', v_game_id::text,
    jsonb_build_object('code', upper(btrim(p_code)), 'name', btrim(p_name))
  );

  return v_game_id;
end;
$$;

alter table public.order_items
  add column if not exists game_region_id uuid references public.game_regions(id),
  add column if not exists game_server_id uuid references public.game_servers(id);

create or replace function public.cp_ofs_validate_order_item_game_location()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_region_game uuid;
  v_server_game uuid;
  v_server_region uuid;
begin
  if new.game_region_id is null and new.game_server_id is null then
    return new; -- legacy rows may not have Region/Server; new business action should require them.
  end if;

  if new.game_id is null or new.game_region_id is null or new.game_server_id is null then
    raise exception 'GAME_REGION_SERVER_REQUIRED';
  end if;

  select game_id into v_region_game from public.game_regions where id = new.game_region_id and status = 'active';
  select game_id, region_id into v_server_game, v_server_region from public.game_servers where id = new.game_server_id and status = 'active';

  if v_region_game is null or v_server_game is null then
    raise exception 'GAME_REGION_SERVER_NOT_FOUND';
  end if;

  if v_region_game <> new.game_id or v_server_game <> new.game_id or v_server_region <> new.game_region_id then
    raise exception 'GAME_REGION_SERVER_MISMATCH';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_cp_ofs_validate_order_item_game_location on public.order_items;
create trigger trg_cp_ofs_validate_order_item_game_location
before insert or update of game_id, game_region_id, game_server_id
on public.order_items
for each row execute function public.cp_ofs_validate_order_item_game_location();

comment on function public.cp_ofs_create_employee(uuid,text,text) is
'Creates a canonical employee and current FH/team history in one audited operation.';
comment on table public.game_regions is
'Allowed Region values for one configured Product/Game. Order entry must choose from this catalog.';
comment on table public.game_servers is
'Allowed Server values scoped to a configured Region and Game. Free-text order server values are not authoritative.';

-- Inventory Gold/Item is also scoped to the same Game + Region + Server.
alter table public.inventory_items
  add column if not exists game_region_id uuid references public.game_regions(id),
  add column if not exists game_server_id uuid references public.game_servers(id);

create or replace function public.cp_ofs_validate_inventory_item_game_location()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_region_game uuid;
  v_server_game uuid;
  v_server_region uuid;
begin
  if new.game_id is null then
    return new;
  end if;

  if new.game_region_id is null or new.game_server_id is null then
    raise exception 'INVENTORY_GAME_REGION_SERVER_REQUIRED';
  end if;

  select game_id into v_region_game
  from public.game_regions
  where id = new.game_region_id and status = 'active';

  select game_id, region_id into v_server_game, v_server_region
  from public.game_servers
  where id = new.game_server_id and status = 'active';

  if v_region_game is null or v_server_game is null then
    raise exception 'INVENTORY_GAME_REGION_SERVER_NOT_FOUND';
  end if;

  if v_region_game <> new.game_id
     or v_server_game <> new.game_id
     or v_server_region <> new.game_region_id then
    raise exception 'INVENTORY_GAME_REGION_SERVER_MISMATCH';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_cp_ofs_validate_inventory_item_game_location on public.inventory_items;
create trigger trg_cp_ofs_validate_inventory_item_game_location
before insert or update of game_id, game_region_id, game_server_id
on public.inventory_items
for each row execute function public.cp_ofs_validate_inventory_item_game_location();

create or replace view public.v_employee_current_team
with (security_invoker = true)
as
select
  e.id as employee_id,
  e.organization_id,
  e.employee_code,
  e.display_name,
  t.id as team_id,
  t.team_code,
  t.name as team_name,
  e.status,
  e.joined_at
from public.employees e
left join lateral (
  select eth.team_id
  from public.employee_team_history eth
  where eth.employee_id = e.id
    and eth.valid_from <= current_date
    and (eth.valid_until is null or eth.valid_until >= current_date)
  order by eth.valid_from desc, eth.created_at desc
  limit 1
) current_team on true
left join public.teams t on t.id = current_team.team_id;

comment on view public.v_employee_current_team is
'Convenient RLS-invoker view for employee + current FH/team. Employee names remain display values, not financial keys.';

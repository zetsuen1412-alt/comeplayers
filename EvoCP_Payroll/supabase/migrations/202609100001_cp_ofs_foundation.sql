create extension if not exists pgcrypto;
create extension if not exists btree_gist;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  default_currency varchar(3) not null default 'IDR',
  timezone text not null default 'Asia/Jakarta',
  status text not null default 'active' check (status in ('active','suspended','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active','invited','suspended','left')),
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  is_system_role boolean not null default false,
  created_at timestamptz not null default now(),
  unique nulls not distinct (organization_id, code)
);

create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text,
  category text,
  created_at timestamptz not null default now()
);

create table if not exists public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table if not exists public.member_roles (
  organization_member_id uuid not null references public.organization_members(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  assigned_by uuid references auth.users(id),
  assigned_at timestamptz not null default now(),
  primary key (organization_member_id, role_id)
);

create or replace function public.cp_ofs_has_permission(p_organization_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from organization_members om
    join member_roles mr on mr.organization_member_id = om.id
    join role_permissions rp on rp.role_id = mr.role_id
    join permissions p on p.id = rp.permission_id
    where om.organization_id = p_organization_id
      and om.user_id = auth.uid()
      and om.status = 'active'
      and p.code = p_permission
  );
$$;

create or replace function public.cp_ofs_is_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from organization_members
    where organization_id = p_organization_id
      and user_id = auth.uid()
      and status = 'active'
  );
$$;

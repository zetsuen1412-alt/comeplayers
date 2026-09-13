-- v0.14.3 - organization-wide edit lock before manual Closing.
-- Production business actions should call cp_ofs_org_is_edit_locked() and reject writes
-- while a lock is active, except explicit unlock/closing actions.

create table if not exists public.organization_edit_locks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  period_start_at timestamptz not null,
  period_end_at timestamptz not null,
  locked_by uuid references auth.users(id),
  locked_at timestamptz not null default now(),
  unlocked_by uuid references auth.users(id),
  unlocked_at timestamptz,
  reason text not null default 'manual_closing',
  created_at timestamptz not null default now(),
  check (period_end_at >= period_start_at),
  check ((unlocked_at is null and unlocked_by is null) or unlocked_at is not null)
);

create unique index if not exists uq_organization_edit_locks_active
  on public.organization_edit_locks(organization_id)
  where unlocked_at is null;

create index if not exists idx_organization_edit_locks_org_time
  on public.organization_edit_locks(organization_id, locked_at desc);

create or replace function public.cp_ofs_org_is_edit_locked(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_edit_locks l
    where l.organization_id = p_organization_id
      and l.unlocked_at is null
  );
$$;

alter table public.organization_edit_locks enable row level security;

drop policy if exists organization_edit_locks_select on public.organization_edit_locks;
create policy organization_edit_locks_select on public.organization_edit_locks
for select using (
  public.cp_ofs_has_permission(organization_id, 'closing.view')
  or public.cp_ofs_is_member(organization_id)
);

drop policy if exists organization_edit_locks_insert on public.organization_edit_locks;
create policy organization_edit_locks_insert on public.organization_edit_locks
for insert with check (
  public.cp_ofs_has_permission(organization_id, 'closing.prepare')
);

drop policy if exists organization_edit_locks_update on public.organization_edit_locks;
create policy organization_edit_locks_update on public.organization_edit_locks
for update using (
  public.cp_ofs_has_permission(organization_id, 'closing.prepare')
) with check (
  public.cp_ofs_has_permission(organization_id, 'closing.prepare')
);

alter table public.closing_periods
  add column if not exists start_at timestamptz,
  add column if not exists end_at timestamptz,
  add column if not exists edit_lock_id uuid references public.organization_edit_locks(id);

comment on table public.organization_edit_locks is
'Organization-wide mutation lock used before manual Closing. All production write actions must reject mutations while an active lock exists, except authorized unlock/closing actions.';
comment on function public.cp_ofs_org_is_edit_locked(uuid) is
'Returns true when the organization is globally edit-locked for Closing.';

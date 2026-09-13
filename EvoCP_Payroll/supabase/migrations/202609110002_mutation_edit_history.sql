-- v0.14.2 - append-only history for mutation edits.
-- Production intent: completed orders may still be corrected, but every correction is auditable.

create table if not exists public.mutation_edit_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete restrict,
  order_reference text not null,
  edited_by uuid references auth.users(id),
  edited_at timestamptz not null default now(),
  reason text,
  was_completed boolean not null default false,
  was_payroll_closed boolean not null default false,
  changes jsonb not null default '[]'::jsonb,
  check (jsonb_typeof(changes) = 'array')
);

create index if not exists idx_mutation_edit_history_org_time
  on public.mutation_edit_history(organization_id, edited_at desc);
create index if not exists idx_mutation_edit_history_order
  on public.mutation_edit_history(order_id, edited_at desc);

alter table public.mutation_edit_history enable row level security;

drop policy if exists mutation_edit_history_select on public.mutation_edit_history;
create policy mutation_edit_history_select on public.mutation_edit_history
for select using (
  public.cp_ofs_has_permission(organization_id,'audit.view')
  or public.cp_ofs_has_permission(organization_id,'orders.view')
);

drop policy if exists mutation_edit_history_insert on public.mutation_edit_history;
create policy mutation_edit_history_insert on public.mutation_edit_history
for insert with check (
  public.cp_ofs_has_permission(organization_id,'orders.verify')
  or public.cp_ofs_has_permission(organization_id,'orders.create')
);

-- No UPDATE/DELETE policy by design: history is append-only.

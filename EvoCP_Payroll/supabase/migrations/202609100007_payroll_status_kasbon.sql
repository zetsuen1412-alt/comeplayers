-- CP-OFS v0.12.0
-- Employee work status + global payroll percentage + employee payroll adjustments + kasbon.

alter table public.employees
  add column if not exists work_status text not null default 'NEW';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'employees_work_status_check') then
    alter table public.employees
      add constraint employees_work_status_check
      check (work_status in ('NEW','SHIFT','FULL','SAKIT','IJIN','RESIGN'));
  end if;
end $$;

create table if not exists public.payroll_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  global_share_basis_points integer not null default 5000 check (global_share_basis_points between 0 and 10000),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.employee_payroll_period_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  payroll_period_id uuid not null references public.payroll_periods(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  operational_minor bigint not null default 0 check (operational_minor in (0,25000,50000)),
  penalty_minor bigint not null default 0 check (penalty_minor >= 0),
  bonus_tips_minor bigint not null default 0 check (bonus_tips_minor >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (payroll_period_id, employee_id)
);

create table if not exists public.employee_advances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.employees(id),
  amount_minor bigint not null check (amount_minor > 0),
  remaining_minor bigint not null check (remaining_minor >= 0 and remaining_minor <= amount_minor),
  currency_code varchar(3) not null default 'IDR',
  business_date date not null,
  note text,
  status text not null default 'active' check (status in ('active','paid','cancelled')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_employee_advances_employee_status
  on public.employee_advances(organization_id, employee_id, status);

create or replace view public.v_employee_advance_balance as
select
  organization_id,
  employee_id,
  sum(remaining_minor) filter (where status = 'active') as outstanding_minor
from public.employee_advances
group by organization_id, employee_id;

insert into public.permissions(code, description, category) values
('advances.view','View employee kasbon','payroll'),
('advances.manage','Create and settle employee kasbon','payroll')
on conflict (code) do nothing;

insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code in ('advances.view','advances.manage')
where r.code = 'owner' and r.organization_id is null
on conflict do nothing;

alter table public.payroll_settings enable row level security;
alter table public.employee_payroll_period_settings enable row level security;
alter table public.employee_advances enable row level security;

create policy payroll_settings_select on public.payroll_settings
for select using (public.cp_ofs_has_permission(organization_id,'payroll.view_all'));

create policy employee_payroll_period_settings_select on public.employee_payroll_period_settings
for select using (
  public.cp_ofs_has_permission(organization_id,'payroll.view_all')
  or exists (
    select 1 from public.employees e
    where e.id = employee_id and e.profile_user_id = auth.uid()
  )
);

create policy employee_advances_select on public.employee_advances
for select using (
  public.cp_ofs_has_permission(organization_id,'advances.view')
  or exists (
    select 1 from public.employees e
    where e.id = employee_id and e.profile_user_id = auth.uid()
  )
);

comment on column public.employees.work_status is
'Business-visible employee status: NEW, SHIFT, FULL, SAKIT, IJIN, RESIGN.';
comment on table public.payroll_settings is
'Organization-level payroll configuration. global_share_basis_points replaces per-order worker percentage for new payroll calculations.';
comment on table public.employee_advances is
'Kasbon/employee advance balance. Repayment through payroll should reduce remaining_minor using an audited payroll business action.';

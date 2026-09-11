begin;

create table if not exists public.cp_payroll_employees (
  id bigint generated always as identity primary key,
  employee_code text not null check (employee_code ~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'),
  full_name text not null check (char_length(btrim(full_name)) between 2 and 120),
  team text check (team is null or char_length(team) <= 80),
  employment_status text not null default 'active'
    check (employment_status in ('active', 'inactive')),
  default_share_basis_points integer not null default 5000
    check (default_share_basis_points between 0 and 10000),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists cp_payroll_employees_code_uidx
  on public.cp_payroll_employees (lower(employee_code));
create index if not exists cp_payroll_employees_status_idx
  on public.cp_payroll_employees (employment_status, employee_code);

create table if not exists public.cp_payroll_periods (
  id bigint generated always as identity primary key,
  period_code text not null check (char_length(btrim(period_code)) between 2 and 40),
  start_date date not null,
  end_date date not null,
  currency_code varchar(3) not null default 'IDR'
    check (currency_code ~ '^[A-Z]{3}$'),
  status text not null default 'draft'
    check (status in ('draft', 'calculated', 'finalized', 'paid')),
  total_work_value_minor bigint not null default 0 check (total_work_value_minor >= 0),
  gross_compensation_minor bigint not null default 0 check (gross_compensation_minor >= 0),
  deductions_minor bigint not null default 0 check (deductions_minor >= 0),
  net_pay_minor bigint not null default 0 check (net_pay_minor >= 0),
  calculation_hash text,
  calculated_at timestamptz,
  calculated_by uuid references auth.users(id) on delete set null,
  finalized_at timestamptz,
  finalized_by uuid references auth.users(id) on delete set null,
  paid_at timestamptz,
  paid_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  check (end_date >= start_date)
);

create unique index if not exists cp_payroll_periods_code_uidx
  on public.cp_payroll_periods (lower(period_code));
create index if not exists cp_payroll_periods_dates_idx
  on public.cp_payroll_periods (start_date desc, end_date desc);
create index if not exists cp_payroll_periods_status_idx
  on public.cp_payroll_periods (status, start_date desc);

create table if not exists public.cp_payroll_entries (
  id bigint generated always as identity primary key,
  payroll_period_id bigint not null
    references public.cp_payroll_periods(id) on delete cascade,
  employee_id bigint not null
    references public.cp_payroll_employees(id) on delete restrict,
  employee_code_snapshot text not null,
  employee_name_snapshot text not null,
  team_snapshot text,
  work_value_minor bigint not null default 0 check (work_value_minor >= 0),
  share_basis_points integer not null default 5000
    check (share_basis_points between 0 and 10000),
  bonus_tips_minor bigint not null default 0 check (bonus_tips_minor >= 0),
  operational_deduction_minor bigint not null default 0
    check (operational_deduction_minor >= 0),
  penalty_minor bigint not null default 0 check (penalty_minor >= 0),
  advance_repayment_minor bigint not null default 0
    check (advance_repayment_minor >= 0),
  base_earnings_minor bigint generated always as (
    round((work_value_minor::numeric * share_basis_points::numeric) / 10000)::bigint
  ) stored,
  gross_compensation_minor bigint generated always as (
    round((work_value_minor::numeric * share_basis_points::numeric) / 10000)::bigint
      + bonus_tips_minor
  ) stored,
  deductions_minor bigint generated always as (
    operational_deduction_minor + penalty_minor + advance_repayment_minor
  ) stored,
  net_pay_minor bigint generated always as (
    round((work_value_minor::numeric * share_basis_points::numeric) / 10000)::bigint
      + bonus_tips_minor
      - operational_deduction_minor
      - penalty_minor
      - advance_repayment_minor
  ) stored,
  note text check (note is null or char_length(note) <= 1000),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  unique (payroll_period_id, employee_id),
  check (
    round((work_value_minor::numeric * share_basis_points::numeric) / 10000)::bigint
      + bonus_tips_minor
      >= operational_deduction_minor + penalty_minor + advance_repayment_minor
  )
);

create index if not exists cp_payroll_entries_period_idx
  on public.cp_payroll_entries (payroll_period_id, employee_code_snapshot);
create index if not exists cp_payroll_entries_employee_idx
  on public.cp_payroll_entries (employee_id, payroll_period_id desc);

create or replace function public.cp_guard_payroll_entry_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  period_status text;
begin
  select status into period_status
  from public.cp_payroll_periods
  where id = case when tg_op = 'DELETE' then old.payroll_period_id else new.payroll_period_id end;

  if period_status is distinct from 'draft' then
    raise exception 'PAYROLL_PERIOD_LOCKED' using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists cp_payroll_entries_guard on public.cp_payroll_entries;
create trigger cp_payroll_entries_guard
before insert or update or delete on public.cp_payroll_entries
for each row execute function public.cp_guard_payroll_entry_mutation();

create or replace function public.cp_guard_payroll_period_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'PAYROLL_PERIOD_LOCKED' using errcode = '23514';
    end if;
    return old;
  end if;

  if old.status = 'paid' then
    raise exception 'PAID_PAYROLL_IMMUTABLE' using errcode = '23514';
  end if;

  if old.status = 'finalized' and (
    new.status <> 'paid'
    or new.period_code is distinct from old.period_code
    or new.start_date is distinct from old.start_date
    or new.end_date is distinct from old.end_date
    or new.currency_code is distinct from old.currency_code
    or new.total_work_value_minor is distinct from old.total_work_value_minor
    or new.gross_compensation_minor is distinct from old.gross_compensation_minor
    or new.deductions_minor is distinct from old.deductions_minor
    or new.net_pay_minor is distinct from old.net_pay_minor
    or new.calculation_hash is distinct from old.calculation_hash
  ) then
    raise exception 'FINALIZED_PAYROLL_IMMUTABLE' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists cp_payroll_periods_guard on public.cp_payroll_periods;
create trigger cp_payroll_periods_guard
before update or delete on public.cp_payroll_periods
for each row execute function public.cp_guard_payroll_period_mutation();

alter table public.cp_payroll_employees enable row level security;
alter table public.cp_payroll_periods enable row level security;
alter table public.cp_payroll_entries enable row level security;

revoke all on table public.cp_payroll_employees from anon, authenticated;
revoke all on table public.cp_payroll_periods from anon, authenticated;
revoke all on table public.cp_payroll_entries from anon, authenticated;
grant select, insert, update, delete on table public.cp_payroll_employees to service_role;
grant select, insert, update, delete on table public.cp_payroll_periods to service_role;
grant select, insert, update, delete on table public.cp_payroll_entries to service_role;
grant usage, select on sequence public.cp_payroll_employees_id_seq to service_role;
grant usage, select on sequence public.cp_payroll_periods_id_seq to service_role;
grant usage, select on sequence public.cp_payroll_entries_id_seq to service_role;

revoke all on function public.cp_guard_payroll_entry_mutation() from public, anon, authenticated;
revoke all on function public.cp_guard_payroll_period_mutation() from public, anon, authenticated;
grant execute on function public.cp_guard_payroll_entry_mutation() to service_role;
grant execute on function public.cp_guard_payroll_period_mutation() to service_role;

comment on table public.cp_payroll_employees is
  'Admin-managed ComePlayers payroll workers. No demo rows are seeded.';
comment on table public.cp_payroll_periods is
  'Versioned payroll periods with immutable finalized and paid snapshots.';
comment on table public.cp_payroll_entries is
  'Per-employee payroll inputs and database-generated totals in integer currency units.';

commit;

notify pgrst, 'reload schema';

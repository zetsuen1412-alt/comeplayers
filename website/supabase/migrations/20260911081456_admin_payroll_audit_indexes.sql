begin;

create index if not exists cp_payroll_employees_created_by_idx
  on public.cp_payroll_employees (created_by)
  where created_by is not null;
create index if not exists cp_payroll_employees_updated_by_idx
  on public.cp_payroll_employees (updated_by)
  where updated_by is not null;

create index if not exists cp_payroll_periods_created_by_idx
  on public.cp_payroll_periods (created_by)
  where created_by is not null;
create index if not exists cp_payroll_periods_calculated_by_idx
  on public.cp_payroll_periods (calculated_by)
  where calculated_by is not null;
create index if not exists cp_payroll_periods_finalized_by_idx
  on public.cp_payroll_periods (finalized_by)
  where finalized_by is not null;
create index if not exists cp_payroll_periods_paid_by_idx
  on public.cp_payroll_periods (paid_by)
  where paid_by is not null;

create index if not exists cp_payroll_entries_created_by_idx
  on public.cp_payroll_entries (created_by)
  where created_by is not null;
create index if not exists cp_payroll_entries_updated_by_idx
  on public.cp_payroll_entries (updated_by)
  where updated_by is not null;

commit;

-- CP-OFS v0.14.0
-- Unified mutation/source reporting, per-employee payroll share, and manual payroll closing markers.

-- A worker can have a default payroll share that is changed independently from an order.
alter table public.employees
  add column if not exists payroll_share_basis_points integer not null default 5000;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'employees_payroll_share_basis_points_check') then
    alter table public.employees
      add constraint employees_payroll_share_basis_points_check
      check (payroll_share_basis_points between 0 and 10000);
  end if;
end $$;

-- Snapshot the employee percentage used for a specific payroll period so history does not change
-- if the employee's default percentage changes later.
alter table public.employee_payroll_period_settings
  add column if not exists share_basis_points integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'employee_payroll_period_settings_share_check') then
    alter table public.employee_payroll_period_settings
      add constraint employee_payroll_period_settings_share_check
      check (share_basis_points is null or share_basis_points between 0 and 10000);
  end if;
end $$;

-- Manual Closing links an order to the payroll period in which it was actually included.
alter table public.orders
  add column if not exists payroll_closed_at timestamptz,
  add column if not exists payroll_period_id uuid references public.payroll_periods(id);

create index if not exists idx_orders_org_source_ordered_at
  on public.orders(organization_id, source, ordered_at desc);

create index if not exists idx_orders_payroll_pending
  on public.orders(organization_id, operational_status, payroll_closed_at, completed_at)
  where operational_status = 'verified';

comment on column public.employees.payroll_share_basis_points is
'Default payroll share for this employee. Snapshot it into the payroll period before payment/closing.';
comment on column public.employee_payroll_period_settings.share_basis_points is
'Payroll share snapshot for one employee in one payroll period.';
comment on column public.orders.payroll_closed_at is
'Timestamp when this order was included in a manual payroll Closing. Non-null orders must not be included in a later payroll.';
comment on column public.orders.payroll_period_id is
'Payroll period that consumed this completed order.';

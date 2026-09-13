-- Canonical employees / FH
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  team_code text not null, name text not null, status text not null default 'active', created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id, team_code)
);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_code text not null, display_name text not null, employment_type text not null default 'production_share', status text not null default 'active',
  profile_user_id uuid references auth.users(id), joined_at date, left_at date, created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version integer not null default 1, archived_at timestamptz,
  unique (organization_id, employee_code)
);

create table if not exists public.employee_aliases (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade, alias text not null, normalized_alias text not null, source text, created_at timestamptz not null default now()
);
create index if not exists idx_employee_aliases_org_normalized on public.employee_aliases(organization_id, normalized_alias);

create table if not exists public.employee_team_history (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade, team_id uuid not null references public.teams(id), valid_from date not null, valid_until date,
  created_by uuid references auth.users(id), created_at timestamptz not null default now(), check (valid_until is null or valid_until >= valid_from)
);

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(), organization_id uuid references public.organizations(id) on delete cascade, code text not null, name text not null, status text not null default 'active', metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, game_id uuid references public.games(id), service_code text not null, name text not null,
  unit_code text not null default 'unit', fulfillment_mode text not null default 'direct_service' check (fulfillment_mode in ('direct_service','inventory','vendor_direct','hybrid')),
  status text not null default 'active', created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (organization_id, service_code)
);

-- Orders
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  order_number text not null, source text not null, external_reference text, currency_code varchar(3) not null default 'IDR', gross_amount_minor bigint not null default 0 check (gross_amount_minor >= 0),
  operational_status text not null default 'draft' check (operational_status in ('draft','confirmed','assignment_pending','assigned','in_progress','partially_completed','completed','verified','on_hold','cancelled')),
  finance_status text not null default 'pending' check (finance_status in ('pending','under_review','verified','reconciled','ready_to_close','closed')),
  ordered_at timestamptz not null default now(), business_date date not null, due_at timestamptz, completed_at timestamptz, notes text,
  created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version integer not null default 1, archived_at timestamptz,
  unique (organization_id, order_number)
);
create unique index if not exists uq_orders_external_reference on public.orders(organization_id, source, external_reference) where external_reference is not null;
create index if not exists idx_orders_org_business_date on public.orders(organization_id, business_date);
create index if not exists idx_orders_org_external_reference on public.orders(organization_id, external_reference);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, order_id uuid not null references public.orders(id) on delete cascade,
  game_id uuid references public.games(id), service_id uuid references public.services(id), description text, quantity numeric(30,8) not null check (quantity > 0), unit_code text not null,
  pricing_method text not null default 'unit_rate' check (pricing_method in ('unit_rate','fixed_price','tiered','manual_approved')), unit_price_minor bigint not null default 0 check (unit_price_minor >= 0), total_amount_minor bigint not null check (total_amount_minor >= 0), currency_code varchar(3) not null,
  fulfillment_status text not null default 'unfulfilled' check (fulfillment_status in ('unfulfilled','partially_fulfilled','fulfilled','cancelled')), metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version integer not null default 1
);

create table if not exists public.compensation_policies (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, policy_code text not null, name text not null, status text not null default 'active', created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (organization_id, policy_code)
);
create table if not exists public.compensation_policy_versions (
  id uuid primary key default gen_random_uuid(), policy_id uuid not null references public.compensation_policies(id) on delete cascade, version_number integer not null, base_share_basis_points integer not null check (base_share_basis_points between 0 and 10000), valid_from date not null, valid_until date, rules jsonb not null default '{}'::jsonb, created_by uuid references auth.users(id), created_at timestamptz not null default now(), unique (policy_id, version_number)
);

create table if not exists public.order_allocations (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, order_item_id uuid not null references public.order_items(id) on delete cascade,
  employee_id uuid not null references public.employees(id), team_id_snapshot uuid references public.teams(id), assigned_quantity numeric(30,8) not null check (assigned_quantity > 0), pricing_method_snapshot text not null,
  gross_amount_minor bigint not null check (gross_amount_minor >= 0), currency_code varchar(3) not null, worker_share_basis_points integer not null check (worker_share_basis_points between 0 and 10000), compensation_policy_version_id uuid references public.compensation_policy_versions(id),
  status text not null default 'assigned', assigned_at timestamptz not null default now(), completed_at timestamptz, created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version integer not null default 1
);
create index if not exists idx_allocations_employee_status on public.order_allocations(employee_id, status);

create table if not exists public.allocation_completions (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, allocation_id uuid not null references public.order_allocations(id) on delete cascade,
  quantity_completed numeric(30,8) not null check (quantity_completed > 0), completion_status text not null default 'reported' check (completion_status in ('reported','verified','rejected','reversed')),
  completed_at timestamptz not null, reported_by uuid references auth.users(id), verified_by uuid references auth.users(id), verified_at timestamptz, notes text, created_at timestamptz not null default now()
);

create table if not exists public.worker_earnings (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, employee_id uuid not null references public.employees(id), allocation_id uuid not null references public.order_allocations(id), allocation_completion_id uuid not null references public.allocation_completions(id),
  earning_type text not null default 'production', earning_date date not null, eligible_quantity numeric(30,8) not null, allocation_gross_minor bigint not null check (allocation_gross_minor >= 0), share_basis_points integer not null check (share_basis_points between 0 and 10000), earning_amount_minor bigint not null check (earning_amount_minor >= 0), currency_code varchar(3) not null,
  status text not null default 'pending' check (status in ('pending','earned','payroll_eligible','included_in_payroll','paid','reversed')), finance_verified_at timestamptz, created_at timestamptz not null default now(),
  unique (allocation_completion_id, earning_type)
);
create index if not exists idx_earnings_employee_date on public.worker_earnings(employee_id, earning_date);

-- Payment and bank actuals
create table if not exists public.bank_accounts (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, provider text not null, account_name text not null, masked_account_number text, currency_code varchar(3) not null, status text not null default 'active', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.bank_import_batches (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, bank_account_id uuid not null references public.bank_accounts(id), file_name text not null, file_hash text not null, status text not null default 'preview', rows_detected integer not null default 0, rows_imported integer not null default 0, rows_duplicate integer not null default 0, rows_invalid integer not null default 0, created_by uuid references auth.users(id), created_at timestamptz not null default now(), finalized_at timestamptz
);
create table if not exists public.bank_transactions (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, bank_account_id uuid not null references public.bank_accounts(id), external_reference text, transaction_at timestamptz not null, business_date date not null,
  direction text not null check (direction in ('credit','debit')), amount_minor bigint not null check (amount_minor > 0), currency_code varchar(3) not null, description text, fingerprint text not null, import_batch_id uuid references public.bank_import_batches(id), status text not null default 'unmatched', created_at timestamptz not null default now(), unique (bank_account_id, fingerprint)
);
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, payment_number text not null, order_id uuid references public.orders(id), payment_type text not null, expected_amount_minor bigint not null check (expected_amount_minor >= 0), currency_code varchar(3) not null, due_date date, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version integer not null default 1, unique (organization_id, payment_number)
);
create table if not exists public.payment_matches (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, payment_id uuid not null references public.payments(id), bank_transaction_id uuid not null references public.bank_transactions(id), matched_amount_minor bigint not null check (matched_amount_minor > 0), match_method text not null, confidence_score numeric(5,2), status text not null default 'active', matched_by uuid references auth.users(id), matched_at timestamptz not null default now(), reason text, created_at timestamptz not null default now()
);

-- Ledger
create table if not exists public.ledger_accounts (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, account_code text not null, name text not null,
  account_type text not null check (account_type in ('asset','liability','equity','revenue','expense','contra_revenue')), parent_account_id uuid references public.ledger_accounts(id), is_system_account boolean not null default false, status text not null default 'active', created_at timestamptz not null default now(), unique (organization_id, account_code)
);
create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, entry_number text not null, business_date date not null, reference_type text, reference_id uuid, description text not null,
  status text not null default 'draft' check (status in ('draft','posted','reversed')), posted_at timestamptz, reversed_by_entry_id uuid references public.journal_entries(id), created_by uuid references auth.users(id), created_at timestamptz not null default now(), unique (organization_id, entry_number)
);
create table if not exists public.journal_lines (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, journal_entry_id uuid not null references public.journal_entries(id) on delete cascade, ledger_account_id uuid not null references public.ledger_accounts(id),
  debit_minor bigint not null default 0 check (debit_minor >= 0), credit_minor bigint not null default 0 check (credit_minor >= 0), transaction_currency varchar(3), transaction_amount_minor bigint, functional_currency varchar(3) not null default 'IDR', functional_amount_minor bigint not null check (functional_amount_minor >= 0), fx_rate_snapshot_id uuid, description text, created_at timestamptz not null default now(),
  check ((debit_minor > 0 and credit_minor = 0) or (credit_minor > 0 and debit_minor = 0))
);

create or replace function public.cp_ofs_assert_journal_balanced(p_entry_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_debit bigint; v_credit bigint;
begin
  select coalesce(sum(debit_minor),0), coalesce(sum(credit_minor),0) into v_debit, v_credit from journal_lines where journal_entry_id = p_entry_id;
  if v_debit <> v_credit then raise exception 'JOURNAL_NOT_BALANCED'; end if;
end $$;

-- Payroll
create table if not exists public.payroll_periods (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, period_code text not null, start_date date not null, end_date date not null, currency_code varchar(3) not null default 'IDR',
  status text not null default 'draft' check (status in ('draft','calculated','reviewed','approved','paid','closed')), calculation_version integer not null default 1, calculation_hash text, calculated_at timestamptz, reviewed_at timestamptz, approved_at timestamptz, paid_at timestamptz, closed_at timestamptz, created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version integer not null default 1, check (end_date >= start_date), unique (organization_id, period_code)
);
create table if not exists public.payroll_entries (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, payroll_period_id uuid not null references public.payroll_periods(id) on delete cascade, employee_id uuid not null references public.employees(id), gross_compensation_minor bigint not null default 0, deductions_minor bigint not null default 0, net_pay_minor bigint not null default 0, employer_cost_minor bigint not null default 0, currency_code varchar(3) not null, status text not null default 'draft', created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version integer not null default 1, unique (payroll_period_id, employee_id)
);
create table if not exists public.payroll_components (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, payroll_entry_id uuid not null references public.payroll_entries(id) on delete cascade,
  component_type text not null, component_effect text not null check (component_effect in ('earning','deduction','employer_cost','informational')), source_type text, source_id uuid, description text not null, amount_minor bigint not null check (amount_minor >= 0), calculation_method text, rate_basis text, rate_basis_points integer, approval_request_id uuid, created_by uuid references auth.users(id), created_at timestamptz not null default now()
);

-- Controls
create table if not exists public.finance_issues (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, issue_code text not null, source text not null default 'rule_engine', entity_type text not null, entity_id text not null, severity text not null check (severity in ('info','warning','high','critical')), risk_score integer not null default 0 check (risk_score between 0 and 100), title text not null, description text not null, financial_exposure_minor bigint not null default 0 check (financial_exposure_minor >= 0), currency_code varchar(3), status text not null default 'open' check (status in ('open','under_review','waiting_approval','resolved','false_positive','ignored')), detected_at timestamptz not null default now(), assigned_to uuid references auth.users(id), resolved_by uuid references auth.users(id), resolved_at timestamptz, resolution text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version integer not null default 1
);
create index if not exists idx_finance_issues_org_status_severity on public.finance_issues(organization_id,status,severity);

create table if not exists public.approval_requests (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, action_code text not null, target_type text not null, target_id text not null, requested_by uuid not null references auth.users(id), amount_minor bigint, currency_code varchar(3), reason text not null, status text not null default 'pending' check (status in ('pending','under_review','approved','rejected','cancelled')), policy_snapshot jsonb not null default '{}'::jsonb, review_snapshot_hash text, approved_by uuid references auth.users(id), approved_at timestamptz, rejected_by uuid references auth.users(id), rejected_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.closing_periods (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, period_code text not null, start_date date not null, end_date date not null, status text not null default 'open' check (status in ('open','checking','ready','closed','reopened')), snapshot_hash text, revenue_minor bigint not null default 0, payment_minor bigint not null default 0, worker_cost_minor bigint not null default 0, vendor_cost_minor bigint not null default 0, expense_minor bigint not null default 0, profit_minor bigint not null default 0, prepared_by uuid references auth.users(id), prepared_at timestamptz, closed_by uuid references auth.users(id), closed_at timestamptz, reopened_by uuid references auth.users(id), reopened_at timestamptz, version integer not null default 1, created_at timestamptz not null default now(), check (end_date >= start_date), unique (organization_id, period_code)
);
create table if not exists public.closing_checks (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, closing_period_id uuid not null references public.closing_periods(id) on delete cascade, check_code text not null, severity text not null, status text not null, issue_count integer not null default 0, financial_exposure_minor bigint not null default 0, details jsonb not null default '{}'::jsonb, checked_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, actor_user_id uuid references auth.users(id), actor_type text not null, action text not null, entity_type text not null, entity_id text not null, before_data jsonb, after_data jsonb, reason text, request_id uuid not null default gen_random_uuid(), idempotency_key text, ip_address inet, user_agent text, created_at timestamptz not null default now()
);
create index if not exists idx_audit_entity on public.audit_logs(organization_id,entity_type,entity_id);

-- Vendor/procurement
create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, vendor_code text not null, display_name text not null, platform text, status text not null default 'active', created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (organization_id,vendor_code)
);
create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, purchase_order_number text not null, vendor_id uuid not null references public.vendors(id), business_date date not null, currency_code varchar(3) not null, status text not null default 'draft' check (status in ('draft','submitted','confirmed','partially_received','received','finance_verified','paid','closed','cancelled')), expected_cost_minor bigint not null default 0, created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (organization_id,purchase_order_number)
);
create table if not exists public.purchase_order_items (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade, description text not null, quantity numeric(30,8) not null check(quantity>0), buy_rate_minor bigint not null check(buy_rate_minor>=0), cost_minor bigint not null check(cost_minor>=0), currency_code varchar(3) not null, created_at timestamptz not null default now()
);

-- Inventory movement source-of-truth
create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, item_code text not null, name text not null, game_id uuid references public.games(id), item_type text not null, unit_code text not null, costing_method text not null default 'weighted_average' check(costing_method in ('weighted_average','specific_identification')), status text not null default 'active', created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,item_code)
);
create table if not exists public.inventory_locations (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, location_code text not null, name text not null, location_type text not null, team_id uuid references public.teams(id), status text not null default 'active', created_at timestamptz not null default now(), unique(organization_id,location_code)
);
create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, inventory_item_id uuid not null references public.inventory_items(id), location_id uuid not null references public.inventory_locations(id), movement_type text not null, quantity_signed numeric(30,8) not null check(quantity_signed<>0), cost_value_minor bigint, reference_type text, reference_id text, business_date date not null, occurred_at timestamptz not null, source_event_key text, created_by uuid references auth.users(id), created_at timestamptz not null default now(), unique(organization_id,source_event_key)
);
create index if not exists idx_inventory_movements_item_location_time on public.inventory_movements(inventory_item_id,location_id,occurred_at);
create table if not exists public.inventory_reservations (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, inventory_item_id uuid not null references public.inventory_items(id), location_id uuid not null references public.inventory_locations(id), order_item_id uuid not null references public.order_items(id), quantity numeric(30,8) not null check(quantity>0), status text not null default 'active' check(status in ('active','consumed','released','expired')), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

-- Workforce
create table if not exists public.employee_skills (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, employee_id uuid not null references public.employees(id) on delete cascade, game_id uuid references public.games(id), service_id uuid references public.services(id), skill_level text not null check(skill_level in ('trainee','basic','intermediate','advanced','expert')), verified_by uuid references auth.users(id), verified_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.employee_availability (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, employee_id uuid not null references public.employees(id) on delete cascade, availability_status text not null check(availability_status in ('available','busy','break','offline','leave','sick','training')), valid_from timestamptz not null, valid_until timestamptz, reason text, created_by uuid references auth.users(id), created_at timestamptz not null default now()
);
create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, employee_id uuid not null references public.employees(id), leave_type text not null, start_date date not null, end_date date not null, reason text, status text not null default 'requested' check(status in ('requested','approved','active','completed','rejected','cancelled')), requested_at timestamptz not null default now(), reviewed_by uuid references auth.users(id), reviewed_at timestamptz, check(end_date>=start_date)
);

create table if not exists public.idempotency_keys (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, key text not null, action text not null, actor_user_id uuid references auth.users(id), request_hash text not null, response_reference text, status text not null default 'processing', expires_at timestamptz, created_at timestamptz not null default now(), completed_at timestamptz, unique(organization_id,key)
);

create table if not exists public.outbox_events (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, event_type text not null, aggregate_type text not null, aggregate_id text not null, schema_version integer not null default 1, payload jsonb not null default '{}'::jsonb, status text not null default 'pending' check(status in ('pending','processing','processed','failed','dead_letter')), attempt_count integer not null default 0, available_at timestamptz not null default now(), processed_at timestamptz, last_error text, event_key text, created_at timestamptz not null default now(), unique(organization_id,event_key)
);

-- Views
create or replace view public.v_inventory_current_balance as
select organization_id, inventory_item_id, location_id, sum(quantity_signed) as quantity
from public.inventory_movements
group by organization_id, inventory_item_id, location_id;

create or replace view public.v_payment_match_summary as
select p.id as payment_id, p.organization_id, p.expected_amount_minor, coalesce(sum(pm.matched_amount_minor) filter (where pm.status='active'),0) as matched_amount_minor
from public.payments p left join public.payment_matches pm on pm.payment_id=p.id
group by p.id,p.organization_id,p.expected_amount_minor;

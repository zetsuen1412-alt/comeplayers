-- Default-deny RLS. These representative policies are intentionally conservative.
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.teams enable row level security;
alter table public.employees enable row level security;
alter table public.employee_aliases enable row level security;
alter table public.employee_team_history enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_allocations enable row level security;
alter table public.allocation_completions enable row level security;
alter table public.worker_earnings enable row level security;
alter table public.bank_accounts enable row level security;
alter table public.bank_transactions enable row level security;
alter table public.payments enable row level security;
alter table public.payment_matches enable row level security;
alter table public.ledger_accounts enable row level security;
alter table public.journal_entries enable row level security;
alter table public.journal_lines enable row level security;
alter table public.payroll_periods enable row level security;
alter table public.payroll_entries enable row level security;
alter table public.payroll_components enable row level security;
alter table public.finance_issues enable row level security;
alter table public.approval_requests enable row level security;
alter table public.closing_periods enable row level security;
alter table public.closing_checks enable row level security;
alter table public.audit_logs enable row level security;
alter table public.vendors enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_locations enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.inventory_reservations enable row level security;
alter table public.employee_skills enable row level security;
alter table public.employee_availability enable row level security;
alter table public.leave_requests enable row level security;

create policy organizations_member_select on public.organizations for select using (public.cp_ofs_is_member(id));
create policy members_self_or_admin_select on public.organization_members for select using (user_id = auth.uid() or public.cp_ofs_has_permission(organization_id,'security.members.view'));

create policy teams_org_select on public.teams for select using (public.cp_ofs_is_member(organization_id));
create policy employees_view on public.employees for select using (public.cp_ofs_has_permission(organization_id,'employees.view') or profile_user_id = auth.uid());
create policy employee_aliases_admin_view on public.employee_aliases for select using (public.cp_ofs_has_permission(organization_id,'employees.view'));
create policy team_history_view on public.employee_team_history for select using (public.cp_ofs_has_permission(organization_id,'employees.view'));

create policy orders_view on public.orders for select using (public.cp_ofs_has_permission(organization_id,'orders.view'));
create policy order_items_view on public.order_items for select using (public.cp_ofs_has_permission(organization_id,'orders.view'));
create policy allocations_view on public.order_allocations for select using (
  public.cp_ofs_has_permission(organization_id,'orders.view') or exists(select 1 from public.employees e where e.id=employee_id and e.profile_user_id=auth.uid())
);
create policy completions_view on public.allocation_completions for select using (
  public.cp_ofs_has_permission(organization_id,'orders.view') or exists(select 1 from public.order_allocations a join public.employees e on e.id=a.employee_id where a.id=allocation_id and e.profile_user_id=auth.uid())
);
create policy earnings_view on public.worker_earnings for select using (
  public.cp_ofs_has_permission(organization_id,'payroll.view_all') or exists(select 1 from public.employees e where e.id=employee_id and e.profile_user_id=auth.uid())
);

create policy finance_bank_accounts_select on public.bank_accounts for select using (public.cp_ofs_has_permission(organization_id,'finance.view'));
create policy finance_bank_transactions_select on public.bank_transactions for select using (public.cp_ofs_has_permission(organization_id,'finance.view'));
create policy finance_payments_select on public.payments for select using (public.cp_ofs_has_permission(organization_id,'finance.view'));
create policy finance_payment_matches_select on public.payment_matches for select using (public.cp_ofs_has_permission(organization_id,'finance.view'));
create policy finance_ledger_accounts_select on public.ledger_accounts for select using (public.cp_ofs_has_permission(organization_id,'finance.view'));
create policy finance_journal_entries_select on public.journal_entries for select using (public.cp_ofs_has_permission(organization_id,'finance.view'));
create policy finance_journal_lines_select on public.journal_lines for select using (public.cp_ofs_has_permission(organization_id,'finance.view'));
create policy finance_issues_select on public.finance_issues for select using (public.cp_ofs_has_permission(organization_id,'finance.view'));
create policy closing_select on public.closing_periods for select using (public.cp_ofs_has_permission(organization_id,'closing.view'));
create policy closing_checks_select on public.closing_checks for select using (public.cp_ofs_has_permission(organization_id,'closing.view'));

create policy payroll_period_select on public.payroll_periods for select using (public.cp_ofs_has_permission(organization_id,'payroll.view_all'));
create policy payroll_entry_select on public.payroll_entries for select using (
  public.cp_ofs_has_permission(organization_id,'payroll.view_all') or exists(select 1 from public.employees e where e.id=employee_id and e.profile_user_id=auth.uid())
);
create policy payroll_component_select on public.payroll_components for select using (
  public.cp_ofs_has_permission(organization_id,'payroll.view_all') or exists(select 1 from public.payroll_entries pe join public.employees e on e.id=pe.employee_id where pe.id=payroll_entry_id and e.profile_user_id=auth.uid())
);

create policy approvals_select on public.approval_requests for select using (public.cp_ofs_has_permission(organization_id,'approvals.view') or requested_by=auth.uid());
create policy audit_select on public.audit_logs for select using (public.cp_ofs_has_permission(organization_id,'audit.view'));
create policy vendor_select on public.vendors for select using (public.cp_ofs_has_permission(organization_id,'vendors.view'));
create policy po_select on public.purchase_orders for select using (public.cp_ofs_has_permission(organization_id,'vendors.view'));
create policy inventory_item_select on public.inventory_items for select using (public.cp_ofs_has_permission(organization_id,'inventory.quantity.view'));
create policy inventory_location_select on public.inventory_locations for select using (public.cp_ofs_has_permission(organization_id,'inventory.quantity.view'));
create policy inventory_movement_select on public.inventory_movements for select using (public.cp_ofs_has_permission(organization_id,'inventory.quantity.view'));
create policy inventory_reservation_select on public.inventory_reservations for select using (public.cp_ofs_has_permission(organization_id,'inventory.quantity.view'));
create policy employee_skills_select on public.employee_skills for select using (public.cp_ofs_has_permission(organization_id,'employees.view'));
create policy availability_select on public.employee_availability for select using (public.cp_ofs_has_permission(organization_id,'workforce.view') or exists(select 1 from public.employees e where e.id=employee_id and e.profile_user_id=auth.uid()));
create policy leave_select on public.leave_requests for select using (public.cp_ofs_has_permission(organization_id,'workforce.view') or exists(select 1 from public.employees e where e.id=employee_id and e.profile_user_id=auth.uid()));

-- Financial writes are intentionally not opened by generic RLS insert/update policies here.
-- Production mutation functions must be implemented as audited business actions after the M0 repository audit.

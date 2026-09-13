# Product Requirements

## Scope

CP-OFS is an authenticated internal module under the ComePlayers admin environment. Initial user-facing modules are Finance Dashboard, Orders, Operations, Employees, Reconciliation, Finance Issues, Payroll, Closing, Approvals, and Audit. Vendor, Inventory, AI Auditor, Legacy Migration, and advanced reporting follow after the core is stable.

## Roles

V1 must support Owner, Finance Admin, Finance Staff, Supervisor, Operator, Worker, Auditor, System Service, and AI Service. Roles map to granular permissions; a single global `is_admin` flag is insufficient.

## Orders

Orders can originate from ComePlayers Marketplace, G2G, direct/manual, Telegram, legacy migration, or other sources. Every order uses an internal immutable ID. External references such as X1465 are searchable references, not primary keys.

One order may contain multiple items. The backend calculates totals from item quantity/rate and never trusts a client-supplied total as authoritative.

## Allocations and completions

An item may be assigned to one or multiple workers. Partial allocation and partial completion are supported. Allocated quantity cannot exceed required quantity; completed quantity cannot exceed allocated quantity.

## Employee identity

All finance relations use canonical employee IDs. Aliases exist only for search, legacy import, and typo mapping. Team/FH history is temporal so future team moves do not rewrite historical transactions.

## Worker earnings

Normal worker earnings are generated from verified completion plus a compensation-policy snapshot. They are never entered as a second manual INCOME row. States should support pending, earned, payroll eligible, included, paid, and reversed.

## Compensation policies

Rules are versioned and can be assigned at organization, team, game, service, employee, and order-override scopes. The most specific valid rule wins. Historical transactions retain their policy snapshot.

## Payments and bank transactions

Expected business payments are separate from actual bank/payment transactions. Support full, partial, multi-payment, overpayment, refund, and multi-currency flows. Bank statements import through upload -> preview -> dedupe -> finalize.

## Reconciliation

At minimum reconcile quantity, amount, employee identity, FH/team, payment amount/reference, duplicates, missing records, payroll eligibility, and journal state. Deterministic rules are authoritative; AI only assists explanation and ambiguous matching.

## Finance issues

Issues store type, entity, severity, risk score, financial exposure, state, resolution, actor, and timestamps. Blocking deterministic invariants cannot be dismissed as ordinary false positives.

## Payroll

Payroll is generated from payroll-eligible worker earnings plus structured components: earnings, genuine bonus, maintenance/laundry, advance repayment, employee debt repayment, subscription, percentage withholding, penalty, adjustment, other credit, and other deduction.

Company labor cost must be distinct from net transfer. Repayment of kasbon/debt reduces cash paid, not worker cost.

Payroll lifecycle: Draft -> Calculated -> Reviewed -> Approved -> Paid -> Closed. Review/approval uses snapshot hashes so changed payroll must be reviewed again.

## Ledger

Use double-entry accounting. Posted journals require debit = credit, are immutable, and are corrected through reversal/new entries.

## Closing

Finance periods: Open -> Checking -> Ready -> Closed. Closing blocks on material amount/quantity/identity mismatches, invalid allocations, unbalanced journals, blocking payroll problems, and unresolved critical issues. Closed periods reject direct finance mutations.

## Approvals and audit

Configurable approval policy depends on action, amount, role, and organization policy. Sensitive dual-control actions require requester != approver. Sensitive actions write append-only audit records. Secrets are redacted before logging.

## Security

Use least privilege, default deny, server-side authorization, Supabase RLS, private storage for confidential files, no service-role keys in browser code, secret sanitization, and cross-organization isolation.

Workers may view their own jobs/earnings/payroll/debt, but not other workers' payroll, company-wide bank data, profit, vendor costs, or global audit.

## AI

AI may explain anomalies, flag unusual patterns, suggest legacy identity matches, and answer finance questions from sanitized backend facts. It cannot post journals, approve payroll, close periods, change identity, alter payments, or write worker earnings.

## Legacy migration

All workbook migration uses staging, conflict detection, review, lineage, and promotion. Known conflict classes include amount mismatch, identity mismatch, invalid date, duplicate, formula mismatch, unmapped employee, and unmapped game/service.

## Non-functional requirements

Auditable, deterministic, transactional, secure, mobile usable, performant for current and foreseeable scale, testable, maintainable, and safe to migrate incrementally.

## V2 expansion requirements

CP-OFS must additionally support:
- vendor/procurement with partial receipts and payable/advance treatment;
- movement-based inventory with reservations, transfers, costing, stock count, valuation;
- worker/inventory/vendor hybrid order fulfillment;
- workforce skill/availability/schedule/leave/capacity/handover;
- SLA/progress/ETA and at-risk/overdue operations;
- owner control center and explainable profitability/cash/aging analytics;
- role-aware deduplicated notification automation;
- backup/restore validation, health monitoring, safety switches, and incident response;
- staged production cutover and marketplace integration.

Order payment status is derived from payment/matching/refund state. Disputes and fulfillment are separate domains. Employee employment status is separate from workforce availability.

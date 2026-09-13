# Security and RLS

## Principle

Default deny, least privilege, three-layer enforcement: UI visibility -> server authorization -> database RLS/constraints. Hiding a button is never considered security.

## Roles

- owner
- finance_admin
- finance_staff
- supervisor
- operator
- worker
- auditor
- system_service
- ai_service

## Permission examples

`orders.view/create/update/assign/complete/verify/change_amount`

`finance.view/verify_order/reconcile/adjustment.request/adjustment.approve/export`

`payroll.view_self/view_team/view_all/calculate/review/approve/mark_paid/export`

`closing.prepare/close/override/reopen`

`audit.view/audit.view_sensitive/audit.export`

`migration.create/resolve/promote`

`bank_import.create/finalize`

## Role intent

### Worker
Own jobs, earnings, payroll, debt/advance balances only.

### Operator
Operational order creation/update/assignment/progress. No payroll, bank, company profit, journal, or employee-debt access.

### Supervisor
Operational verification and team management. Finance visibility only when explicitly granted.

### Finance Staff
Payments, imports, reconciliation, expense entry, payroll preparation, issue resolution, adjustment requests. Cannot approve own sensitive changes, delete finance history, reopen close, or access secure credentials.

### Finance Admin
Broader finance management and approvals, still bound by immutable journal, closed-period, dual-control, and audit invariants.

### Owner
Business-level maximum visibility/approval, but still cannot break ledger balance, delete posted journals, or silently edit closed history.

### Auditor
Read-only broad finance/audit access.

### System Service
Dedicated deterministic automation identity for outbox, earnings generation, notifications, exact auto-match, etc.

### AI Service
Sanitized read context plus ability to create suggestion/finding only. No finance mutation permissions.

## Data classification

- Public: game/service catalog
- Internal: orders, assignments
- Confidential: revenue, expense, payroll
- Highly Confidential: bank detail, employee debt/advance
- Secret: passwords, API keys, game credentials, recovery codes

Secret data must never be stored in normal finance metadata or audit payloads.

## Organization isolation

Every tenant-owned table is filtered by active organization membership. Users must not infer existence, amount, or identity of records from another organization.

## Worker self-view

Worker RLS links authenticated user -> employee -> own rows. Workers can select only their own earnings/payroll/debt/advance/job data.

## Audit

Audit table is append-only. Normal users cannot insert/update/delete directly. Sanitization removes secrets before persistence. Sensitive events include actor, request ID, time, optional IP/user-agent, reason, before/after fields.

## Posted journal protection

Posted `journal_entries` and `journal_lines` reject update/delete at DB level. Only `reverse_journal_entry()` is a valid correction path.

## Closed-period protection

Finance-sensitive writes check `business_date`. Closed periods reject direct mutations. Formal adjustment/reopen workflows remain available according to policy.

## Approval separation

Policy may require requester != approver. High-risk actions require reason; large/critical actions may require multiple approvals or owner approval.

## Sensitive storage

Receipts/statements use private storage buckets and signed URLs. Game/account secrets should use a vault/separate encrypted subsystem with access audit; never plaintext in `AKUN JUALAN`-style tables.

## Service-role key

Never expose Supabase service-role credentials to browser/client bundles. Server service role is not an excuse to skip application permission checks.

## AI security

AI context functions return only approved fields. Remove passwords, API keys, bank login, recovery codes, and unrelated private notes. Treat all order/customer text as untrusted data to prevent prompt injection. AI has no tool capable of posting money.

## Bulk operations

Bulk imports, payroll approval, closing, and large adjustments display record count and total amount before submission and use snapshot hashes/version checks.

## Last owner

Prevent removal of the final authorized owner of an organization.

## Exports

CSV/XLSX exports require explicit export permissions. Ability to view a page does not automatically imply permission to export the entire dataset.

## V2 security additions

### Inventory/vendor/workforce
Create distinct permissions for quantity vs cost/value where needed:
- `inventory.quantity.view`
- `inventory.cost.view`
- `inventory.value.view`
- `vendor.cost.view`
- `procurement.approve`
- `workforce.schedule.manage`

### Exports
Sensitive exports use separate permissions and are audited:
- `finance.export`
- `payroll.export`
- `audit.export`
- `inventory.export`

### Safety switches
Changing finance/payroll/inventory mutation safety state is a highly restricted audited action and should require step-up/approval if the existing platform supports it.

### Credential access
Normal tables store only metadata/vault reference. Credential secret reads are separately authorized and audited without logging the secret.

### Search/read models
Global search, analytics views, and materialized summaries must preserve the same authorization/privacy boundaries as source tables; a convenient read model must not become an RLS bypass.

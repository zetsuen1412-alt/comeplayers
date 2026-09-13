# UI Routes and Workflow

## Initial routes

- `/admin/finance`
- `/admin/finance/transactions`
- `/admin/finance/reconciliation`
- `/admin/finance/issues`
- `/admin/finance/closing`
- `/admin/orders`
- `/admin/orders/[id]`
- `/admin/operations`
- `/admin/employees`
- `/admin/employees/[id]`
- `/admin/payroll`
- `/admin/payroll/[periodId]`
- `/admin/approvals`
- `/admin/audit`

Later:

- `/admin/vendors`
- `/admin/inventory`
- `/admin/finance/ai-auditor`
- `/admin/finance/migration`

## Finance dashboard

Cards: revenue, payments received, outstanding, worker payable, vendor payable, estimated profit. System-health panel: critical issues, warnings, unmatched payments, pending approvals. Daily checklist must expose blocking discrepancies immediately.

## Orders

Table supports source, game/service, worker, amount, operational status, payment status, finance status. Filters by period, game, FH/team, worker, source, status.

## Order detail

Tabs/sections: Overview, Items, Allocations, Completion, Payments, Finance, Issues, Audit Timeline. Global search for X1465 must show all related records in one place.

## Operations

Show active, unassigned, overdue, completed today, team/FH workload. Assignment board supports structured multi-worker allocations.

## Employees

Employee overview uses canonical code and current team. Tabs: jobs, earnings, payroll, team history, adjustments, audit.

## Reconciliation

Show matched/auto-matched/manual/unmatched/conflict counts. Conflict cards display expected vs actual quantity/amount/identity and safe resolution actions.

## Issues

Filter by severity/type/source/status. Every issue shows financial exposure, evidence, affected entity, owner, and resolution history.

## Payroll

Period dashboard shows employees, gross earnings, bonus, deductions, expected payout, blocking issues. Employee detail expands every component and links back to source earnings/orders.

## Closing

Show checklist for orders, payments, revenue, worker earnings, journal balance, unmatched payments, critical issues, and closing snapshot. Close button disabled on hard blockers.

## Approvals

Queue for adjustment, expense, payroll, refund, closing override/reopen, and other policy-driven actions.

## Audit

Search by entity/user/date/action. Display before/after for permitted non-secret fields.

## AI auditor

Dashboard of scans/findings plus optional question interface such as “why can’t this period close?”. AI answers must link to internal evidence and never expose unauthorized data.

## Mobile

Core mobile nav: Dashboard, Orders, Search, Issues, Profile. Tables become card layouts. Finance numbers remain readable; avoid gaming-heavy animation.

## Visual language

ComePlayers dark administrative UI with restrained yellow/gold accents, strong numeric typography, clear status badges, minimal animation, and high readability.

## V2 routes

Additional routes:

- `/admin/control-center`
- `/admin/analytics/games`
- `/admin/analytics/teams`
- `/admin/analytics/workers`
- `/admin/finance/cash-flow`
- `/admin/finance/profit-loss`
- `/admin/vendors`
- `/admin/procurement`
- `/admin/inventory`
- `/admin/inventory/valuation`
- `/admin/workforce`
- `/admin/workforce/calendar`
- `/admin/workforce/leave`
- `/admin/workforce/analytics`
- `/admin/operations/queue`
- `/admin/operations/workload`
- `/admin/system`
- `/admin/system/health`
- `/admin/system/backup`
- `/admin/system/incidents`
- `/my/jobs`
- `/my/schedule`
- `/my/leave`

Finance/cost/valuation fields are permission-aware. Mobile layouts prioritize worker job/progress/availability flows rather than reproducing dense desktop tables.

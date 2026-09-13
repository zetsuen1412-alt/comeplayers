# ComePlayers Operations & Finance System (CP-OFS) — Codex Handoff V2

Version: **V2 Specification Refresh**  
Status: **Implementation-ready specification; not executable application source code**

CP-OFS is the internal operations, finance, payroll, reconciliation, procurement, inventory, workforce, analytics, audit, AI-assisted control, and production-safety system for ComePlayers.

The project replaces the legacy spreadsheet-driven workflow represented by `references/EVO GAMING 2026.xlsx`. It is **not a spreadsheet clone**. The workbook is retained as migration evidence and a regression source.

## Scope

CP-OFS covers:

- canonical employees and FH/team history;
- orders, items, allocations, completions, handovers, SLA, and workforce capacity;
- worker earnings and payroll;
- expected payments, bank transactions, reconciliation, expenses, and double-entry ledger;
- refunds, disputes, adjustments, closing, approvals, and immutable audit;
- vendors, procurement, inventory, reservations, transfers, valuation, and hybrid fulfillment;
- owner analytics, profit/cash reporting, notifications, AI auditor, backup, monitoring, incident response, and production rollout;
- future direct integration with ComePlayers Marketplace.

## Existing target stack

Integrate into the current ComePlayers repository and preserve its architecture unless the M0 audit proves a change is necessary:

- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase PostgreSQL
- Supabase Auth + RLS
- Vercel
- OpenAI API only for optional AI auditor/explanations

## Source-of-truth hierarchy

- Order total: authoritative order items; header total may be a transactionally maintained aggregate.
- Worker earnings: verified completion + allocation pricing snapshot + compensation policy snapshot.
- Payment status: derived from expected payments, actual transactions, matches, refunds, and chargebacks.
- Inventory balance: derived from immutable/append-oriented inventory movements.
- Payroll: eligible earnings + approved structured components.
- Financial reporting: posted ledger data and closing snapshots.
- Closed reports: immutable snapshot; later corrections use adjustment/reversal.

## Non-negotiable invariants

1. Posted journal entries are immutable.
2. Closed periods cannot be directly edited.
3. Audit logs are append-only.
4. Money never uses float/double/PostgreSQL `money`.
5. Employee names are never financial keys.
6. Normal worker earnings cannot be manually entered.
7. Allocations cannot exceed order requirements.
8. Completions cannot exceed allocations.
9. Payment matching cannot exceed either side.
10. Debt/advance repayment cannot exceed outstanding balance.
11. AI cannot mutate finance, payroll, closing, identity, or inventory balances.
12. Service-role credentials never reach browser code.
13. Workers cannot read another worker's payroll/private financial data.
14. Finance authorization is never frontend-only.
15. Secrets never enter normal audit payloads.
16. Historical corrections use adjustment/reversal rather than silent overwrite.
17. Margin/profit is derived from revenue and costs; there is no default “margin account”.
18. Core finance cannot depend on AI availability.
19. A business action that requires multiple writes must be atomic or durably incomplete; never mark the final state before critical derivatives succeed.
20. Safety switches and feature flags are separate concepts.

## Permanent regression cases

### X1465
Source amount: **Rp640,000**. Legacy INCOME amount: **Rp64,000**. The system must create a critical `AMOUNT_SOURCE_MISMATCH`, exposure **Rp576,000**, and block affected migration/closing until resolved.

### X1936
Legacy sources contain **AZIZ/FH3** versus **AZIS2**. The system must create an `IDENTITY_CONFLICT`; financial posting must use the confirmed canonical employee UUID/code only.

## Release boundaries

- **Core V1 — M1–M8:** security, employees, orders, allocations/earnings, payments/ledger, reconciliation, payroll, closing.
- **V1.5 — M9–M13:** legacy migration, AI auditor, vendor/procurement, inventory, hybrid fulfillment.
- **V2 — M14–M19:** workforce/scheduling, analytics/control center, notification automation, marketplace integration, production hardening, parallel run/cutover.

## Read order for Codex

Start with `CODEX_MASTER_PROMPT.md`. Then read all documents, with priority:

1. `00_PROJECT_CONTEXT.md`
2. `01_PRODUCT_REQUIREMENTS.md`
3. `03_BUSINESS_RULES.md`
4. `04_DATABASE_SCHEMA.md`
5. `05_SECURITY_RLS.md`
6. `06_API_CONTRACTS.md`
7. `08_FINANCE_ENGINE.md`
8. `09_PAYROLL_ENGINE.md`
9. `14_TEST_MATRIX.md`
10. `16_IMPLEMENTATION_MILESTONES.md`
11. the Phase-5 expansion documents `17` through `30`

**Do not implement broadly before M0 audits the existing ComePlayers codebase and Supabase schema.**

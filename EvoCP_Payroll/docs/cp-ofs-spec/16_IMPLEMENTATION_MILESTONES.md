# Implementation Milestones — V2

Implement sequentially. Stop for review after each milestone unless explicitly instructed otherwise.

## M0 — Existing ComePlayers audit
Inspect repository architecture, current Supabase schema/migrations/RLS, auth/profile/roles, marketplace orders, wallet, escrow, notifications, payments, seller flows, admin structure, storage, existing tests, and deployment conventions.

Deliver a compatibility map:
- reuse as-is;
- extend;
- migrate;
- new CP-OFS entity;
- conflict/risk.

No broad implementation before M0.

## M1 — Organization / Security / Audit foundation
Organization membership, roles/permissions, default-deny RLS, money/currency helpers, business-date conventions, idempotency, audit append-only, outbox, error model, request IDs, feature/safety configuration foundation.

Acceptance: cross-org blocked; service-role not browser-exposed; audit immutable; money utilities golden-tested.

## M2 — Employee / Teams
Employees, aliases, teams, temporal team history, employee self mapping, admin UI.

Acceptance: canonical ID; alias cannot drive payroll; team overlap blocked; worker self-RLS.

## M3 — Order Core
Orders/items, orthogonal operational/finance state, pricing methods, server-computed totals, status events, global search foundation.

Acceptance: duplicate external protection; gross aggregate consistency; optimistic locking.

## M4 — Allocations / Completion / Earnings
Allocations, snapshots, completion events, compensation policies, partial completion, handover-safe model, finance verification, generated earnings.

Acceptance: over-allocation/completion blocked; multiple completion earnings valid; idempotent earning-source uniqueness; X1465/X1936 tests.

## M5 — Payments / Bank / Ledger
Expected payments, bank imports, bank transactions, matching, FX snapshots, CoA, journals, expenses, employee receivables/debts.

Acceptance: partial/multi/overpayment; import dedupe; balanced immutable journals; repayment balance protection.

## M6 — Reconciliation
Rule engine, finance issue center, amount/quantity/identity/payment/ledger checks, issue dedupe/fingerprint.

Acceptance: X1465 critical mismatch blocks relevant closing; X1936 identity conflict; exact facts deterministic.

## M7 — Payroll
Periods, entries, components, review hash, approval, settlement, advance/debt repayment integration.

Acceptance: gross/net/employer-cost logic; no double labor-cost posting; self-approval policy; paid lock.

## M8 — Closing / Adjustments
Closing checks/snapshot, adjustment/reversal, warning exceptions, closed-period DB protection, exceptional reopen.

Acceptance: snapshot-change block; hard accounting invariants non-overridable; closed history immutable.

### Core V1 boundary
M1–M8 are sufficient for a production-pilot core if all readiness gates pass.

## M9 — Legacy Migration
Actual EVO workbook parser, staging, normalization, conflict review, lineage, controlled promotion, cutover/opening-balance support.

Acceptance: X1465/X1936 detected; critical conflict blocks promotion; no fabricated inventory history.

## M10 — AI Auditor
Sanitized bounded context functions, scans/findings, anomaly explanations, mapping recommendations, finance Q&A.

Acceptance: no finance mutation permission; prompt injection treated as data; core finance works with AI unavailable.

## M11 — Vendor / Procurement
Vendor master, price quotes, procurement requirements, purchase orders, receipts, vendor payable/advance model, partial receipt and three-way matching.

## M12 — Inventory
Items/locations, movement ledger, reservations, transfers, cost events, weighted-average/specific-ID costing, stock count/reconciliation, valuation.

Acceptance: no direct stock overwrite; retry idempotency; negative-stock policy; inventory adjustment audit.

## M13 — Fulfillment Integration
Worker/inventory/vendor fulfillment bridge, hybrid order costing, COGS/vendor/direct-service cost attribution, contribution margin drilldown.

### V1.5 boundary
M9–M13 add migration, AI, vendor, inventory, and hybrid fulfillment.

## M14 — Workforce / Scheduling
Skills, availability, schedules, leave, capacity, progress, SLA/ETA, handover, worker self-service.

Acceptance: leave/restriction affects suggestions; handover preserves old earnings; capacity concurrency tested.

## M15 — Analytics / Owner Control Center
Cash position, receivable/payable aging, game/service/channel/team analytics, P&L, cash flow, inventory valuation, preliminary/final/estimated labels, drilldown.

## M16 — Notification / Automation
Event-driven notification rules, role-aware recipients, dedupe, quiet behavior, escalation, scheduled deterministic reports.

## M17 — Marketplace Integration
Map existing ComePlayers marketplace checkout/payment/escrow/order lifecycle into CP-OFS without duplicate entry or duplicate accounting.

## M18 — Backup / Monitoring / Incident Hardening
Backup metadata/integration, restore validation, monitoring, structured logs, background job health, dead-letter handling, safety switches, incident workflow, deployment/schema observability.

## M19 — Production Parallel Run / Cutover
Controlled pilot, spreadsheet comparison, source-of-truth transition, migration freeze/cutover, closing reconciliation, final production rollout, legacy workbook read-only archive.

### V2 boundary
M14–M19 complete workforce, intelligence, automation, integration, and operational hardening.

## Required milestone report

At the end of every milestone Codex reports:
1. files changed;
2. migrations/schema changes;
3. RLS/security changes;
4. domain/API actions;
5. UI/routes;
6. tests and exact results;
7. known limitations;
8. migration/rollback concerns;
9. next milestone readiness.

## Environment flow

`LOCAL -> PREVIEW/STAGING -> PRODUCTION`

No experimental SQL against production. High-risk migrations use expand-and-contract, staging validation, and verified backup/recovery planning.

## Definition of Done

A financial/operational feature is not done because its page renders. Required as applicable:
- database constraints;
- server authorization;
- RLS;
- audit;
- idempotency;
- concurrency protection;
- closed-period behavior;
- error contracts;
- unit/integration/security/E2E tests;
- documentation;
- monitoring/recovery consideration.

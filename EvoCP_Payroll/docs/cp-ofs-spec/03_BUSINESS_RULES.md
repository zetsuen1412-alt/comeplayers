# Business Rules — Final Integrated V2

## 1. Identity

All production relations use immutable UUIDs. Human codes such as `EMP-0037` and `CP-ORD-2026-001234` are display/business identifiers, not relational primary keys. Employee names and aliases are for display/search/import only.

## 2. Organization scope

Every organization-owned record carries `organization_id`. Authorization is evaluated through `auth.users -> organization_members -> member_roles -> roles -> permissions`. Cross-organization access is default-deny.

## 3. Money and quantity

- Monetary values: integer minor units (`BIGINT`) + ISO currency.
- FX/rates: exact `NUMERIC`, never binary float.
- Quantity: high precision `NUMERIC(30,8)` or compatible.
- Percentage: basis points; 10,000 = 100%.
- Default money rounding: ROUND HALF UP at the defined monetary boundary.
- TypeScript/PostgreSQL/reporting must pass identical golden rounding tests.

## 4. Business date

Financial records use `business_date DATE` in addition to `created_at TIMESTAMPTZ`. Organization timezone defaults to `Asia/Jakarta`. Closing/report periods use business date, not row position or creation timestamp.

## 5. Orthogonal order states

Do not overload one order status.

- `operational_status`: draft, confirmed, assignment_pending, assigned, in_progress, partially_completed, completed, verified, on_hold, cancelled.
- payment status: **derived** from payment/match/refund state; cache only if transactionally maintained.
- `finance_status`: pending, under_review, verified, reconciled, ready_to_close, closed.
- dispute state is represented by dispute entities, not folded into operational status.
- fulfillment status is derived from fulfillment records.

## 6. Order amount

`order_items` are authoritative. An order-header gross total may be stored for performance but is a cached aggregate maintained in the same transaction. Never trust a client-submitted order gross.

Each item declares `pricing_method`, initially:
- `unit_rate`
- `fixed_price`
- `tiered`
- `manual_approved`

## 7. Allocation

Allocation stores employee ID, team snapshot, compensation policy version, assigned quantity, allocation economics, and pricing snapshot. Total active allocation cannot exceed order-item quantity.

## 8. Team history

Employee team membership is temporal. Allocation also stores `team_id_snapshot` so historical finance is not rewritten when team history changes.

## 9. Completion

Completion is event-based. Sum of valid completion events cannot exceed allocation assigned quantity. Completion is operational evidence; supervisor verification and finance verification are separate.

## 10. Worker earning source

Normal worker earnings are generated only from a verified earning-source event, normally an `allocation_completion`.

One allocation may have many completions and many earnings. The idempotency rule is based on the source event, for example unique `(allocation_completion_id, earning_type)`.

For proportional unit-rate work:

`eligible_allocation_gross = allocation_gross × verified_completed_qty / allocated_qty`

`earning = ROUND_HALF_UP(eligible_allocation_gross × share_bps / 10000)`

For fixed-price or non-proportional work, the pricing/allocation policy must state how value is apportioned; do not assume quantity proportionality silently.

## 11. Compensation policy precedence

Versioned policies may be assigned to organization, team, game, service, employee, and approved order override. More specific applicable rules win. Allocation snapshots the resolved policy/rate so later policy changes do not rewrite history.

## 12. Workforce boundary

Skills/availability/schedule/capacity influence assignment eligibility and recommendations. They do **not** directly calculate payroll. Verified production remains the source of production-share earnings.

## 13. Handover

Never change `employee_id` on an in-progress historical allocation to represent handover. Preserve old responsibility/completion and create a new allocation for remaining work. Existing earnings remain attached to the original employee.

## 14. Revenue versus cash

Revenue and cash received are distinct.

Management-accounting default recognition policy:
`operational verification + finance verification -> revenue recognized`.

Payment can occur before or after recognition. Recognized unpaid revenue creates receivable; cash received before recognition is not automatically recognized revenue.

## 15. Payments

Expected business payment and actual bank/payment transaction are separate. Payment status is derived from matching and refund/chargeback state.

Support:
- unpaid/full/partial
- multi-payment
- one-to-many/many-to-one matching
- overpayment/customer credit
- refunds
- multi-currency

Aggregate matches may not exceed either the expected payment or bank transaction.

## 16. Bank transactions

Use `direction = credit|debit` and a positive `amount_minor`; do not combine a direction field with signed amounts.

## 17. Revenue reporting

Reports distinguish:
- Gross Revenue
- Refunds / contra revenue
- Net Revenue
- Direct worker/service cost
- Vendor cost
- Inventory COGS
- Payment fees
- Contribution/Gross Profit
- Operating Expenses
- Operating Profit

“Profit” must state its definition. Margin is derived and is not posted to a fake margin account.

## 18. Worker cost accounting

For direct-service earnings, when the earning is recognized:
- Debit Worker/Service Cost
- Credit Worker Payable

Payroll payment clears worker payable; payroll must not create the same labor cost again.

## 19. Employee advance / kasbon

Issuing advance:
- Debit Employee Receivable
- Credit Bank/Cash

Payroll repayment:
- Debit Worker Payable
- Credit Employee Receivable

Cash transfer pays the remaining worker payable. Repayment reduces a balance-sheet receivable, not labor cost.

## 20. Employee debt / warung

Debt is structured with creditor, original balance, repayments, and outstanding. Repayment cannot exceed outstanding. The source of the debt must be auditable.

## 21. Payroll

Payroll consumes only eligible earnings not already included in another payroll.

`gross_compensation = eligible earnings + approved bonus + positive compensation adjustments`

`net_cash_pay = gross_compensation - employee deductions`

Payroll components use:
- `component_type`
- `component_effect = earning|deduction|employer_cost|informational`
- positive `amount_minor`
- source lineage
- calculation method/rate basis where applicable

Do not use an unconstrained signed amount as the main semantic model.

## 22. Legacy BON terminology

In production naming, `bonus` means genuine additional compensation only. Legacy `BON`, `KASBON`, or warung debt must be mapped to debt/advance/deduction concepts based on verified legacy meaning.

## 23. Payroll lifecycle

Draft -> Calculated -> Reviewed -> Approved -> Paid -> Closed.

Review/approval uses snapshot/calculation hashes. If relevant data changes after review, approval fails. Paid payroll is immutable except through formal correction/adjustment workflow.

## 24. Refund

Refund is a separate event. Never rewrite original payment/revenue history. A refund does not automatically reverse worker earnings; operational responsibility determines whether worker/vendor/company adjustments are required.

## 25. Cancellation

Before work: no earning. After verified partial work: preserve verified portion and cancel only remainder unless an approved correction rule says otherwise.

## 26. Dispute

A dispute can hold unpaid earnings, vendor settlement, or customer settlement. Resolution records explicit financial consequences (refund, worker payable, vendor recovery/adjustment, company loss). No silent deletion.

## 27. Ledger

Posted journal entries must balance in functional currency and become immutable. Corrections use reversal plus corrected/adjustment entries. The functional currency defaults to IDR, while transaction currency/original amount/FX snapshot are retained where applicable.

## 28. FX

Historical transaction stores original currency/amount, exact FX snapshot, functional currency/amount. Later market-rate changes do not recalculate historical entries. Small conversion differences use a defined FX rounding/gain-loss account rather than altering business amounts.

## 29. Inventory source of truth

Inventory balance is derived from inventory movements. Normal stock is never directly overwritten.

Default negative-stock policy: false. Reservations reduce available stock but not on-hand quantity.

## 30. Inventory costing

Fungible assets default to weighted-average cost; unique/nonfungible assets use specific identification. Costing method cannot be casually changed after material historical movements.

For internal inventory production, production cost can be capitalized into inventory and recognized as COGS when sold. Do not double-count worker cost.

## 31. Fulfillment modes

Service/catalog may define:
- `direct_service`
- `inventory`
- `vendor_direct`
- `hybrid`

An order item can have multiple fulfillment sources. Total fulfilled quantity cannot exceed ordered quantity.

## 32. Vendor/procurement

Purchase order, receipt, invoice/expected payable, actual payment, and inventory receipt are distinct. Support partial receipts and three-way matching. Vendor advance is an asset until settled, not immediate expense.

## 33. Inventory reconciliation

Stock count compares book vs counted quantity. Approved differences produce explicit adjustment movements and any related financial loss/gain. Never overwrite the balance cell.

## 34. Approvals

Approval thresholds and required roles are data in versioned/configurable policies, not hard-coded values. Material actions normally require requester != approver unless an explicit policy permits self-approval.

## 35. Closing

Closing states: open -> checking -> ready -> closed, with formal reopened history if required.

Prepare runs deterministic checks and stores snapshot/hash. Close revalidates the hash and hard blockers.

Prefer current/open-period adjustment for corrections discovered after closing. Reopen is exceptional.

## 36. Non-overridable invariants

No business role may override:
- unbalanced journal;
- cross-organization violation;
- over-allocation/over-completion;
- payment overmatch;
- repayment > outstanding;
- impossible inventory source integrity;
- posted-journal immutability.

## 37. Audit

Sensitive business actions write append-only audit entries with actor, action, entity, relevant before/after data, reason, request ID, and timestamp. Audit sanitizer removes passwords/tokens/API keys/2FA/other secrets.

## 38. Idempotency/concurrency

Money/finalization actions require idempotency. Ordinary edits use optimistic versions. Payment matching, payroll finalization, inventory consumption where oversell is possible, and closing use appropriate database locks/transactions.

## 39. Outbox

Outbox is for notifications, integrations, AI scans, and non-critical async work. A record must not be marked finance-final if a critical derivative required for correctness has failed.

## 40. AI boundary

AI can explain, detect patterns, and recommend. It cannot post journal entries, approve payroll, close periods, resolve identity automatically, alter money, or mutate inventory balances. Core finance must continue when AI is offline.

## 41. Legacy migration

Legacy import is staged: upload -> parse -> normalize -> validate -> conflict review -> promote. Current-balance-only inventory imports become explicit opening-balance movements at cutover; do not fabricate transaction history. Every promoted record should retain source lineage where practical.

## 42. Analytics

Live/current-period analytics are preliminary. Closed-period reporting is final. Forecasts are estimated. Every material KPI must be drillable to source transactions and use a consistent metric definition.

## 43. Safety and incidents

Feature availability flags are distinct from safety switches such as `finance_mutations_enabled`. System incidents are separate from record-level finance issues. Recovery uses controlled correction when possible; full database restore is reserved for catastrophic recovery.

# Test Matrix

## Test layers

1. Unit tests
2. Database constraint tests
3. Domain/integration tests
4. RLS/security tests
5. Concurrency/idempotency tests
6. End-to-end business tests
7. Legacy migration tests
8. Reconciliation tests
9. Performance tests
10. Backup/restore tests

## Mandatory golden tests

### X1465
Source Rp640,000, legacy Rp64,000 -> critical mismatch, Rp576,000 exposure, closing blocked.

### X1936
AZIZ/FH3 vs AZIS2 -> identity conflict, no payroll until canonical employee mapping.

## Money tests

- 640000 x 50% = 320000.
- ROUND_HALF_UP: 1,000,001 x 50% = 500,001 IDR.
- basis points limits 0..10000.
- USD minor-unit conversion.
- FX snapshot does not change when later rate changes.

## Allocation/completion tests

- over-allocation rejected;
- exact multi-worker allocation accepted;
- partial completion retained;
- multiple completion events aggregate;
- over-completion rejected;
- unverified completion not payroll eligible;
- earnings generation idempotent.

## Compensation tests

- default vs employee override;
- policy version effective dates;
- manual override permission/reason/approval;
- historical snapshot stable after policy changes.

## Payroll tests

- gross/net/labor-cost separation;
- maintenance once per period;
- subscription breakdown;
- explicit percentage base;
- advance/debt repayment cannot exceed balance;
- earning cannot be included twice;
- review snapshot invalidates on change;
- self-approval blocked when required;
- paid payroll cannot recalculate directly.

## Payment tests

- partial payment;
- multi-payment;
- overpayment separated;
- duplicate import dedupe;
- concurrent match race allows only one valid result;
- manual match requires reason and audit.

## Journal tests

- balanced entry posts;
- unbalanced entry rejected;
- posted entry/lines immutable;
- reversal creates new opposite entry.

## Refund/dispute tests

- refund preserves original sale/payment history;
- cumulative refund cannot exceed refundable balance;
- dispute holds settlement/eligible unpaid earnings according to policy;
- split resolution journals balance.

## Closing tests

- clean period becomes READY/CLOSED;
- amount mismatch blocks even if quantity matches;
- identity mismatch blocks;
- unbalanced journal blocks with no override;
- changed snapshot requires re-prepare;
- closed period rejects direct mutation;
- approved adjustment preserves original history;
- reopen authorization/reason/audit.

## RLS/security tests

- worker sees only own data;
- operator cannot access payroll/bank/profit;
- supervisor does not automatically gain company-wide finance;
- finance staff cannot delete journal/reopen/credential data;
- auditor is read-only;
- AI service cannot mutate finance;
- organization A cannot infer B records;
- service-role key absent from client bundle;
- final owner cannot be removed.

## Idempotency/concurrency

- double create order with same key -> one order;
- retry markPayrollPaid -> one journal/repayment set;
- stale optimistic version -> `STALE_VERSION`;
- simultaneous closing -> one succeeds, second sees already closed;
- bank match aggregate never exceeds transaction.

## Migration tests

- workbook parses to staging without production mutation;
- repeated import/promotion does not duplicate;
- X1465/X1936 conflicts detected;
- formula mismatch/date conflict detected;
- promotion blocked on critical unresolved conflict;
- lineage accessible from production record.

## AI tests

- AI failure does not stop finance core;
- malformed AI output is rejected/retried;
- prompt-injection text cannot gain mutation capability;
- AI explanations do not alter backend financial facts.

## Existing ComePlayers regression

Smoke-test Marketplace, authentication, seller dashboard, wallet, escrow, notifications, and existing orders after each integration milestone.

## Severity

P0 blocker: duplicated money, payroll corruption, security leak, cross-org exposure, silent closed-data modification.

P1 critical: incorrect reconciliation/earnings, permission bypass, migration corruption.

P2 major: workflow/report defects with material operational impact.

P3 minor: cosmetic/non-critical UX.

P0/P1 must be zero before production rollout.

## V2 advanced regression suites

### Earnings
- one allocation with 3 completion events creates 3 source-event earnings, not duplicate allocation-level earning;
- retry same completion event creates exactly one earning.

### Inventory
- atomic transfer creates equal out/in quantity;
- retry receipt/consumption does not double stock;
- reservation prevents oversell;
- negative stock blocked by default;
- weighted-average cost golden test;
- stock count difference creates adjustment, not balance overwrite;
- cancelled order releases reservation.

### Vendor
- partial receipt remains partially received;
- PO/receipt/invoice amount mismatch creates issue;
- vendor advance is not immediate expense.

### Fulfillment
- hybrid sources sum exactly to order quantity;
- over-fulfillment blocked;
- delivered inventory fulfillment requires corresponding consumption/movement.

### Workforce
- leave excludes worker from normal suggestions;
- skill/restriction enforced;
- handover preserves old completion/earnings;
- concurrent capacity assignment does not oversubscribe hard limit.

### Analytics
- revenue/cash/profit definitions reconcile to source views;
- FINAL report does not change after closed snapshot;
- worker cannot infer restricted company profit through analytics/search/export.

### Production safety
- safety switch blocks mutation but preserves authorized read;
- background dead-letter retry remains idempotent;
- backup restore integrity suite passes before production cutover;
- deployment/schema mismatch is detected;
- AI outage leaves core finance functional.

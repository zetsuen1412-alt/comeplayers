# API and Business Action Contracts

## Pattern

`UI / Route Handler / Server Action -> Domain Service -> Transactional Repository/DB Function -> Audit + Outbox`

HTTP/server action layers never contain core business calculations.

## Standard mutation metadata

Mutations include `idempotencyKey`; editable records include `expectedVersion`; sensitive changes include `reason`.

## Standard success

`{ success: true, data, warnings: [], issuesCreated: [], auditReference?, version? }`

## Standard failure

`{ success: false, error: { code, message, details?, retryable } }`

## Core actions

### createOrder
Permission `orders.create`. Backend validates source/currency/items/duplicate external reference and computes totals. Transaction creates order, items, initial status event, audit, and outbox.

### updateOrder
Permission `orders.update`. Only explicitly whitelisted operational fields. Generic unrestricted patch is forbidden.

### changeOrderAmount
Permission `orders.change_amount`. Requires reason/version/idempotency. If finance-verified/posted/closed, route through approval/adjustment rather than direct update.

### assignWorker
Permission `orders.assign`. Backend resolves current team and compensation policy snapshot. Reject inactive worker, invalid team, over-allocation, cancelled/closed order, invalid override.

### recordAllocationCompletion
Permission `orders.complete`. Adds completion event; does not overwrite prior progress.

### verifyAllocationCompletion
Permission `orders.verify`. Supervisor approve/reject with reason where needed.

### financeVerifyOrder
Permission `finance.verify_order`. Transaction validates order/items/allocations/completions/identity/amount/dispute state, generates eligible earnings, writes status event/audit/outbox. All-or-nothing.

### generateWorkerEarning
Internal/idempotent. Unique completion linkage prevents duplicate earnings on retries.

### createBankImportPreview
Permission `bank_import.create`. Parse into preview/staging; no production bank transaction write yet.

### finalizeBankImport
Permission `bank_import.finalize`. Requires preview hash + idempotency. Inserts only valid non-duplicate transactions.

### autoReconcilePayments
Internal deterministic process. Exact matches can auto-match; ambiguous candidates remain reviewable.

### manualMatchPayment
Permission `finance.reconcile`. Requires reason/version/idempotency. Reject over-match, currency mismatch, stale version, already consumed bank amount. Approval can be required for high-risk difference.

### unmatchPayment
Requires reason. If posted/closed, use adjustment/reversal rather than deletion.

### createExpense / submitExpense / approveExpense
Create validates amount/category/date/receipt; submit resolves approval policy; approve verifies snapshot and separation of duties.

### createEmployeeAdvance
Permission `employee_advances.create`. Approved issue creates receivable/cash journal.

### calculatePayroll
Permission `payroll.calculate`. Pulls eligible earnings, groups employee, generates components, validates debts/advances, computes totals, stores calculation hash.

### runPayrollCheck
Checks duplicate earning, identity conflict, invalid negative pay, over-repayment, blocking finance issues, unverified earnings.

### reviewPayroll
Permission `payroll.review`; calculation hash must still match.

### approvePayroll
Permission `payroll.approve`; requires reviewed state, no blocking issue, unchanged snapshot, and approval policy.

### markPayrollPaid
Permission `payroll.mark_paid`. Transaction marks paid, locks earnings, creates advance/debt repayments, posts payroll journal, audit/outbox. If journal fails, everything rolls back.

### createRefund / approveRefund
Separate event; validate refundable balance, reason, period state, policy. Posting creates proper journal/contra-revenue/refund effects without deleting original payment.

### openDispute / resolveDispute
Dispute can place earnings/settlement on hold. Resolution uses explicit customer refund, worker payable, vendor adjustment, and company loss fields.

### createAdjustment / approveAdjustment
Never a generic SQL patch. Approved adjustment dispatches to a specific handler that produces valid reversal/correction events.

### postJournalEntry
Internal finance function. Valid accounts/currency/open period/balance required.

### reverseJournalEntry
Permission `journal.reverse` or approved internal correction handler. Creates a new reversing entry.

### runFinanceChecks
Permission `finance.check.run`. Runs deterministic reconciliation rules and upserts deduplicated finance issues.

### resolveFinanceIssue
Resolution state depends on issue type. Critical hard invariants cannot be accepted as exceptions while the underlying imbalance remains.

### runAiFinanceScan
Creates AI findings only. No direct finance write.

### prepareClosing
Permission `closing.prepare`. Runs checks and stores closing snapshot/hash.

### closePeriod
Permission `closing.close`. Revalidates snapshot and hard gates inside transaction, then marks closed.

### reopenPeriod
Highly sensitive `closing.reopen`, requires reason/approval and critical audit event.

### createLegacyImport / validateLegacyImport / resolveLegacyConflict / promoteLegacyImport
All migration writes first to staging. Promotion requires zero unresolved critical conflicts and a current validation snapshot.

## Authorization order

Authenticate -> organization membership -> permission -> idempotency -> load/lock entity -> version check -> business validation -> database transaction -> audit -> outbox -> response.

## Locking

Optimistic versions for normal edits; row locks/transaction isolation for payment matching, payroll finalization, closing, and other race-sensitive money actions.

## Forbidden APIs

No generic delete/patch for posted journals, worker earning amount, audit records, closed-period finance rows, or AI direct-apply-to-finance endpoint.

## V2 additional business actions

### Fulfillment / inventory
- `reserveInventory(orderItemId, itemId, locationId, quantity, ...)`
- `releaseInventoryReservation(reservationId, reason, ...)`
- `consumeInventoryReservation(reservationId, quantity, ...)`
- `transferInventory(fromLocationId, toLocationId, itemId, quantity, ...)`
- `createStockCount(locationId, ...)`
- `submitStockCount(countId, ...)`
- `approveStockAdjustment(countId, ...)`

All inventory finalization is idempotent and rechecks available stock inside a transaction/lock.

### Procurement/vendor
- `createProcurementRequirement(...)`
- `createPurchaseOrder(...)`
- `recordVendorReceipt(...)`
- `financeVerifyVendorReceipt(...)`
- `recordVendorAdvance(...)`
- `matchVendorPayment(...)`

### Workforce
- `suggestWorkers(orderItemId)` read-only
- `requestLeave(...)`
- `reviewLeave(...)`
- `updateJobProgress(...)`
- `handoverAllocation(allocationId, newEmployeeId, remainingQuantity, reason, ...)`

Handover creates a new allocation; it does not rewrite historical worker identity.

### Safety/incident
- `setFinanceMutationSafetyState(...)`
- `setPayrollMutationSafetyState(...)`
- `setInventoryMutationSafetyState(...)`
- `openIncident(...)`
- `addIncidentEvent(...)`
- `resolveIncident(...)`

These actions are highly restricted, reason-required, and audited.

### Critical transaction rule
Transport handlers must not mark finance/payment/payroll/closing/inventory final state before all correctness-critical synchronous writes succeed. Notification/AI delivery may be asynchronous.

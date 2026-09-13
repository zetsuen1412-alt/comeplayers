# Reconciliation

## Purpose

Replace spreadsheet “selisih” logic with deterministic multi-dimensional checks.

## Required dimensions

- source quantity vs allocated/completed quantity
- source amount vs derived amount
- canonical employee identity across order/allocation/earning/payroll
- team/FH snapshot consistency
- expected payment vs matched bank/payment value
- duplicate source references/transactions
- missing allocation/completion/payment
- vendor fulfillment/cost where enabled
- inventory movement balance where enabled
- payroll inclusion consistency
- journal balance and posting state

## X1465 requirement

Quantity may match (`1 == 1`) while amount does not (`640000 != 64000`). This must create a critical amount mismatch with Rp576,000 exposure and block closing.

## X1936 requirement

Different alias/name representations must never silently map to payroll. Import/reconciliation shows candidate canonical employee and requires explicit human resolution when confidence/policy says ambiguous.

## Payment matching levels

1. Exact: reference + amount + compatible currency -> safe auto-match.
2. Strong: exact amount plus strong reference/date/customer evidence -> auto-match only if policy allows.
3. Possible: amount/date similarity without sufficient identity -> review.
4. No match -> open issue/outstanding.

## Issue deduplication

Use a fingerprint of issue code + entity + relevant value state. Re-running checks updates the existing open issue (`last_detected_at`) rather than producing unlimited duplicates.

## Severity

Suggested: LOW, MEDIUM, HIGH, CRITICAL plus numerical risk score 0-100. Risk reflects impact, while AI confidence reflects confidence in an explanation/candidate.

## Closing integration

Critical deterministic mismatches are hard blockers. Warnings may be closable with formal exception policy; accounting imbalance is never overrideable.

## V2 reconciliation checks

Add deterministic checks for:
- `VENDOR_QUANTITY_MISMATCH`
- `VENDOR_AMOUNT_MISMATCH`
- `INVENTORY_NEGATIVE_BALANCE`
- `INVENTORY_RECONCILIATION_PENDING`
- `ORPHAN_INVENTORY_RESERVATION`
- `DELIVERY_WITHOUT_INVENTORY_MOVEMENT`
- `UNVALUED_MATERIAL_INVENTORY`
- `HANDOVER_QUANTITY_MISMATCH`
- `WORK_VERIFIED_WITHOUT_EARNING`

Issue severity/blocking behavior is policy-defined except hard database/accounting invariants.

Reconciliation facts and financial exposure are calculated deterministically; AI may explain the result only.

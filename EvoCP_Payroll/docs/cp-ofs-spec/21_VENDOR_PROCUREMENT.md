# Vendor & Procurement

## Concepts
Vendor = counterparty.
Procurement = process to obtain goods/service.
Inventory = asset held by ComePlayers.
Vendor-direct fulfillment may bypass inventory.

## Purchase order lifecycle
`draft -> submitted -> confirmed -> partially_received -> received -> finance_verified -> paid -> closed`

Cancellation/rejection states are explicit.

## Partial receipts
Receipt events record actual accepted/rejected quantity. Do not mark a 2,000-unit PO fully received after 1,200 units arrive.

## Three-way matching
Compare:
1. purchase-order expectation;
2. receipt/accepted quantity;
3. vendor invoice/payment expectation.

Mismatch creates structured issues such as `VENDOR_AMOUNT_MISMATCH` or `VENDOR_QUANTITY_MISMATCH`.

## Vendor advance
Advance is a balance-sheet asset until applied/settled. It is not immediate cost simply because cash left the bank.

## Vendor price quote
Quote is non-binding reference with valid period. Transaction/purchase order snapshots the final agreed rate.

## Vendor analytics
- purchase volume;
- average rate;
- delivery time;
- late/cancel rate;
- quality/dispute;
- payable outstanding.

Vendor scoring is deterministic and decomposable; AI can explain, not create money movements.

## Duplicate protection
Invoice/reference fingerprints and idempotent receipt/payment workflows prevent repeated vendor cost/stock.

## Permissions
Separate:
- vendor quantity/operational view;
- vendor cost;
- payable;
- procurement approval;
- vendor payment.

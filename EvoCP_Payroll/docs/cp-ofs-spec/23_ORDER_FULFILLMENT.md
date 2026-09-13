# Order Fulfillment

## Purpose
Connect customer order quantity to the actual source that fulfilled it.

## Sources
- worker allocation;
- inventory reservation/consumption;
- vendor allocation.

Prefer concrete FK columns with a database CHECK requiring exactly one source.

## Invariants
- fulfillment quantity > 0;
- total fulfillment <= order item quantity;
- source quantity/cost must be valid;
- retries cannot create duplicate fulfillment for the same source event.

## Modes

### Direct service
Worker performs work directly. Worker cost is attributed to the order.

### Inventory
Reserved inventory is consumed and COGS is attributed.

### Vendor direct
Vendor fulfills without creating fake inventory.

### Hybrid
An item may combine all source types.

Example:
Order 2,000:
- inventory 600
- worker 500
- vendor 900

Total fulfillment 2,000.

## Margin
Per-order contribution margin can show:
revenue - direct worker cost - vendor cost - inventory COGS - payment fees.

Do not post contribution margin as a ledger account.

## Delivery reconciliation
Detect:
- delivered order with no required source movement/completion;
- fulfillment > order;
- fulfillment source missing;
- reserved stock left behind after cancellation;
- vendor completion not reflected in fulfillment.

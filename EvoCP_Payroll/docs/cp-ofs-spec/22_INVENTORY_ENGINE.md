# Inventory Engine

## Source of truth
Inventory movements are authoritative. Balance tables/materialized views are derived.

## Item
Inventory item includes:
- game;
- unit;
- type;
- costing method;
- negative-stock policy;
- optional reorder thresholds.

## Location
Location may represent:
- central warehouse;
- FH/team;
- game account;
- worker custody;
- other operational store.

Game-account secrets remain in a vault; location references only account metadata.

## Movement types
Examples:
- opening_balance
- farm_production
- vendor_purchase
- customer_sale
- transfer_out
- transfer_in
- return_in
- return_out
- adjustment_gain
- adjustment_loss
- consumption

## Transfer
Transfer is atomic:
from location negative movement + to location positive movement in one business transaction.

## Reservation
Expose:
- on hand;
- reserved;
- available.

Reservation lifecycle:
`active -> consumed|released|expired`.

Available quantity cannot be oversold under default policy.

## Negative stock
Default false. If a specific item/service requires exception, policy must be explicit and auditable.

## Costing
Default:
- weighted-average for fungible currency/material;
- specific identification for unique assets.

Do not casually change costing method after material history exists.

## Cost events
Maintain quantity/value lineage so COGS can be reconstructed and stock value audited.

## Stock count
Count session stores book snapshot, counted value, difference, review/approval. Approved discrepancy creates explicit adjustment movement; never overwrite balance.

## Inventory closing checks
Examples:
- negative balance;
- pending material stock-count issue;
- delivery without inventory movement;
- orphan reservation;
- unvalued material inventory;
- cost/movement inconsistency.

## Legacy opening balance
When legacy sheet only supplies current quantity, import an opening-balance movement at cutover. Do not invent prior movement history.

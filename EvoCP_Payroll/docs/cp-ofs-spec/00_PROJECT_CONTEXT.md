# Project Context

## Why CP-OFS exists

ComePlayers currently has operational and financial workflows that evolved from a spreadsheet model. The main legacy reference is `EVO GAMING 2026.xlsx`, which contains roughly 31 worksheets spanning order mutation, income, payroll, closing, vendor/bandar operations, game-specific work, multi-currency activity, and warehouse/inventory tracking.

The workbook supported earlier growth but now creates material control risks:

- the same order can be entered more than once in different sheets;
- names are used as calculation keys;
- amount errors can survive if quantity still matches;
- fixed row ranges can omit new records;
- allocations can be stored as free text;
- formulas can be copied or edited accidentally;
- payroll deductions are encoded as columns rather than structured records;
- closed history can be altered without a formal reversal trail.

## Target business flow

`Order -> Order Item -> Allocation -> Completion -> Operational Verification -> Finance Verification -> Worker Earnings -> Payment Reconciliation -> Payroll -> Closing -> Reporting`

Every stage must be traceable to the previous stage.

## Business context

CP-OFS must support gaming operations such as boosting, leveling, quests, farming, gold/item delivery, vendor sourcing, external gaming marketplaces, direct customer orders, teams such as FH1/FH2/FH3, partial completion, multiple workers per order, multiple vendors per order, multi-currency payment flows, and worker payroll derived from production.

## Long-term marketplace integration

The final goal is zero duplicate entry for ComePlayers Marketplace orders:

`Customer Checkout -> Marketplace Order -> Payment/Escrow -> Operations -> Worker/Seller -> Completion -> Finance Ledger -> Settlement -> Reporting`

External sources such as G2G, Telegram/manual work, and legacy imports remain supported.

## Migration philosophy

Legacy data is never copied directly into production accounting tables. It follows:

`Upload -> Staging -> Normalize -> Validate -> Detect Conflicts -> Human Review -> Promote`

`INCOME` is treated as reconciliation evidence, not authoritative truth for earnings. Earnings should be rebuilt from trusted order/allocation/completion data whenever possible.

## Product philosophy

CP-OFS is a lightweight internal ERP specialized for ComePlayers. The backend should be rigorous, but daily UI must remain simpler than the legacy spreadsheet.

## V2 target state expansion

Beyond replacing manual finance sheets, CP-OFS is intended to become the internal operational control plane for ComePlayers: direct worker work, vendor procurement, game-asset inventory, payroll, analytics, and later marketplace-native fulfillment. The project should therefore normalize business concepts rather than preserve one table per historical worksheet.

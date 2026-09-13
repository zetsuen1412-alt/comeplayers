# Legacy Workbook Analysis

## Source

Primary legacy workbook: `EVO GAMING 2026.xlsx`.

The workbook is retained as a migration/reference artifact. Before production migration, Codex must re-audit exact columns, formulas, and active ranges against the actual file; this document captures the business conclusions already established during design.

## Major worksheet groups observed

Core finance/operations sheets include:

- `INCOME`
- `MUTASI FH`
- `MUTASI BANDAR`
- `PAYROLL-1`
- `PAYROLL-2`
- `PAYROLL-3`
- `DB CLOSING`
- `MMP COA`

Game/production sheets include examples such as `SV$`, `MFH$`, `EQL$`, `GV$`, `QF$`, `BITCRAFT$`, `RO$`, `GORGON$`, `MNM$`, `POE2$`, `COA$`, `AOC GOLD STEAM`, plus warehouse/inventory sheets such as `GORGON ITEM$`, `GUDANG MNM`, `GUDANG GORGON`, `GUDANG FAREVER`, and `GUDANG FH2`.

Additional legacy sheets include selling/account references and game-specific tracking such as `AKUN JUALAN`, `LINEAGE2M`, `TARISLAND`, and `AOC PANTHEON SELL OUT`.

## Legacy flow inferred

`MUTASI FH / operational source -> manual INCOME re-entry -> payroll SUMIF/name-based calculation -> DB CLOSING checks`

Vendor flow is represented separately through `MUTASI BANDAR`. Inventory is distributed among multiple GUDANG/game worksheets.

## Critical weaknesses

### Duplicate re-entry

Values are re-entered between operational mutation and INCOME. A correct source value can therefore become a wrong finance value.

### Name-based joins

Payroll formulas historically rely on display names/aliases, which makes spelling changes and FH suffixes dangerous.

### Quantity-only reconciliation risk

A quantity of `1` can match another quantity of `1` while the money amount is wrong by a large amount. New reconciliation must always check quantity and money separately.

### Fixed ranges

Legacy formulas may reference explicit row windows. CP-OFS must always select by organization, business date, entity, and state rather than spreadsheet row ranges.

### Free-text allocations

Worker allocations such as `FAISAL 400` or `ILHAM 400` must become relational `order_allocations` records.

### Formula risk

Business logic cannot remain scattered across sheet formulas. All production calculations must be centralized and tested.

## Golden regression case: X1465

Legacy source:

- external reference: X1465
- worker: Denar
- team: FH3
- game/service context: RoR
- quantity: 1
- source amount: Rp640,000

Legacy INCOME contained Rp64,000. The new system must detect a Rp576,000 difference, classify it as a critical source/derived amount mismatch, and block closing until resolved.

## Golden regression case: X1936

Legacy source identifies AZIZ / FH3. Another legacy representation uses `AZIS2`. The new importer must surface an identity conflict/candidate mapping and require canonical employee selection. Payroll must never use alias strings as the accounting key.

## Payroll interpretation

Legacy payroll contains a mix of production share and deductions. Important modeling decisions:

- base worker share is commonly 50%, but exceptions exist;
- maintenance/laundry is typically a period component, not per-order cost;
- some employees may use special shares;
- percentage deductions must declare their base explicitly;
- game subscriptions are explicit deductions;
- kasbon is an employee receivable repayment, not a reduction in labor cost;
- bon/warung balances are employee debt repayments;
- fields named `BON FH1` / `BON FH3` function as deductions/debt-like amounts rather than true bonus income in the legacy formulas;
- genuine bonus must be modeled separately as a positive component.

## Multi-currency

`MMP COA` demonstrates foreign-currency amounts converted to IDR. CP-OFS must snapshot FX rates at transaction time; historical amounts cannot depend on live spreadsheet formulas.

## Commission / percentage pools

Legacy sheets contain recurring percentage calculations such as 2%. CP-OFS models these through generic versioned commission schemes rather than hard-coding legacy distribution formulas until business ownership confirms exact allocation rules.

## Migration authority hierarchy

Initial hierarchy:

- order reference, worker/FH, game, quantity, rate: operational source (`MUTASI FH`) where reliable;
- vendor buy/sell details: `MUTASI BANDAR`;
- legacy `INCOME`: reconciliation evidence, not blind earnings source;
- payroll sheets: source for legacy period deductions/components;
- DB CLOSING: verification reference, not authoritative ledger;
- MMP COA: source for legacy FX context;
- GUDANG/game sheets: source for inventory opening reconstruction;
- credentials/account sheets: separate secure migration path, never normal finance tables.

## Migration requirements

Every imported row must retain source lineage: file, sheet, row, raw value, normalized value, batch, fingerprint, status, and conflict information. Critical conflicts must block promotion.

## V2 interpretation rules

The workbook remains evidence, not authority. Where multiple sheets disagree, migration must preserve each source and create a conflict rather than choosing silently.

Legacy GUDANG sheets that only provide balances cannot prove historical movements; migration creates opening balances at cutover.

Legacy INCOME must not become the new earnings source-of-truth. Production earnings are rebuilt/generated from canonical source transactions, allocations, verified work, and confirmed identity mappings where possible.

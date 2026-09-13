# Legacy Migration

## Principle

Never build production schema around the spreadsheet and never import legacy rows directly into accounting tables.

## Pipeline

Upload -> Hash -> Parse -> Staging -> Normalize -> Candidate Mapping -> Deterministic Validation -> Conflict Review -> Validation Snapshot -> Promote -> Post-promotion Reconciliation.

## Staging records

Preserve file hash, sheet, row, raw data, normalized data, row fingerprint, candidate entity, confidence, status, and conflict links.

## Suggested source mapping

- MUTASI FH -> candidate orders/items/allocations
- INCOME -> reconciliation evidence
- PAYROLL sheets -> legacy payroll components/deductions evidence
- DB CLOSING -> legacy verification reference
- MUTASI BANDAR -> vendor orders/cost evidence
- MMP COA -> foreign-currency/FX evidence
- game/GUDANG sheets -> inventory opening/movement reconstruction
- AKUN JUALAN/credentials -> isolated secure migration, not finance metadata

## Identity migration

Normalize aliases, team suffixes, punctuation/casing, then generate candidate mappings. Do not auto-create duplicate employees from spelling variants. Ambiguous mappings require user review.

## Amount migration

Recompute amount from normalized quantity/rate where possible and compare to legacy formula/result. Mismatch becomes `CALCULATED_AMOUNT_MISMATCH` or `AMOUNT_SOURCE_MISMATCH` depending on context.

## Dates

Invalid/out-of-period dates create conflicts. `business_date` must be explicit; file upload/creation date does not substitute for transaction date.

## X1465

Must produce critical amount conflict between trusted source Rp640,000 and legacy INCOME Rp64,000. No automatic promotion while unresolved.

## X1936

Must produce identity conflict/candidate canonical employee mapping for AZIZ/AZIS2; no duplicate employee creation or payroll posting until resolved.

## Promotion

Promotion is idempotent and transactional by safe batch/chunk design. Requires current validation snapshot and zero unresolved blocking conflicts. Every created production entity receives lineage via `legacy_entity_links` or equivalent.

## Parallel run

After initial migration, run spreadsheet and CP-OFS in parallel for multiple periods. Differences need explanation, not necessarily forced equality—CP-OFS may correctly expose old spreadsheet errors.

## V2 inventory and cutover

Legacy GUDANG/current-stock sheets that lack transaction history are imported as explicit opening-balance movements at the agreed cutover date. Do not fabricate older purchases/transfers.

If cost basis is unclear, import quantity with a valuation conflict such as `COST_UNKNOWN` rather than inventing cost.

Cutover process:
1. define freeze/cutover timestamp;
2. close/reconcile legacy period;
3. stage/resolve migration conflicts;
4. create approved opening balances;
5. make CP-OFS the primary entry system;
6. preserve workbook as hashed read-only legacy evidence.

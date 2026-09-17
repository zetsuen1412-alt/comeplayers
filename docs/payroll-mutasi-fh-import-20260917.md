# MUTASI FH historical import — STATUS mapping V2

Source: user-provided EVO GAMING 2026(1).xlsx, sheet MUTASI FH. Source SHA-256: c1b7e68321ee1040cc103ad85578b1fd5efab121c8b81eb950a1346b68f36b4b.

## Mapping confirmed by the owner

GATE is the source. BOOSTER identifies employees. A black-filled BOOSTER cell means STATUS is worker/quantity information, not the order title. Otherwise, when BOOSTER and STATUS are populated, STATUS becomes the website orderName and the original NAMA ORDER is retained in service and the private source archive. Blank STATUS falls back to the original title. Empty BOOSTER alone is not treated as black. No unknown employee is guessed or created.

X2137 remains one 16M order: PERMANA 2M, FARDAN 5M, FERDI 4M, DIO 3M, DANDA 2M. The price unit remains 16 x 33352 = 533632 IDR. No extra million multiplier is introduced.

## Reviewed package

Use ComePlayers-MUTASI-FH-2026-V2.cpimport. The previous package is deliberately rejected. V2 SHA-256: 2aee03d714b63afc37d332fc71375f09ec51170df95655133b924100b8f6f39b. Decompressed UTF-8 SHA-256: 762b1d97ca171bf221a7c32f74ec8d63b0b0bf7b7da457513419e7f384231ebb.

4,404 orders, 4,854 archived source rows, 2,725 corrected STATUS titles, 1,447 orders requiring review, and 148 non-order/tip/incomplete rows. Source totals remain 1,575,401,476 IDR. Nine black-cell order titles have their original internal whitespace restored. All 68,278 archived source cells were checked against XLSX cached values. All 4,404 title mappings and the five-worker example passed validation. Twelve helper unit tests passed under strict TypeScript compilation.

## Safety and operation

The browser import is at /admin/payroll/imports, linked from Tambah Pesanan. Only authenticated payroll users can read the archive; only administrators can apply a package. The API checks exact compressed and uncompressed hashes, mapping version, worker identities, duplicate references, workspace validation, and revision. The SQL transaction retains the period lock, row lock, revision guard, expected employee mapping, financial total assertion, private source archive, and audited before/after snapshots. A repeated package returns already_applied and does not append duplicates. Existing orders are never overwritten. The original foundation migration precedes the V2 hash migration.

Historical orders are not marked verified, not closed, and do not create or consume inventory allocations. No wages or other payments are initiated. Review before admitting historical orders to new payroll. Importing the source and deploying the code are separate operations; check cp_payroll_import_batches and workspace counts for the actual import receipt. Source packages and employee/buyer data must not be committed as public assets.

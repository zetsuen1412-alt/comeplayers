# MUTASI FH reimport from 8 September 2026

## Requested scope

The owner explicitly requested another import, starting at 8 September 2026 and continuing through the current time. The request-time upper bound was 18 September 2026 01:21:22 WIB. Source: the conversation upload EVO GAMING 2026(1).xlsx, worksheet MUTASI FH, SHA-256 c1b7e68321ee1040cc103ad85578b1fd5efab121c8b81eb950a1346b68f36b4b.

The workbook's newest dated source row is 17 September 2026 at approximately 16:18 WIB. It contains no 18 September transactions. The date filter uses each row's actual timestamp, not its row position or the most recent CLOSING label.

## Completed production receipt

The owner had already cleared the earlier full import. The workspace was empty at revision 6 before this operation. The scoped batch mutasi-fh-c1b7e68321ee1040-from-20260908 was applied, and the production workspace was read back at 2026-09-17T18:31:00Z:

- Workspace revision: 7.
- Active orders: 473.
- Total gross order value: IDR 149,031,346.
- Orders outside the requested date interval: 0.
- Duplicate stored order IDs: 0.
- Duplicate stored external references: 0.
- Source rows retained in the scoped private archive: 477.
- Incomplete source rows retained for review instead of fabricated orders: 4.
- Earliest active order: 8 September 2026 00:34:20 WIB.
- Latest active order: 17 September 2026 16:16:00 WIB.
- Employees retained: 137. Product/game records retained: 107.
- Auto-verified orders admitted to payroll: 0.
- All workspace sections other than active orders compare equal in the before/after audit snapshots.

## Mapping and incomplete rows

GATE is the source. BOOSTER supplies the employee. A black-filled BOOSTER cell makes STATUS the employee/quantity list; otherwise populated BOOSTER and STATUS fields follow the previously agreed V2 STATUS-to-order-name mapping. The original NAMA ORDER is retained as service information and in the source archive. Original dates, monetary totals and quantity units are retained. X2137 remains one 16M order, with its five source worker quantities adding up to 16M and its IDR 533,632 total unchanged.

The complete 7DS row X1151 was recovered: its numeric-prefix game code is valid and was linked to the existing 7DS catalog entry. All 54 game codes used by this scoped import already have catalog links; no employee or product record was recreated.

Four dated rows have incomplete amounts or quantities and remain in the source review archive: X2205 (row 4255), X2285 (row 4354), X2380 (row 4468), and X2531 (row 4664). Missing values were not guessed. Employee identities or ambiguous quantity allocations still require review where the workbook is insufficient; no unknown employee was invented.

## Preservation and verification

The local workbook checksum, archived V2 package checksum, cached XLSX cell values, black-cell fills, source-row selection, employee roster fingerprint and pre-import workspace fingerprint were checked before the write. The original full-workbook archive remains cleared and unchanged, with JSONB fingerprint a11aacc42b542bc182b7a54b4a3cb138. The existing server save function recorded before/after audit snapshots in the same database transaction as the scoped import receipt.

The operation imports historical records only. It does not pay wages, initiate transfers, run Closing, consume inventory or reset other data. Import status and counts were checked in the live database; an authenticated production browser interaction was not performed. The archive reader now selects the newest applied MUTASI FH batch so the existing import page can display this scoped archive. Re-uploading the old full-workbook packet is not required.

# Restore MUTASI FH source rows 5848–7536 (one-time, October 20)

## Root cause

ComePlayers payroll uses a Google Apps Script in the owner's Google account to push `MUTASI FH` to the website. Website deployments cannot change an installed Apps Script or clear its private Script Properties. After an audited database reset, old row hashes were still acknowledged in Apps Script, leaving only the tail of recent orders in the database.

The fix for the website and missing-reference refresh was deployed separately in PR #73 and #74. **This helper is required if the original bound script still does not transmit rows before its latest CLOSING boundary.** Google Drive available to the connected admin account could not read the source spreadsheet, so no direct remote Sheets access is assumed.

## Bounded procedure

1. Use **EVO GAMING 2026** original workbook (ID `1i8agw507TPoVd66TcMooDhOTzZvoUcFuqrIBmH6Lrdo`), not the mirror.
2. Validate `MUTASI FH!B5848 = X2754` and `B7536 = X4688`. The helper refuses a moved boundary.
3. Keep all Gaji, Kasbon, employees, saved Closing and existing archived reset receipts unchanged.
4. Paste the complete **`comeplayers-fh-reimport-5848-7536.gs`** into a new file in **Extensions → Apps Script** of the **existing payroll sync project**. Do not create a different project and do not replace existing payroll code.
5. Run `startComePlayersFH5848To7536Reimport` once with the account that installed existing sync; grant Google Script scopes. It clears only the acknowledged cache for 5848–7536 in the **original source** namespace, temporarily pins the source to the original workbook and temporarily disables deletion/archiving. Original Sheets cells are read only.
6. It auto-retries deferred batches every minute, using the existing authenticated private payroll sync and its 45s batch limit. The previous sync script properties are restored immediately after each pass, so the normal sync schedule can continue.
7. Inspect `getComePlayersFH5848To7536ReimportStatus` and the Apps Script **Executions** log. `status: source_scan_complete` means the script attempted every code row in the range. Some rows may remain skipped for genuine collisions or incomplete packet details. Confirm code X2754 is present in website and count/amounts match the original Sheet before declaring completion.
8. If user explicitly wants **only** rows through 7536 in live Payroll, agree a policy for later orders. This helper does not delete later-order data and does not permanently pause ongoing sync; doing so would risk losing newer work.

## Reset timing

Perform a fresh **audited admin reset** only immediately before executing the script, after the helper has been installed and verified. Existing `cp_reset_payroll_mutations` creates a backup and refuses reset if there are saved Closing, inventory or payment dependencies. Do not remove data through direct SQL `DELETE` or JSON edits. The source file is never cleared.

## Rollback

Run `stopComePlayersFH5848To7536Reimport` to stop the dedicated trigger; it does not delete imported data. Each sync pass restores the previous Script Properties via `finally`. Keep receipts `cp_payroll_mutation_resets` and earlier histories for recovery.

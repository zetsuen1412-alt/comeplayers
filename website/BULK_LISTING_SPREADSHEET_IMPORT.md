# ComePlayers Bulk Listing Spreadsheet Import

Seller catalog import at `/seller/products/import` accepts:

- UTF-8 `.csv`
- Microsoft Excel `.xlsx`
- Google Sheets exported as `.xlsx` or `.csv`

## Seller flow

1. Download the CSV or Excel template.
2. Optionally export the current catalog as CSV for bulk updates.
3. Fill or edit up to 200 listing rows.
4. Upload the file.
5. Run **Validate Preview**.
6. Correct invalid rows and upload again when necessary.
7. Commit the validated rows.
8. Review the import in **Import History** and download its row report.

## Safety behavior

The server revalidates every row before create/update, verifies seller ownership
for update rows, resolves game/category records, applies product policy checks,
and keeps listings that require compliance review inactive.

A client-generated request token is stored with the import history. Repeating
the same commit request returns the previous result instead of creating duplicate
listings.

The original spreadsheet is not stored. History contains only:

- source file metadata;
- aggregate import counts;
- row-level success/failure summaries.

## Database

Apply:

```text
scripts/comeplayers_bulk_import_history_v23_7.sql
```

Without V23.7, CSV/XLSX import still works, but history, downloadable reports,
and durable idempotency are unavailable.

## Files

- `app/seller/products/import/page.tsx`
- `app/api/seller/catalog/bulk/route.ts`
- `lib/bulkListingSpreadsheet.ts`
- `tests/bulkListingSpreadsheet.test.ts`
- `public/templates/comeplayers-bulk-listing-template.xlsx`
- `scripts/comeplayers_bulk_import_history_v23_7.sql`
- `BULK_IMPORT_HISTORY_V23_7_VERIFY.sql`
- `V23_7_INSTALL.md`

## Dependency

`read-excel-file` is loaded dynamically only when the seller selects an `.xlsx`
file. CSV uploads continue to use the internal CSV parser.

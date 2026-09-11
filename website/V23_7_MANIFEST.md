# ComePlayers V23.7 Manifest

## Added

- `scripts/comeplayers_bulk_import_history_v23_7.sql`
- `BULK_IMPORT_HISTORY_V23_7_VERIFY.sql`
- `V23_7_INSTALL.md`

## Updated

- `app/api/seller/catalog/bulk/route.ts`
- `app/seller/products/import/page.tsx`
- `scripts/migration-registry.json`
- `BULK_LISTING_SPREADSHEET_IMPORT.md`

## Capabilities

- CSV and Excel `.xlsx` listing imports
- Server-side preview and policy validation
- Current seller catalog CSV export
- Latest 30 committed imports
- Row-level downloadable CSV reports
- Idempotency token preventing accidental duplicate submission
- RLS-protected seller history
- Graceful fallback when the migration has not yet been applied

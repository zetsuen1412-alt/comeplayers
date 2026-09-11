# ComePlayers — Complete Bulk Catalog Package

This patch includes the complete seller bulk catalog workflow:

- CSV template and import
- Excel `.xlsx` template and import
- Google Sheets compatibility through CSV/XLSX export
- server-side preview validation
- create and update up to 200 listings per file
- current seller catalog CSV export
- latest 30 import history entries
- downloadable row-level result reports
- per-seller idempotency protection against duplicate submissions
- RLS-protected Supabase history table

## Install order

### 1. Back up the project and database

Do not copy `.env.local` or any secret into Git.

### 2. Extract this patch into the project root

Allow matching files to be replaced. The `app`, `lib`, `public`, `scripts`,
and `tests` folders in this package are already arranged relative to the root.

### 3. Apply the Supabase migration

Open Supabase Dashboard → SQL Editor and run:

```text
scripts/comeplayers_bulk_import_history_v23_7.sql
```

The final result must be:

```text
comeplayers_bulk_import_history_v23_7_ready
```

Then run `BULK_IMPORT_HISTORY_V23_7_VERIFY.sql`.

### 4. Validate and deploy

PowerShell:

```powershell
npm install
npm run typecheck
npm run typecheck:e2e
npm test
npx vercel --prod
```

A helper script `DEPLOY_V23_7.ps1` is included.

## Seller URL

```text
/seller/products/import
```

The original uploaded spreadsheet is not stored. Only file metadata, aggregate
counts, and the row result summary are retained.

# ComePlayers V23.7 Install

V23.7 adds durable seller bulk-import history, downloadable row reports, and
per-seller idempotency protection for CSV/XLSX catalog imports.

## 1. Apply the database migration

Run after V23.6 in Supabase SQL Editor:

```sql
scripts/comeplayers_bulk_import_history_v23_7.sql
```

Expected final row:

```text
comeplayers_bulk_import_history_v23_7_ready
```

Then run:

```sql
BULK_IMPORT_HISTORY_V23_7_VERIFY.sql
```

The table, constraints, policies, and indexes must all be present.

## 2. Install application dependencies

```bash
npm install
```

The spreadsheet reader dependency is already declared in `package.json` and
`package-lock.json`.

## 3. Validate

```bash
npm run typecheck
npm run lint
npm test
```

## 4. Deploy

```bash
npx vercel --prod
```

## Seller workflow

Open `/seller/products/import` to:

- download an Excel or CSV template;
- export the current catalog as CSV;
- upload `.csv` or `.xlsx`;
- preview server validation;
- commit up to 200 create/update rows;
- review the latest 30 imports;
- download row-level result reports.

The route never stores the original spreadsheet. It stores only source metadata,
aggregate counts, and the row result summary.

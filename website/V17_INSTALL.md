# ComePlayers V17 — Bulk Listing Import Installation

## Requirements

Install after V16. The V13 product catalog fields and seller authorization APIs must already be present.

## 1. Install dependencies

No new package is required. Restore the existing lockfile dependencies:

```bash
npm ci
```

## 2. Database

No SQL migration is required for V17.

## 3. Validate

```bash
npm run typecheck
npm run lint
npm run build
```

## 4. Open the seller importer

Login as an approved seller and open:

```text
http://localhost:3000/seller/products/import
```

The seller can:

1. Download a new-listing template.
2. Export the current catalog for updates.
3. Edit up to 200 rows in a UTF-8 CSV file.
4. Upload and run server-side validation.
5. Review errors and warnings per row.
6. Commit only after every row is valid.

## CSV behavior

- `action` must be `create` or `update`.
- `product_id` must be empty for create rows and must belong to the logged-in seller for update rows.
- Category and game can be resolved by ID or exact name.
- Separate tags with `|`, for example `fast|safe-delivery`.
- Quoted descriptions can contain commas and line breaks.
- Stock `0` automatically changes status to `inactive`.
- For products with variants, parent price and stock are not overwritten; use `/seller/inventory` for SKU values.
- Runtime database writes are reported per row. If an unexpected database error occurs after validation, successful rows remain saved and failed rows can be retried separately.

## No new configuration

V17 adds no environment variables and no scheduled jobs.

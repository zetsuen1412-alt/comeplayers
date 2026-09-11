# ComePlayers V13 — Secure Catalog, Product Variants & Bulk Inventory

V13 must be installed after V12.

## What V13 adds

- Server-side seller product create, update, status, and delete/archive actions.
- SKU-level product variants with independent price, stock, status, and attributes.
- Variant-aware checkout and order snapshots.
- Variant-aware V7 stock reservations, cancellation, expiration, and payment finalization.
- Seller variant manager at `/seller/products/[id]/variants`.
- Bulk inventory center at `/seller/inventory`.
- CSV export/import for seller inventory.
- Order detail shows the purchased variant and SKU.

## 1. Backup

```powershell
git add .
git commit -m "backup before catalog variants v13"
```

## 2. Extract the incremental patch

Extract the ZIP into the project root, for example:

```text
C:\Project\evo-gaming
```

Choose **Replace All** so the `app`, `components`, and `scripts` folders merge with the existing project.

## 3. Run the database migration

Open this file in VS Code:

```text
scripts/comeplayers_catalog_variants_v13.sql
```

Copy the entire SQL content into Supabase SQL Editor and click **Run**.

Expected final result:

```text
comeplayers_catalog_variants_v13_ready
```

Do not paste only the file path into Supabase SQL Editor.

## 4. Validate locally

```powershell
npm run typecheck
npm run lint
npm run build
npm run dev
```

V13 introduces no new environment variables.

## 5. Test the seller flow

1. Login as an approved seller.
2. Open `/seller/products`.
3. Create a new product.
4. After creation, add at least two variants, for example:
   - `100 Coins`, SKU `COINS-100`, price `25000`, stock `5`.
   - `500 Coins`, SKU `COINS-500`, price `100000`, stock `2`.
5. Open the public product page and confirm both variants appear.
6. Select a variant and continue to checkout.
7. Confirm checkout shows the selected SKU, its price, and its stock.

## 6. Test reservation correctness

Use one variant with stock `1`:

1. Buyer A starts checkout for that variant.
2. The selected variant stock should become `0`.
3. Buyer B must not be able to purchase the same SKU.
4. Buyer A cancels the unpaid order.
5. The same variant stock should return to `1`.
6. Complete a PayPal Sandbox or wallet payment and confirm stock remains consumed.

## 7. Test bulk inventory

Open:

```text
/seller/inventory
```

Test:

- edit price and stock inline;
- save multiple rows together;
- export CSV;
- modify `price`, `stock`, or `status` in the CSV;
- import the CSV and save the changes.

The CSV importer only updates rows already owned by the logged-in seller. It does not create products or variants.

## 8. Verify the database

Run:

```text
CATALOG_VARIANTS_V13_VERIFY.sql
```

This read-only script checks variant columns, aggregate product stock, reservation variant IDs, and order snapshots.

## Important behavior

- A product without variants continues using its original product-level price and stock.
- As soon as variants exist, the parent product stock becomes the sum of active SKU stock.
- The parent product price becomes the lowest active variant price.
- Removing a variant that already has order history archives it instead of deleting it.
- Seller product writes now go through authenticated server APIs rather than direct browser writes.

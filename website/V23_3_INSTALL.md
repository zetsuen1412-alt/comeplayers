# ComePlayers V23.3 - Checkout Variant Compatibility Fix

Install after V23.2.

## What This Fixes

- Product-level checkout no longer fails when `create_marketplace_order_v13` handles a listing without variants.
- Variant summary sync no longer fails on legacy installations where `products.price` is stored as text.
- No marketplace fee, seller tax, escrow, payout, or FX formula is changed.

## Database Migration

Open Supabase SQL Editor and run:

```text
scripts/comeplayers_checkout_variant_null_fix_v23_3.sql
```

Expected final result:

```text
comeplayers_checkout_variant_null_fix_v23_3_ready
```

## Verify

After applying the SQL patch, run:

```powershell
npm run typecheck
npm run typecheck:e2e
npm test
npm run lint
npm run test:e2e:smoke
```

Then rerun staging sale-to-purchase fixtures.

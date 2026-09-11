# V13 Patch Manifest

## New files

- `app/api/seller/catalog/route.ts`
- `app/api/seller/variants/route.ts`
- `app/api/seller/inventory/route.ts`
- `app/seller/products/[id]/variants/page.tsx`
- `app/seller/inventory/page.tsx`
- `components/marketplace/ProductVariantPurchase.tsx`
- `scripts/comeplayers_catalog_variants_v13.sql`
- `CATALOG_VARIANTS_V13_VERIFY.sql`
- `CATALOG_VARIANTS_V13_INSTALL.md`
- `CATALOG_VARIANTS_V13_MANIFEST.md`

## Modified files

- `app/api/checkout/create-order/route.ts`
- `app/api/orders/[id]/route.ts`
- `app/api/orders/route.ts`
- `app/checkout/[id]/page.tsx`
- `app/orders/[id]/page.tsx`
- `app/product/[id]/page.tsx`
- `app/seller/products/new/ProductUploadClient.tsx`
- `app/seller/products/page.tsx`

## Database objects

- New `product_variants` table.
- New product summary columns: `has_variants`, `variant_count`, `min_variant_price`, `max_variant_price`.
- New order snapshot columns: `variant_id`, `variant_name`, `variant_sku`.
- New reservation column: `variant_id`.
- New RPC: `create_marketplace_order_v13`.
- Variant-aware replacements for `cp_release_order_reservation`, `cp_prepare_order_payment`, and `cp_consume_order_reservation`.

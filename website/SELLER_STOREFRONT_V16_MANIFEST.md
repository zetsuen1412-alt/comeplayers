# ComePlayers V16 Patch Manifest

## New files

- `app/api/seller/storefront/route.ts` — authenticated seller storefront editor API.
- `app/api/storefront/[slug]/route.ts` — public, safe storefront read API.
- `app/seller/storefront/page.tsx` — storefront settings and branding studio.
- `app/store/[slug]/page.tsx` — public seller storefront.
- `scripts/comeplayers_seller_storefront_v16.sql` — database migration and atomic storefront update RPC.
- `SELLER_STOREFRONT_V16_VERIFY.sql` — read-only verification queries.

## Modified files

- `app/seller/page.tsx` — adds Storefront Studio to Seller Tools.
- `app/seller-profile/[id]/page.tsx` — adds public storefront link when published.

## Database additions

New `profiles` columns for:

- public store URL and name
- banner, logo, and accent color
- tagline, description, and announcement
- delivery/refund/support policies
- vacation mode and reopen time
- storefront publication status

New table:

- `seller_store_featured_products`

New server-only RPC:

- `cp_update_seller_storefront_v16`

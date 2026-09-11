# ComePlayers V14 Patch Manifest

## New files

- `lib/offerRanking.ts`
- `scripts/comeplayers_search_ranking_v14.sql`
- `SEARCH_RANKING_V14_INSTALL.md`
- `SEARCH_RANKING_V14_MANIFEST.md`
- `SEARCH_RANKING_V14_VERIFY.sql`
- `V14_INSTALL.md`

## Replaced files

- `app/api/products/by-game/route.ts`
- `app/games/[slug]/offers/GameOffersClient.tsx`
- `app/api/seller/catalog/route.ts`
- `app/seller/products/new/ProductUploadClient.tsx`
- `app/product/[id]/page.tsx`
- `app/api/marketplace/search/route.ts`
- `app/search/page.tsx`

## Functional changes

- Server-side offer filtering, ranking, facets, and pagination
- Transparent recommended-ranking reasons
- Region, platform, server, and discovery tags on listings
- Up to four-offer side-by-side comparison
- Variant-aware effective price and inventory
- Search support for offer compatibility metadata
- Database full-text document and marketplace indexes

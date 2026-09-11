# ComePlayers V17 Patch Manifest

## New files

- `app/api/seller/catalog/bulk/route.ts` — authenticated CSV template/export, server-side preview validation, and bulk create/update endpoint.
- `app/seller/products/import/page.tsx` — seller CSV upload, validation preview, row diagnostics, and import result screen.
- `lib/csv.ts` — RFC-style CSV parser and writer with quoted comma, quote, and multiline-field support.
- `BULK_LISTINGS_V17_INSTALL.md` — installation and operator guide.

## Modified files

- `lib/authenticatedFetch.ts` — adds a reusable authenticated `Response` fetcher for file downloads while preserving JSON requests.
- `app/seller/products/page.tsx` — adds Bulk Listings navigation and replaces the remaining raw product image with `next/image`.
- `app/seller/page.tsx` — adds Bulk Listing Import to Seller Tools.
- `PROJECT_STATUS.md` — updates the project status from the obsolete V1 snapshot to V17.

## Functional changes

- CSV template download for new listings.
- Current seller catalog export to CSV.
- Create and update rows in the same file.
- Maximum 200 listings and 5 MB per browser upload.
- Server-side seller ownership checks for every update row.
- Server-side category and game resolution by ID or exact name.
- Row-level validation errors and normalization warnings before commit.
- Duplicate product update detection.
- Price, stock, status, delivery ETA, image URL, region, platform, server, tag, and slug validation.
- Variant-aware protection: parent listing price and stock remain controlled by SKU inventory.
- One summarized follower notification after successful bulk creation, rather than one notification per new listing.
- Per-row commit results so runtime database failures are visible and retryable.

## Database changes

None. V17 uses the existing V13 catalog and product-variant schema.

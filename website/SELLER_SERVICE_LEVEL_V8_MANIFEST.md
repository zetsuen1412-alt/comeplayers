# ComePlayers V8 Patch Manifest

## New files

- `app/api/cron/mark-late-orders/route.ts`
- `app/api/seller/service-level/route.ts`
- `app/seller/service-level/page.tsx`
- `lib/sellerServiceLevel.ts`
- `scripts/comeplayers_seller_service_levels_v8.sql`
- `SELLER_SERVICE_LEVEL_V8_INSTALL.md`
- `SELLER_SERVICE_LEVEL_V8_VERIFY.sql`
- `SELLER_SERVICE_LEVEL_V8_MANIFEST.md`

## Updated files

- `app/api/orders/[id]/route.ts`
- `app/api/orders/route.ts`
- `app/api/seller/overview/route.ts`
- `app/orders/[id]/page.tsx`
- `app/product/[id]/page.tsx`
- `app/seller/orders/page.tsx`
- `app/seller/page.tsx`
- `app/seller/products/new/ProductUploadClient.tsx`
- `app/seller-profile/[id]/page.tsx`
- `vercel.json`

## Functional changes

- Seller online/away/offline presence with heartbeat expiration
- Default seller delivery SLA configuration
- Product-specific delivery ETA
- Paid-order SLA snapshot and deadline
- Live buyer/seller countdown
- Persisted late-order status and notifications
- On-time rate and average-delivery metrics
- New, Standard, Reliable, Trusted, and Elite seller levels
- Public service-level information on product and seller profile pages

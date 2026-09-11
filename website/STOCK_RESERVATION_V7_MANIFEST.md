# ComePlayers V7 Patch Manifest

## Added

- `app/api/orders/cancel/route.ts`
- `app/api/cron/expire-orders/route.ts`
- `scripts/comeplayers_stock_reservation_v7.sql`
- `STOCK_RESERVATION_V7_INSTALL.md`
- `STOCK_RESERVATION_V7_VERIFY.sql`
- `STOCK_RESERVATION_V7_MANIFEST.md`

## Replaced

- `app/api/checkout/create-order/route.ts`
- `app/api/paypal/create-checkout-order/route.ts`
- `app/api/paypal/capture-checkout-order/route.ts`
- `app/api/orders/[id]/route.ts`
- `app/api/orders/route.ts`
- `app/payment/[id]/page.tsx`
- `.env.example`
- `vercel.json`

## Database behavior

- Atomic stock reservation at checkout creation.
- Checkout expiration and cancellation restore stock.
- Coupon reservations are released for abandoned checkouts.
- PayPal, wallet, and manual payment consume existing reservations.
- Legacy pre-V7 orders remain payable through a safe fallback.

# ComePlayers V7 — Stock Reservation & Order Expiration

V7 prevents two buyers from purchasing the last unit at the same time.
Inventory is reserved atomically when checkout is created, consumed after a
verified payment, and returned when the buyer cancels or the checkout expires.

## Prerequisites

Install Foundation V3, Transaction Core V2.1, Security V4, V5, and V6 first.

## Install

1. Back up your current project.

```powershell
git add .
git commit -m "backup before stock reservation v7"
```

2. Extract the V7 patch into the project root and choose **Replace All**.

3. Add this variable to `.env.local` and Vercel:

```env
CHECKOUT_RESERVATION_MINUTES=20
```

Allowed range is 5–60 minutes. Twenty minutes is recommended for PayPal.

4. Run the full contents of this file in Supabase SQL Editor:

```text
scripts/comeplayers_stock_reservation_v7.sql
```

Expected result:

```text
comeplayers_stock_reservation_v7_ready
```

5. Validate the project:

```powershell
npm run typecheck
npm run lint
npm run build
npm run dev
```

## New transaction behavior

```text
Buyer creates checkout
→ product stock is reserved immediately
→ payment timer starts
→ successful PayPal/wallet payment consumes reservation
→ buyer cancellation returns stock
→ expired checkout returns stock and coupon usage
```

## Test checklist

1. Set a test product stock to `1`.
2. Buyer A creates a checkout. Product stock should become `0`.
3. Buyer B should be unable to create another checkout.
4. Buyer A clicks **Cancel Order & Release Stock**. Stock should return to `1`.
5. Create checkout again and complete PayPal Sandbox payment. Stock must stay
   `0` after payment, not become negative and not be decremented twice.
6. Create another checkout, let it expire, and run the cron endpoint or create a
   new checkout. The expired reservation must return its stock.

## Cron

V7 adds:

```text
/api/cron/expire-orders
```

It uses the existing `CRON_SECRET`. Expired reservations are also cleaned when
new checkout/payment operations run, so stock is not dependent only on cron.

## Important

Do not manually increase product stock after an unpaid checkout. Cancel or let
that checkout expire so the reservation system can restore stock correctly.

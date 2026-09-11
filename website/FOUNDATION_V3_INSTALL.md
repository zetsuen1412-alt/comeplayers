# ComePlayers Foundation V3 — Installation

## 1. Backup

```powershell
git add .
git commit -m "backup before ComePlayers Foundation V3"
```

## 2. Replace source files

Use either the full reviewed source ZIP or extract the incremental patch into the project root and choose **Replace All**.

Delete these legacy files after replacement:

```text
middleware.ts
scripts/comeplayers_transaction_core_v2.sql
```

Keep:

```text
scripts/comeplayers_transaction_core_v2_1.sql
```

## 3. Database migration

The Transaction Core V2.1 migration must already be applied. Then open:

```text
scripts/comeplayers_foundation_v3.sql
```

Copy the complete SQL into Supabase SQL Editor and click **Run**.

Expected result:

```text
comeplayers_foundation_v3_ready
```

## 4. Environment variables

Copy values from `.env.example` into local/Vercel environment variables. Do not commit real secrets.

Required new values:

```env
PAYPAL_WEBHOOK_ID=
CRON_SECRET=
AUTO_COMPLETE_HOURS=72
MARKETPLACE_FEE_RATE=0.05
PAYPAL_CHECKOUT_FEE_RATE=0.05
```

Use a random `CRON_SECRET` of at least 16 characters.

## 5. PayPal Sandbox webhook

In the PayPal Sandbox app, register the deployed HTTPS endpoint:

```text
https://YOUR_DOMAIN/api/paypal/webhook
```

Subscribe at minimum to:

```text
PAYMENT.CAPTURE.COMPLETED
PAYMENT.CAPTURE.DENIED
PAYMENT.CAPTURE.REFUNDED
PAYMENT.CAPTURE.REVERSED
CHECKOUT.PAYMENT-APPROVAL.REVERSED
```

Copy the generated webhook ID to `PAYPAL_WEBHOOK_ID`.

## 6. Vercel Cron

`vercel.json` schedules the escrow auto-completion route once daily at 03:00 UTC. Vercel sends `CRON_SECRET` as a Bearer authorization header.

## 7. Validate

```powershell
npm ci
npm run typecheck
npm run lint
npm run build
npm run dev
```

Current audited lint baseline:

```text
0 errors, 144 warnings
```

## 8. End-to-end Sandbox test

1. Seller creates an active product with stock.
2. Buyer checks out with PayPal.
3. Confirm server-calculated total.
4. Complete payment using a PayPal Sandbox buyer.
5. Verify order becomes `paid`, payment becomes `paid`, escrow becomes `holding`.
6. Seller delivers the product.
7. Buyer confirms receipt.
8. Verify order becomes `completed`, escrow becomes `released`, seller wallet increases.
9. Check `/api/health` on local and deployed environments.

## 9. Git commit

```powershell
git add .
git commit -m "install ComePlayers Foundation V3"
git push
```

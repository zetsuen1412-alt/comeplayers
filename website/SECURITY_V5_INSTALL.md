# ComePlayers Security Boundary V5

V5 moves the remaining sensitive marketplace administration actions behind authenticated server APIs and adds safer database boundaries.

## What V5 protects

- Order payment confirmation, cancellation, dispute status, completion, and refunds
- PayPal capture refunds using the PayPal server API
- Wallet refunds with atomic balance updates
- Dispute resolutions and escrow release/refund behavior
- Coupon create/update/status/delete
- Flash sale create/update/status/delete
- Support ticket admin moderation
- Admin audit trails for all actions above
- RLS policies for coupons, flash sales, disputes, support, and audit logs

## Important safety note

When `PAYPAL_ENV=live`, pressing **Refund** can submit a real PayPal refund. Test V5 with PayPal Sandbox and small wallet/manual orders first.

## Installation

1. Backup the current project:

```powershell
git add .
git commit -m "backup before Security Boundary V5"
```

2. Extract `comeplayers_security_boundary_v5_patch.zip` into the project root and choose **Replace All**.

3. Confirm these previous migrations have already been run:

```text
scripts/comeplayers_transaction_core_v2_1.sql
scripts/comeplayers_foundation_v3.sql
scripts/comeplayers_security_boundary_v4.sql
```

4. Open this file:

```text
scripts/comeplayers_security_boundary_v5.sql
```

Copy its complete contents into Supabase SQL Editor and click **Run**.

Expected result:

```text
comeplayers_security_boundary_v5_ready
```

5. Confirm the following environment variables exist locally and in Vercel:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

PAYPAL_ENV=sandbox
PAYPAL_CLIENT_ID=
NEXT_PUBLIC_PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=

MARKETPLACE_FEE_RATE=0.05
```

6. Validate locally:

```powershell
npm run typecheck
npm run lint
npm run build
npm run dev
```

## Test checklist

### Manual payment confirmation

1. Create an order using Bank Transfer or QRIS.
2. Open `/admin/orders` as admin.
3. Click **Confirm Payment**.
4. Verify `payment_status=paid`, `escrow_status=holding`, and stock is reduced once.

### Wallet refund

1. Pay a small test order using wallet.
2. Refund it from `/admin/orders`.
3. Verify the buyer wallet is credited exactly once.
4. Verify order status and payment status are `refunded`.

### PayPal Sandbox refund

1. Complete a small PayPal Sandbox payment.
2. Refund it from `/admin/orders`.
3. Verify PayPal Sandbox shows the refund.
4. Verify `refund_reference`, `refunded_at`, and `refunded_by` are populated.

### Disputes

1. Mark an order disputed.
2. Resolve as Buyer Wins: refund must run first.
3. Resolve as Seller Wins: escrow is released only after delivery; otherwise the order returns to processing.
4. Check `/admin/audit-logs`.

### Promotions and support

- Create, edit, deactivate, and delete an unused coupon.
- Verify a used coupon cannot be deleted.
- Create and deactivate a flash sale.
- Verify a flash sale with sales cannot be deleted.
- Change a support ticket status and verify the user notification.

## Validation performed

- TypeScript: 0 errors
- ESLint: 0 errors; existing project warnings remain
- Next.js compilation: successful
- Next.js TypeScript build stage: successful

Full page-data generation was not validated in the isolated audit environment because it requires your live Supabase configuration.

## Next sprint

V6 should migrate remaining browser-side order analytics/read paths to server APIs, then enable strict RLS on `orders`, wallets, payment records, and digital-delivery secrets without breaking marketplace pages.

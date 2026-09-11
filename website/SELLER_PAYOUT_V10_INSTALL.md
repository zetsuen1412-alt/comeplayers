# ComePlayers Seller Payout Center V10

## 1. Backup

```powershell
git add .
git commit -m "backup before seller payout center v10"
```

## 2. Extract

Extract the V10 patch into the project root and choose **Replace All**.

## 3. Create a dedicated payout encryption key

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Add the result to `.env.local` and Vercel:

```env
PAYOUT_ENCRYPTION_KEY=PASTE_THE_NEW_KEY
PAYOUT_HOLD_HOURS=24
```

For local testing, `PAYOUT_HOLD_HOURS=0` lets an admin process a request immediately.
Keep a secure backup of the encryption key. Changing it later makes existing payout account details unreadable.

## 4. Run the database migration

Open:

```text
scripts/comeplayers_seller_payout_center_v10.sql
```

Copy the entire SQL content into Supabase SQL Editor and click **Run**.
Expected result:

```text
comeplayers_seller_payout_center_v10_ready
```

## 5. Validate

```powershell
npm run typecheck
npm run lint
npm run build
npm run dev
```

## 6. Test seller flow

1. Open `/seller/payouts`.
2. Add a bank, PayPal, or Wise payout account.
3. Request a small withdrawal above the configured minimum.
4. Confirm the wallet balance is reserved immediately.
5. Cancel one pending request and confirm the balance returns.

## 7. Test admin flow

1. Open `/admin/withdrawals`.
2. Reveal payout details and confirm an audit log is written.
3. Approve the request.
4. Move it to Processing.
5. Enter a payout reference and mark it Paid.
6. Test Reject or Failed on a separate request and confirm the wallet is refunded once.

Use `SELLER_PAYOUT_V10_VERIFY.sql` to inspect database state.

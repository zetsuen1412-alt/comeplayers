# Seller Payout Center V10 Manifest

## New files

- `lib/payoutCrypto.ts`
- `lib/sellerSecurity.ts`
- `app/api/payout-accounts/route.ts`
- `app/api/withdrawals/route.ts`
- `app/seller/payouts/page.tsx`
- `scripts/comeplayers_seller_payout_center_v10.sql`
- `SELLER_PAYOUT_V10_INSTALL.md`
- `SELLER_PAYOUT_V10_VERIFY.sql`

## Replaced files

- `app/api/admin/withdrawals/route.ts`
- `app/admin/withdrawals/page.tsx`

## Updated files

- `app/wallet/page.tsx`
- `app/seller/page.tsx`
- `.env.example`

## Security properties

- Payout identifiers are encrypted with AES-256-GCM.
- Browser clients cannot insert or update payout accounts or withdrawals directly.
- Withdrawal balance reservation and refunds are database-atomic.
- Request keys prevent accidental duplicate withdrawal creation.
- Admin reveal actions and payout status changes are audited.
- Paid, rejected, failed, and cancelled requests are terminal and idempotent.

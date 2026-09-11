# Security Boundary V6 Manifest

## New files

- `lib/deliveryCrypto.ts`
- `app/api/orders/route.ts`
- `app/api/orders/select-payment/route.ts`
- `app/api/wallet/topups/route.ts`
- `scripts/comeplayers_security_boundary_v6.sql`
- `scripts/migrate-delivery-vault.ts`
- `SECURITY_V6_INSTALL.md`
- `SECURITY_V6_VERIFY.sql`

## Updated files

- `.env.example`
- `package.json`
- `app/[id]/page.tsx`
- `app/api/orders/[id]/route.ts`
- `app/api/orders/deliver/route.ts`
- `app/components/MainHeader.tsx`
- `app/my-orders/page.tsx`
- `app/payment/[id]/page.tsx`
- `app/seller/orders/page.tsx`
- `app/wallet/topup/page.tsx`

## Security boundaries

- Browser clients cannot insert/update/delete core order and wallet rows.
- Order lists expose only whitelisted fields.
- PayPal provider records are not readable by ordinary users.
- Seller delivery secrets are encrypted outside the database using a server-only key.
- Delivery data is only decrypted after buyer/seller authorization.

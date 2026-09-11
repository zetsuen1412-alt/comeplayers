# Security Boundary V5 Patch Manifest

## New server files

- `app/api/admin/orders/route.ts`
- `app/api/admin/disputes/route.ts`
- `app/api/admin/coupons/route.ts`
- `app/api/admin/flash-sales/route.ts`
- `app/api/admin/support/route.ts`
- `lib/adminOrderActions.ts`
- `lib/paypalServer.ts`
- `scripts/comeplayers_security_boundary_v5.sql`

## Updated files

- `app/admin/orders/page.tsx`
- `app/admin/disputes/page.tsx`
- `app/admin/coupons/page.tsx`
- `app/admin/flash-sales/page.tsx`
- `app/admin/support/page.tsx`
- `lib/adminSecurity.ts`

## Security behavior

- Admin identity is checked server-side from the bearer token and profile role.
- Service-role credentials never enter the browser bundle.
- Financial changes use idempotent/atomic database functions.
- PayPal refunds use server credentials and an idempotency key.
- Direct browser mutation is revoked for coupons and flash sales.
- Admin actions are written to `admin_audit_logs`.

# ComePlayers V24.1 Security Fix — Install Guide

This package hardens marketplace analytics, payment updates, chat privacy, health checks, tax-identifier encryption, and security headers. Group creation and livestream start/stop retain the original V24 behavior.

## 1. Rotate exposed secrets first

The uploaded archive contained `.env.local`. Treat every private value in that file as exposed and replace it before production deployment.

At minimum rotate:

- `SUPABASE_SERVICE_ROLE_KEY`
- `PAYPAL_CLIENT_SECRET`
- `DELIVERY_ENCRYPTION_KEY`
- `PAYOUT_ENCRYPTION_KEY`
- `TAX_RESIDENCY_ENCRYPTION_KEY`
- `WITHDRAWAL_PIN_PEPPER`
- `SECURITY_HASH_SECRET`
- `CRON_SECRET`
- any Vercel/OIDC deployment token

Do not reuse one encryption key for multiple purposes. Keep `.env.local` outside Git and outside future ZIP files.

## 2. Apply database migrations in order

Check `scripts/migration-registry.json` for the authoritative order.

When the database is already at V23.7, run these two files in Supabase SQL Editor:

1. `supabase/migrations/20260704201820_comeplayers_group_chat_streaming_v24.sql`
2. `supabase/migrations/20260705150000_comeplayers_security_hardening_v24_1.sql`

Then run:

```text
SECURITY_HARDENING_V24_1_VERIFY.sql
```

Expected status:

```text
comeplayers_security_hardening_v24_1_verified
```

V24 is still required for the group chat and livestream tables. V24.1 does not replace group creation or livestream actions with atomic RPC functions.

If the earlier fixed package was already applied and you want to remove its now-unused atomic RPC functions, run `OPTIONAL_REMOVE_ATOMIC_RPCS.sql` once. Do not run that optional file unless the earlier package was applied.

## 3. Configure production environment variables

Use Vercel Project Settings → Environment Variables. Start from `.env.example` and set real values for Production and Preview as appropriate.

Required for the repaired flows:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_PAYPAL_CLIENT_ID
PAYPAL_CLIENT_ID
PAYPAL_CLIENT_SECRET
PAYPAL_WEBHOOK_ID
CRON_SECRET
DELIVERY_ENCRYPTION_KEY
PAYOUT_ENCRYPTION_KEY
TAX_RESIDENCY_ENCRYPTION_KEY
WITHDRAWAL_PIN_PEPPER
SECURITY_HASH_SECRET
```

Use PayPal sandbox until checkout, capture, webhook, refund, and reconciliation tests all pass.

## 4. Install dependencies from a clean source folder

The fixed ZIP intentionally excludes `node_modules`, `.next`, `.git`, `.vercel`, and `.env.local`.

PowerShell:

```powershell
npm ci
npm run typecheck
npm run typecheck:e2e
npm run test
npm run lint
npm run build
```

Current validation from the repair workspace:

- application TypeScript: passed
- E2E TypeScript: passed
- unit tests: 109 passed, 0 failed
- ESLint: 0 errors, 103 pre-existing warnings
- production build: could not be executed in the Linux review container because the uploaded dependencies were Windows-only and external npm package download was unavailable

## 5. Test on Preview before Production

Verify these flows with separate buyer, seller, and admin accounts:

1. Buyer creates an order and selects QRIS/bank transfer.
2. Buyer pays with wallet; balance and stock change exactly once.
3. Buyer pays with PayPal sandbox; capture is idempotent.
4. Seller receives a paid-order notification.
5. Buyer completes a delivered order; escrow is released exactly once.
6. Admin creates a group, adds members, and members cannot see each other's email addresses.
7. Members can start and stop livestreams using the original V24 flow.
8. Anonymous browser analytics cannot create `payment_success` or `order_complete` events.
9. `/api/health/ready` does not expose missing environment-variable names without the protected bearer token.

## 6. Content Security Policy rollout

V24.1 adds HSTS and a CSP in `Report-Only` mode. Check Preview browser consoles and Vercel logs for blocked-resource reports during PayPal, Supabase Realtime, storage, images, and authentication testing. After the policy is confirmed, change the header key in `next.config.ts` from:

```text
Content-Security-Policy-Report-Only
```

to:

```text
Content-Security-Policy
```

Do not enforce it before Preview testing, because an incomplete allowlist can stop PayPal or Supabase traffic.

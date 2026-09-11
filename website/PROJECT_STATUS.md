# COMEPLAYERS PROJECT STATUS

## Current Version

V24.1 — Marketplace and Privacy Security Hardening

## Completed platform areas

- Full Next.js gaming marketplace with Supabase authentication and admin/seller/buyer authorization
- Catalog, variants, inventory, ranking, storefronts, followers, reviews, checkout, PayPal, wallet, escrow, and encrypted delivery
- Disputes, refunds, anti-scam messaging, moderation, risk, seller payout security, reconciliation, alerting, launch controls, privacy, and compliance
- V22 seller-borne sales tax and country/method/currency withdrawal withholding
- V23 immutable marketplace-fee and seller-tax snapshots per order
- V23 versioned rate histories and two-person approval for marketplace fee, seller sales tax, and active withdrawal-tax changes
- V23 verified seller tax residency with encrypted identifiers
- V23 monthly seller tax statements and accounting-period close
- V23 wallet-to-payout FX quotes and immutable withdrawal FX snapshots
- V23 PayPal provider payout submission, synchronization, attempts, and provider-fee evidence
- V23.1 professional split login/register modal, password-strength guidance, real Remember me persistence, email verification, forgot-password recovery, request cooldowns, and public legal pages
- V23.2 IGDB server-side catalog staging, legacy matching, admin approval, safe inactive import, provider shadow data, and local override protection
- V23.7 seller bulk CSV/XLSX catalog import with history and idempotency controls
- V24 community group chat and group-only WebRTC livestream signaling
- V24.1 trusted server-side conversion analytics, chat privacy, and payment-route hardening; group creation and livestream keep their original V24 behavior

## V23 settlement guarantees

```text
buyer total = subtotal - discount + buyer payment fee
seller gross = subtotal - discount
marketplace fee = seller gross × snapshotted marketplace fee rate
seller sales tax = seller gross × snapshotted seller tax rate
seller wallet credit = seller gross - marketplace fee - seller sales tax
```

A rate change never rewrites an existing order snapshot. Withdrawal tax and FX are frozen at withdrawal request time.

## Main surfaces

- Seller tax residency: `/seller/tax-profile`
- Seller tax statements: `/seller/tax-statements`
- Seller payouts and FX quote: `/seller/payouts`
- Finance governance: `/admin/compliance`
- Provider payout execution: `/admin/withdrawals`
- Launch/readiness gates: `/admin/operations`
- Password recovery: `/reset-password`
- Public terms: `/terms`
- Public privacy policy: `/privacy`
- IGDB catalog staging: `/admin/games/igdb`

## Database

The authoritative sequence is `scripts/migration-registry.json`. When the database is already at V23.7, apply:

```text
supabase/migrations/20260704201820_comeplayers_group_chat_streaming_v24.sql
supabase/migrations/20260705150000_comeplayers_security_hardening_v24_1.sql
```

Then verify with:

```text
SECURITY_HARDENING_V24_1_VERIFY.sql
```

## Current validation

- Full repository TypeScript: passing
- E2E TypeScript: passing
- Automated unit tests: 109 passing, 0 failing
- Repaired-file ESLint: zero errors and zero warnings
- Full repository ESLint: zero errors and 103 warnings in older/unrelated pages
- Migration registry: explicitly sequenced through V24.1
- Production build still requires a clean Windows/CI/Vercel dependency install; the review container could not load the Linux SWC binary from the Windows dependency archive
- Supabase migrations and real PayPal evidence still require external credentials and must be validated in Preview before Production

## Next recommended milestone

V25 — chargeback lifecycle, accounting adjustments/credit notes, provider settlement gain/loss, scheduled rate activation monitoring, downloadable statement exports, cohort/LTV dashboards, and scheduled IGDB delta synchronization.

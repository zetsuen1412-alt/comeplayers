# ComePlayers — Source Audit, Foundation V3, and G2G-Class Roadmap

Audit date: 29 June 2026

## Executive summary

ComePlayers is no longer an empty prototype. It already has a broad marketplace surface: authentication, seller onboarding and verification, listings, game/category pages, offers, search, checkout, PayPal Sandbox, wallet, escrow/delivery, orders, chat, reviews, notifications, support, promotions, seller analytics, and a large admin area.

The main limitation is not feature count. It is **production consistency and trust infrastructure**: several critical mutations still happen directly from the browser, core Row Level Security policies are not versioned comprehensively, dispute/withdrawal workflows are incomplete for end users, digital credentials are stored as plain order fields, there are no automated tests, and parts of the codebase contain legacy/duplicate routes.

Engineering estimate after Foundation V3:

- MVP marketplace completeness: **about 80%**
- Production readiness: **about 50%**
- Feature parity with a mature G2G-class marketplace: **about 35–40%**

These percentages are practical engineering estimates, not formal measurements.

## Audit scope and validation

Reviewed source inventory:

- 65 page routes
- 25 API route handlers after the patch
- 99 TSX files
- 40 TypeScript files
- 6 SQL migration/setup files

Validation performed:

- `npm ci`: passed
- `npm run typecheck`: passed
- `npm run lint`: passed with **0 errors and 144 warnings**
- dependency audit: **0 critical, 0 high, 3 moderate, 1 low**
- exact duplicate source files after the patch: none found

A complete production build could not be fully validated in the isolated audit environment because page-data collection depends on the real Supabase/environment configuration. Compilation and TypeScript validation passed.

## What already works well

### Buyer experience

- Browse games and marketplace categories
- Search games/products/offers
- Product detail and offer pages
- Wishlist and recently viewed products/games
- Checkout and order creation
- PayPal Sandbox redirect and capture
- Wallet payment flow
- Order history and order detail
- Digital-delivery confirmation
- Reviews and notifications
- Support tickets and messaging

### Seller experience

- Seller application and verification
- Product creation/editing/listing management
- Seller orders and digital delivery
- Seller profile, followers, analytics, and leaderboard
- Escrow release into seller wallet

### Marketplace operations

- Categories and game catalog
- Coupons and flash sales
- Announcements
- Admin users/products/orders/disputes/support/wallet views
- Marketplace event tracking
- Automatic escrow completion route

## Critical issues found and fixed in Foundation V3

### 1. Checkout price could be trusted from the browser

Previously, order totals, coupon calculations, and payment fees were calculated in the client and orders were inserted directly from the browser. A buyer could modify browser state or requests.

Fixed by:

- adding `POST /api/checkout/create-order`
- calculating product price, coupon discount, quantity, and PayPal fee on the server
- adding the `create_marketplace_order` database RPC
- rejecting inactive products, insufficient stock, invalid coupons, and self-purchases

### 2. PayPal success depended mainly on browser return

A user can close the browser after paying, so payment state must not rely only on the return page.

Fixed by:

- adding `/api/paypal/webhook`
- cryptographically verifying the PayPal webhook signature
- validating the captured amount against the order
- handling completed, denied, refunded, and reversed payment events
- keeping finalization idempotent

### 3. Escrow cron endpoint could be unsafe or inconsistent

The old cron implementation could become accessible when its secret was missing and referenced database logic that did not match the current transaction core.

Fixed by:

- requiring `CRON_SECRET`
- using the existing `complete_order_and_release_escrow` RPC
- processing only paid, delivered, holding orders
- adding buyer/seller notifications
- adding a daily Vercel cron configuration compatible with a Hobby deployment

### 4. Geo currency did not correctly recognize Germany/Eurozone countries

The previous mapping expected `EU`, while hosting providers normally return country codes such as `DE`.

Fixed by:

- mapping Eurozone country codes to EUR
- preserving a future manually selected currency
- migrating the deprecated Next.js 16 `middleware.ts` convention to `proxy.ts`

### 5. Important pages had been overwritten or duplicated

Found exact duplicate content showing accidental replacement:

- admin home was identical to withdrawals
- seller home was identical to seller verification
- wallet home was identical to wallet top-up
- `/api/games` was identical to the trending endpoint
- legacy order routes had stale/dummy content

Fixed by restoring real overview pages, implementing the games browse API, and redirecting legacy order list routes to the canonical buyer orders page.

### 6. Marketplace analytics accepted spoofable user IDs

Fixed by resolving the authenticated user from a bearer token and writing events through a server route. The V3 SQL removes the old anonymous direct-insert policy.

### 7. Missing quality and deployment controls

Added:

- `typecheck`, `check`, and `check:full` scripts
- GitHub Actions CI
- health endpoint
- `.env.example`
- baseline security headers
- Vercel cron configuration

## Files changed by Foundation V3

Core changes include:

- `proxy.ts`
- `next.config.ts`
- `vercel.json`
- `app/api/checkout/create-order/route.ts`
- `app/api/paypal/webhook/route.ts`
- `app/api/cron/release-escrow/route.ts`
- `app/api/games/route.ts`
- `app/api/marketplace/events/route.ts`
- `app/api/admin/overview/route.ts`
- `app/api/seller/overview/route.ts`
- `app/api/wallet/overview/route.ts`
- `app/api/health/route.ts`
- `app/checkout/[id]/page.tsx`
- `app/admin/page.tsx`
- `app/seller/page.tsx`
- `app/wallet/page.tsx`
- `lib/marketplace-events-client.ts`
- `scripts/comeplayers_foundation_v3.sql`

## Remaining production blockers

### P0 — Must be completed before real money

#### A. Core RLS and privileged mutations

Only a small subset of tables has repository-managed RLS policies. Many admin and financial pages still update Supabase directly from the browser. Security currently depends on database policies that are not fully represented in source control.

Required work:

1. Move every admin mutation to authenticated server APIs.
2. Move withdrawal approval/rejection, wallet top-up approval, dispute resolution, coupon changes, and role changes to server APIs/RPCs.
3. Version RLS policies for profiles, products, orders, wallets, wallet transactions, disputes, withdrawals, notifications, chat, and support.
4. Add role checks inside server handlers and database functions.

#### B. Inventory reservation before external capture

Stock is checked and decremented during payment finalization. In a race, another buyer could consume the last stock after PayPal approval but before capture/finalization. That can create a charged payment with an order that cannot finalize.

Required work:

- add a stock-reservation table with expiration
- reserve stock when checkout starts
- release reservation on timeout/cancel
- consume reservation atomically when payment completes

#### C. Secure digital-delivery vault

Digital credentials currently live in order fields. They should not remain as ordinary plaintext records.

Required work:

- encrypt delivery payloads with a server-only key
- one-time/limited reveal controls
- access logs and seller/buyer audit trail
- automatic redaction from normal admin lists
- prohibit credentials in chat

#### D. Dispute and refund lifecycle

There is an admin dispute page, but no complete buyer/seller dispute-creation flow.

Required flow:

`delivered → buyer dispute → evidence upload → seller response → admin decision → refund or release`

Also required:

- evidence retention
- timeline and immutable audit log
- partial/full refunds
- PayPal refund integration
- chargeback handling

#### E. Seller withdrawals and real payout provider

Admin withdrawal management exists, but there is no complete seller request form/provider payout workflow.

Required work:

- seller withdrawal request page
- payout account verification
- hold periods and limits
- double-entry wallet ledger
- PayPal Payouts/bank provider integration
- reconciliation and failed-payout recovery

### P1 — Required for a competitive marketplace

- Seller delivery SLA and late-delivery penalties
- Product/offer variants and tiered pricing
- Bulk listings and inventory API/import
- Proof-of-delivery templates by product category
- Buyer cancellation rules
- Seller levels, badges, performance score, and sanctions
- Chat moderation, attachment scanning, and off-platform contact detection
- Strong search: PostgreSQL full-text or dedicated search service, typo tolerance, synonyms, ranking, facets
- Real exchange-rate service with cached rates and settlement snapshots
- More payment methods by region
- Fraud signals, device/session risk, velocity limits, and rate limiting
- User-facing dispute center
- User-facing withdrawal center
- Legal policy pages and prohibited-product enforcement

### P2 — Scale and growth

- Affiliate/referral system
- Loyalty/rewards
- Seller API and webhooks
- Mobile/PWA experience
- Localization workflow and translated catalog content
- Recommendation service with measured conversion lift
- Email/push notification provider
- Observability: error tracking, structured logs, alerting, traces
- Data warehouse/business intelligence
- Automated accounting reconciliation
- Customer-service macros and SLA dashboard

## G2G-class capability matrix

| Area | ComePlayers now | Target |
|---|---:|---:|
| Game catalog and categories | Strong MVP | Broader taxonomy and automated catalog governance |
| Seller listings | Strong MVP | Variants, bulk listing, inventory API, SLA |
| Buyer checkout | Core working | Reservations, regional methods, stronger anti-fraud |
| Escrow | Core working | Disputes, refunds, evidence, policy engine |
| Digital delivery | Core working | Encrypted vault, controlled reveal, audit trail |
| Wallet | Partial | Double-entry ledger, holds, payout reconciliation |
| Seller withdrawals | Admin-side partial | Seller request + verified provider payout |
| Search/discovery | Functional | Typo tolerance, facets, ranking, merchandising |
| Messaging | Functional | Moderation, attachment scanning, evidence retention |
| Trust and safety | Early | KYC/KYB, fraud, sanctions, prohibited items, chargebacks |
| Admin operations | Broad UI | Server-only mutations, audit logs, RBAC |
| Reliability | Basic | Tests, queues, idempotency, observability, runbooks |
| Global readiness | Display localization | Real FX, localized payments, policy/legal localization |

## Recommended implementation sequence

### Sprint 0 — Install and verify Foundation V3

- apply the patch
- run `comeplayers_foundation_v3.sql`
- configure PayPal webhook and cron secret
- run typecheck, lint, build, and Sandbox transaction test

### Sprint 1 — Security boundary

- server-side admin mutation APIs
- comprehensive RLS migration
- RBAC helpers and audit log
- API rate limiting

### Sprint 2 — Inventory reservation and order state machine

- formal order-state transitions
- stock reservation/expiry
- cancellation rules
- idempotency keys for all financial actions

### Sprint 3 — Disputes, refunds, and secure delivery

- encrypted delivery vault
- dispute center
- evidence and timeline
- PayPal refund/reversal reconciliation

### Sprint 4 — Seller finance

- seller withdrawal request
- payout accounts
- provider payout integration
- double-entry ledger and reconciliation

### Sprint 5 — G2G-like marketplace depth

- variants, bulk listings, delivery SLA
- stronger search/filter/sort
- seller levels and performance rules
- regional payment expansion

### Sprint 6 — Production operations

- unit/integration/E2E tests
- Sentry or equivalent error tracking
- structured logs and alerts
- backup/restore drills
- legal/compliance review
- load and security testing

## Quality debt snapshot

Current ESLint warnings after Foundation V3:

- unused variables: approximately 61
- raw `<img>` elements: approximately 31
- explicit `any`: approximately 17
- hook dependency warnings: approximately 15
- state-in-effect warnings: approximately 9
- immutability warnings: approximately 6
- smaller accessibility/navigation warnings: remaining items

These do not currently block compilation, but hook and immutability warnings should be addressed before large-scale traffic. Image warnings affect performance and Core Web Vitals.

## Go-live gate

Do not switch PayPal to Live until all of the following are true:

- full RLS/RBAC audit passed
- server-side admin and financial mutations completed
- PayPal webhook tested on deployed HTTPS URL
- inventory reservation prevents overselling
- dispute/refund process works end to end
- digital-delivery secrets are encrypted
- seller withdrawal process is reconciled
- automated E2E tests cover purchase, delivery, dispute, refund, and payout
- monitoring and incident response are active
- legal/compliance review is complete

## Immediate next recommendation

Install Foundation V3 first. Then build **Sprint 1: security boundary and core RLS**, because adding more visible features before securing privileged writes would increase risk and rework.

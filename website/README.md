# ComePlayers

ComePlayers is a full-stack gaming marketplace built with Next.js, React, Supabase, and PayPal. It supports buyer checkout, seller listings and variants, digital delivery, wallet and escrow, disputes and refunds, seller payouts, storefronts, search/ranking, anti-scam messaging, reconciliation, controlled launch operations, and commerce compliance.

## Current milestone

**V23.2 — Immutable Finance Governance + IGDB Catalog Migration**

V23 freezes marketplace fee and seller sales-tax rates per order, moves all future rate changes into a dual-approval history, adds verified seller tax residency, monthly tax statements, accounting close, multi-currency FX snapshots, and PayPal provider payout execution.

Main documentation: `PROJECT_STATUS.md`, `FINANCE_GOVERNANCE_V23_INSTALL.md`, `AUTH_UX_V23_1_INSTALL.md`, and `IGDB_CATALOG_V23_2_INSTALL.md`.

## Local setup

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

## Quality commands

```bash
npm run typecheck:v23
npm run typecheck:e2e
npm run lint
npm run test
npm run build
```

The full production build should also be run in a production-equivalent deployment environment with all required variables and services.

## Database

Apply migrations in milestone order. After V22, run:

```text
scripts/comeplayers_finance_governance_v23.sql
```

Verify with:

```text
FINANCE_GOVERNANCE_V23_VERIFY.sql
```

Configure governed rates, FX evidence, verified seller tax residency, and payout-provider access before production payout execution.

## Main V23 surfaces

```text
/orders/[id]
/orders/[id]/invoice
/seller/orders
/seller/payouts
/seller/tax-profile
/seller/tax-statements
/admin/withdrawals
/admin/compliance
/admin/operations
```

## Settlement example

For a Rp100,000 sale whose immutable snapshot contains a 5% marketplace fee and 5% seller sales tax:

```text
Buyer pays                         Rp100,000
Marketplace fee                     Rp5,000
Seller sales tax                    Rp5,000
Seller wallet credit               Rp90,000
```

Changing either active rate later does not alter this order. A payout in another currency receives a separate FX and withdrawal-tax snapshot when requested.


## IGDB catalog

ComePlayers now treats Supabase `game_master` as the application source of truth and IGDB as a server-side metadata provider. Apply:

```text
scripts/comeplayers_igdb_catalog_v23_2.sql
```

Configure server-only `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, and `IGDB_SYNC_ENABLED=true`, then review imports at `/admin/games/igdb`. New provider games remain inactive until an administrator activates them.

## Staging and E2E

```bash
npx playwright install --with-deps chromium
E2E_BASE_URL=https://staging.example.com E2E_START_SERVER=false npm run test:e2e:smoke
```

Deterministic fixtures:

```bash
FIXTURE_ENV=staging FIXTURE_CONFIRM=COMEPLAYERS_STAGING_ONLY E2E_FIXTURE_PASSWORD='secret-from-vault' npm run fixtures:seed
npm run e2e:auth
FIXTURE_ENV=staging FIXTURE_CONFIRM=COMEPLAYERS_STAGING_ONLY npm run fixtures:cleanup
```

Safe load test:

```bash
LOAD_BASE_URL=https://staging.example.com npm run test:load
```

Mutation testing requires `LOAD_ALLOW_MUTATIONS=true` and `LOAD_ENVIRONMENT=staging` or `test`. Use disposable staging data only.

## Production checklist

1. Apply and verify all migrations through V23.
2. Verify orders created before and after a governed rate effective time retain different immutable snapshots.
3. Verify two distinct administrators are required and the requester cannot approve.
4. Review and verify seller tax residency evidence without exposing full tax identifiers.
5. Configure current FX and withdrawal-tax rules for every supported payout route.
6. Test PayPal Payouts in Sandbox, including successful, pending, failed, returned, and synchronized outcomes.
7. Close a completed accounting month and reconcile frozen seller statements against the tax ledger.
8. Run TypeScript, ESLint, unit, deployed E2E, load, reconciliation, SLO, alert, backup/restore, and production build checks.
9. Pass all launch sign-offs in `/admin/operations`.

Rate and withholding configuration must be reviewed by qualified tax/accounting professionals before production use.

Never commit `.env.local`, service-role keys, encryption keys, webhook secrets, Playwright auth state, fixture passwords, or payout credentials.

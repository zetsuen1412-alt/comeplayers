# ComePlayers V19 Manifest

## Database

- `scripts/comeplayers_launch_readiness_v19.sql`
- `LAUNCH_READINESS_V19_VERIFY.sql`

## Operations and alerting

- `lib/alerting.ts`
- `lib/operationalRuns.ts`
- `lib/webhookInbox.ts`
- `lib/paypalWebhook.ts`
- `lib/reconciliationServer.ts`
- `app/api/cron/expire-orders/route.ts`
- `app/api/cron/mark-late-orders/route.ts`
- `app/api/cron/reconcile-finance/route.ts`
- `app/api/cron/release-escrow/route.ts`

## PayPal webhook replay

- `app/api/paypal/webhook/route.ts`
- `app/api/admin/webhooks/paypal/replay/route.ts`

## Admin launch readiness

- `app/api/admin/operations/route.ts`
- `app/admin/operations/page.tsx`
- `app/admin/page.tsx`
- `app/admin/reconciliation/page.tsx`

## Automated testing

- `playwright.config.ts`
- `tsconfig.e2e.json`
- `tsconfig.v19.json`
- `scripts/typecheck.mjs`
- `scripts/create-e2e-storage-state.mjs`
- `e2e/public-smoke.spec.ts`
- `e2e/critical-journeys.spec.ts`
- `e2e/fixtures.example.json`
- `tests/alerting.test.ts`
- `tests/paypalWebhook.test.ts`

## Load and CI

- `load-tests/marketplace-load.mjs`
- `load-tests/scenarios.example.json`
- `.github/workflows/production-readiness.yml`

## Documentation and configuration

- `.env.example`
- `.gitignore`
- `package.json`
- `package-lock.json`
- `README.md`
- `PROJECT_STATUS.md`
- `LAUNCH_READINESS_V19_INSTALL.md`
- `PRODUCTION_LAUNCH_CHECKLIST_V19.md`

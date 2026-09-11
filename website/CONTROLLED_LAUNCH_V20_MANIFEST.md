# ComePlayers V20 Manifest

## Database

- `scripts/comeplayers_controlled_launch_v20.sql`
- `CONTROLLED_LAUNCH_V20_VERIFY.sql`

## Checkout control

- `lib/runtimeControlPolicy.ts`
- `lib/runtimeControls.ts`
- `app/api/checkout/create-order/route.ts`
- `app/api/orders/pay-with-wallet/route.ts`
- `app/api/paypal/create-checkout-order/route.ts`

## PayPal provider reconciliation

- `lib/paypalProvider.ts`
- `lib/paypalProviderReconciliation.ts`
- `lib/paypalProviderReconciliationServer.ts`
- `app/api/cron/reconcile-paypal-provider/route.ts`

## Uptime and SLO

- `lib/slo.ts`
- `app/api/health/route.ts`
- `app/api/health/live/route.ts`
- `app/api/health/ready/route.ts`
- `app/api/cron/monitor-uptime/route.ts`

## Admin operations

- `app/api/admin/operations/route.ts`
- `app/admin/operations/page.tsx`

## Deterministic staging and load testing

- `scripts/seed-staging-fixtures.mjs`
- `scripts/cleanup-staging-fixtures.mjs`
- `scripts/export-e2e-load-env.mjs`
- `load-tests/marketplace-load.mjs`
- `load-tests/mutation-scenarios.v20.example.json`
- `.github/workflows/production-readiness.yml`

## Tests

- `tests/runtimeControlPolicy.test.ts`
- `tests/slo.test.ts`
- `tests/paypalProviderReconciliation.test.ts`
- `e2e/public-smoke.spec.ts`
- `tsconfig.v20.json`

## Configuration and documentation

- `.env.example`
- `package.json`
- `vercel.json`
- `README.md`
- `PROJECT_STATUS.md`
- `CONTROLLED_LAUNCH_V20_INSTALL.md`
- `PRODUCTION_LAUNCH_CHECKLIST_V20.md`
- `PRODUCTION_CANARY_RUNBOOK_V20.md`

# ComePlayers V20 — Controlled Launch Installation

## 1. Apply the database migration

Run this file in the Supabase SQL Editor after all migrations through V19:

```text
scripts/comeplayers_controlled_launch_v20.sql
```

Verify it with:

```text
CONTROLLED_LAUNCH_V20_VERIFY.sql
```

The migration is additive. The initial checkout control is `enabled` at 100%, so applying it does not stop existing checkout traffic.

## 2. Configure environment variables

Required production controls:

```text
CHECKOUT_KILL_SWITCH=0
CHECKOUT_MODE=enabled
CHECKOUT_CANARY_PERCENT=100
CHECKOUT_CANARY_ALLOWLIST=
CHECKOUT_DISABLED_MESSAGE=Checkout is temporarily unavailable while we perform maintenance.

PAYPAL_RECONCILIATION_LIMIT=25
PAYPAL_RECONCILIATION_DAYS=14
PAYPAL_RECONCILIATION_TIMEOUT_MS=10000

UPTIME_TARGETS=https://your-domain.example/api/health/live,https://your-domain.example/api/health/ready
UPTIME_REGION=sin1
UPTIME_TIMEOUT_MS=8000
SLO_AVAILABILITY_PERCENT=99.9
SLO_P95_LATENCY_MS=1500
```

`CHECKOUT_KILL_SWITCH=1` overrides the database control and blocks new checkout mutations immediately. Existing PayPal capture completion remains available so an already-approved payment is not stranded.

## 3. Add scheduled jobs

`vercel.json` now includes:

- `/api/cron/reconcile-paypal-provider` at 04:15 UTC daily
- `/api/cron/monitor-uptime` every 10 minutes

For multi-region evidence, invoke the uptime cron from separate regional monitors or deployments and assign a distinct `UPTIME_REGION` value to each one.

## 4. Seed deterministic staging fixtures

Never run fixture scripts against production or while `PAYPAL_ENV=live`.

```bash
FIXTURE_ENV=staging \
FIXTURE_CONFIRM=COMEPLAYERS_STAGING_ONLY \
E2E_FIXTURE_PASSWORD='use-a-secret-from-your-vault' \
npm run fixtures:seed
```

The script creates or refreshes deterministic buyer, seller, and admin users, profiles, wallets, one active listing, and one pending order. It writes `e2e/fixtures.json`.

Generate Playwright auth states:

```bash
npm run e2e:auth
```

Cleanup:

```bash
FIXTURE_ENV=staging FIXTURE_CONFIRM=COMEPLAYERS_STAGING_ONLY npm run fixtures:cleanup
```

## 5. Run provider reconciliation

Use `/admin/operations` and click **Run provider check**, or call the protected cron endpoint with `Authorization: Bearer $CRON_SECRET`.

The provider check compares local PayPal capture ID, currency, amount, and acceptable provider state against the PayPal API. Results are stored in `paypal_provider_checks` and discrepancies route through operational alerts.

## 6. Run safe load tests

Non-mutating:

```bash
LOAD_BASE_URL=https://staging.example.com npm run test:load
```

Mutation testing is hard-gated to staging/test:

```bash
LOAD_BASE_URL=https://staging.example.com \
LOAD_ENVIRONMENT=staging \
LOAD_ALLOW_MUTATIONS=true \
LOAD_SCENARIOS_FILE=load-tests/mutation-scenarios.v20.example.json \
npm run test:load:mutations
```

Use disposable fixture data. Never set `LOAD_ENVIRONMENT=staging` for a production URL.

## 7. Validate

```bash
npm run typecheck:v20
npm run typecheck:e2e
npm run test
npm run lint
npm run build
```

Then run deployed Playwright smoke and authenticated critical journeys against staging.

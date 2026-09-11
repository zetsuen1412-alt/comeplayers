# ComePlayers V19 — Launch Readiness Installation

V19 adds a durable PayPal webhook inbox and replay flow, operational alert routing, tracked cron runs, an admin launch-readiness dashboard, Playwright test scaffolding, and a safe load-test runner.

## 1. Prerequisites

- V18 database migration is already applied.
- The deployment uses Node.js 22.
- PayPal remains in Sandbox while launch gates are incomplete.
- A generic HTTPS webhook receiver is available for operational alerts.

## 2. Apply the database migration

Run this file in the Supabase SQL Editor:

```text
scripts/comeplayers_launch_readiness_v19.sql
```

Verify with:

```text
LAUNCH_READINESS_V19_VERIFY.sql
```

The migration creates:

- `operational_alerts`
- `operational_runs`
- `payment_webhook_events`
- `launch_signoffs`

All four tables use RLS. Authenticated admins receive read access; writes remain service-role only through protected server routes.

## 3. Configure environment variables

Add the following server-only settings:

```bash
OPS_ALERT_WEBHOOK_URL=https://your-alert-receiver.example/hooks/comeplayers
OPS_ALERT_WEBHOOK_BEARER_TOKEN=optional-bearer-token
OPS_ALERT_MIN_SEVERITY=high
OPS_ALERT_COOLDOWN_MINUTES=30
OPS_ALERT_TIMEOUT_MS=8000
```

The alert receiver receives a JSON body containing `event`, `service`, `environment`, `severity`, `source`, `fingerprint`, `title`, `message`, `context`, `timestamp`, and a Slack-compatible `text` field.

Do not expose the alert URL or bearer token through `NEXT_PUBLIC_` variables.

## 4. Deploy and verify operations

After deployment:

1. Open `/admin/operations` with an administrator account.
2. Confirm the migration tables load without errors.
3. Run a financial reconciliation from `/admin/reconciliation`.
4. Confirm `/api/cron/reconcile-finance` creates an `operational_runs` row.
5. Send a test alert to the configured webhook receiver.
6. Confirm launch checks remain blocked until all manual sign-offs are passed.

## 5. PayPal webhook inbox and replay

Every verified PayPal event is registered by provider event ID before processing. Duplicate events already marked `processed` or `ignored` return idempotently. Concurrent duplicates receive a `202 processing` response.

Failed and ignored verified events can be replayed from `/admin/operations`. Processed events cannot be replayed through the UI to prevent duplicate customer notifications.

A replay:

- uses the stored verified payload
- increments the attempt count
- records the admin and replay time
- writes an admin audit entry
- routes a critical alert when replay processing fails

## 6. Automated tests

Install dependencies and the Chromium test browser:

```bash
npm ci
npx playwright install --with-deps chromium
```

Run unit tests and V19 targeted type validation:

```bash
npm run test
npm run typecheck:v19
npm run typecheck:e2e
```

Run public deployed smoke tests:

```bash
E2E_BASE_URL=https://staging.example.com \
E2E_START_SERVER=false \
npm run test:e2e:smoke
```

## 7. Authenticated critical journeys

Create deterministic buyer, seller, and admin accounts in a non-production Supabase project. Set their credentials only in the local shell or CI secret store:

```bash
E2E_BASE_URL=https://staging.example.com
E2E_BUYER_EMAIL=
E2E_BUYER_PASSWORD=
E2E_SELLER_EMAIL=
E2E_SELLER_PASSWORD=
E2E_ADMIN_EMAIL=
E2E_ADMIN_PASSWORD=
```

Generate local Playwright storage states:

```bash
npm run e2e:auth
```

Copy the fixture manifest template and replace IDs with deterministic staging records:

```bash
cp e2e/fixtures.example.json e2e/fixtures.json
```

Then run:

```bash
E2E_BASE_URL=https://staging.example.com \
E2E_CRITICAL=1 \
E2E_FIXTURE_MANIFEST=e2e/fixtures.json \
E2E_BUYER_STORAGE_STATE=playwright/.auth/buyer.json \
E2E_SELLER_STORAGE_STATE=playwright/.auth/seller.json \
E2E_ADMIN_STORAGE_STATE=playwright/.auth/admin.json \
npm run test:e2e:critical
```

Never commit `playwright/.auth` or real fixture credentials.

## 8. Load testing

The default runner only exercises health and public search endpoints:

```bash
LOAD_BASE_URL=https://staging.example.com \
LOAD_DURATION_SECONDS=30 \
LOAD_CONCURRENCY=10 \
LOAD_P95_THRESHOLD_MS=1500 \
LOAD_MAX_ERROR_RATE=0.01 \
npm run test:load
```

Custom scenarios may be provided through `LOAD_SCENARIOS_FILE` or `LOAD_SCENARIOS_JSON`. Mutation scenarios are skipped unless this explicit guard is enabled:

```bash
LOAD_ALLOW_MUTATIONS=true
```

Only enable mutations in an isolated staging project with disposable fixtures.

## 9. CI

`.github/workflows/production-readiness.yml` provides a manually triggered deployed smoke test and optional non-mutating load test. Configure the repository secret:

```text
E2E_BASE_URL
```

## 10. Rollback

Application rollback is safe because V19 tables are additive. Do not drop webhook inbox or alert rows during an incident; they are operational evidence. Roll back application code first, then retain the tables until the incident and audit review are complete.

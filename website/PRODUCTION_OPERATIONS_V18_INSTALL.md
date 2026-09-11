# ComePlayers V18 — Production Operations Install

V18 adds financial reconciliation, structured operational logs, automated tests, and a daily reconciliation cron.

## 1. Apply the database migration

Run this file in the Supabase SQL editor:

```text
scripts/comeplayers_production_operations_v18.sql
```

Then run:

```text
PRODUCTION_OPERATIONS_V18_VERIFY.sql
```

The migration creates:

- `reconciliation_runs`
- `reconciliation_issues`
- admin-only read policies
- service-role-only mutation boundaries
- indexes for request idempotency, status queues, entity lookup, and run history

## 2. Deploy the application

No new required environment variables are introduced. Existing production variables must still include `CRON_SECRET`, Supabase service-role credentials, and PayPal server credentials.

Vercel now runs:

```text
GET /api/cron/reconcile-finance
```

at `03:45 UTC` every day. Vercel supplies `Authorization: Bearer <CRON_SECRET>` for protected cron requests.

## 3. Validate application quality

```bash
npm ci
npm run typecheck
npm run test
npx eslint \
  lib/reconciliation.ts \
  lib/reconciliationServer.ts \
  lib/observability.ts \
  app/api/admin/reconciliation/route.ts \
  app/api/cron/reconcile-finance/route.ts \
  app/api/paypal/webhook/route.ts \
  app/admin/reconciliation/page.tsx \
  tests/reconciliation.test.ts \
  tests/observability.test.ts
npm run build
```

## 4. Run the first scan

1. Sign in with an admin account.
2. Open `/admin/reconciliation`.
3. Select a 7, 30, or 90-day window.
4. Run the scan.
5. Investigate every critical finding before changing money or order state.

The scanner never moves money automatically. It detects and records mismatches only.

## 5. Operational behavior

- Each scan has an idempotency key.
- Concurrent scans for the same window are blocked for 15 minutes.
- Findings are stable across runs using `scope_key + issue_key`.
- Ignored findings remain ignored but continue recording occurrences.
- Open findings that disappear are automatically resolved only after a complete, non-truncated scan.
- If a source reaches 5,000 rows, the run records the truncation and skips automatic resolution.
- Admin resolve/ignore/reopen actions are written to `admin_audit_logs`.
- Critical PayPal webhook and reconciliation events emit structured JSON logs with request IDs and sensitive-field redaction.

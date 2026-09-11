# ComePlayers V20 — Production Launch Checklist

## Automated launch gates

All checks on `/admin/operations` must pass:

- Supabase, PayPal, cron, encryption, payout, and security configuration is present.
- Alert routing is configured and tested.
- Financial reconciliation completed successfully within 36 hours.
- No open critical financial reconciliation issue remains.
- PayPal provider reconciliation completed within 36 hours with no mismatch or lookup error.
- 24-hour availability and p95 latency meet the configured SLO.
- No failed PayPal webhook or tracked operational run exists in the last 24 hours.
- No unacknowledged critical operational alert remains.
- Live checkout is disabled, in a controlled canary, or has final canary approval.
- Every manual sign-off is passed.

## Required evidence

- V20 migration and verification output.
- `npm run typecheck:v20`, E2E typecheck, unit tests, ESLint, and production build.
- Public and authenticated Playwright results from staging.
- Deterministic fixture seed and cleanup logs.
- PayPal Sandbox completed, duplicate, denied, refunded, reversed, webhook replay, and provider reconciliation cases.
- Non-mutating and isolated mutation load summaries.
- Multi-region uptime evidence and alert delivery test.
- Backup/restore drill reference.
- Legal, privacy, tax, prohibited-product, regional, support, security, and business approvals.

## Manual V20 sign-offs

The V20 migration adds:

- `staging_fixtures`
- `provider_reconciliation`
- `mutation_load_test`
- `slo_monitoring`
- `canary_launch`

A note or evidence reference is mandatory for passed or blocked status.

## Canary sequence

- deploy with environment kill switch enabled
- verify liveness/readiness and migrations
- disable checkout in database during live credential switch
- open at 10%
- verify provider, ledger, webhook, SLO, and support signals
- expand to 25%, then 50%
- pass `canary_launch`
- enable 100%

Follow `PRODUCTION_CANARY_RUNBOOK_V20.md` for rollback and recovery.

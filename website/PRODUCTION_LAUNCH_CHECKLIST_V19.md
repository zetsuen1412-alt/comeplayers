# ComePlayers V19 — Production Launch Checklist

## Automated blockers

All checks on `/admin/operations` must pass:

- Supabase public and service-role configuration is present.
- PayPal client credentials and webhook ID are present.
- Cron, delivery, payout, PIN, and security secrets are present.
- An operational alert destination is configured.
- A successful reconciliation completed within 36 hours.
- No critical reconciliation finding remains open.
- No PayPal webhook failed in the last 24 hours.
- No tracked cron operation failed in the last 24 hours.
- No unacknowledged critical operational alert remains.
- Every manual launch sign-off is passed.

## Manual sign-offs

Record evidence and approval in `/admin/operations` for:

- security review
- PayPal Sandbox validation
- backup and restore drill
- legal and policy review
- support and incident response readiness
- performance and capacity validation
- final business approval

A note or evidence reference is required for every `passed` or `blocked` status.

## Required test evidence

- `npm run test` passes.
- `npm run typecheck:v19` passes.
- `npm run typecheck:e2e` passes.
- Public Playwright smoke tests pass against staging.
- Authenticated buyer, seller, dispute, bulk import, and admin journeys pass.
- PayPal completed, denied, refunded, reversed, duplicate, failed, and replay scenarios are tested.
- Non-mutating load tests pass their p95 and error-rate thresholds.
- Mutation load tests are run only in disposable staging data.

## Sandbox-to-live sequence

1. Freeze feature changes.
2. Apply and verify every migration through V19.
3. Complete a fresh 90-day reconciliation.
4. Resolve or formally ignore every financial finding with evidence.
5. Confirm webhook inbox writes and replay behavior in Sandbox.
6. Confirm alerts reach the on-call channel.
7. Complete all manual sign-offs.
8. Take a database backup and record restore evidence.
9. Change PayPal credentials and webhook ID to live values.
10. Set `PAYPAL_ENV=live` only in the production environment.
11. Run a low-value controlled live transaction.
12. Verify order, provider capture, ledger, escrow, notification, and reconciliation records.
13. Keep an operator monitoring `/admin/operations` during the launch window.

## Immediate rollback triggers

- duplicate wallet debit or seller credit
- PayPal amount mismatch
- repeated webhook replay failure
- reconciliation critical issue after a live transaction
- alert delivery outage during launch
- failed restore or database integrity concern
- unexpected RLS/RBAC exposure

When triggered, disable new checkouts, return PayPal to Sandbox where appropriate, preserve webhook/alert evidence, and follow the production incident runbook.

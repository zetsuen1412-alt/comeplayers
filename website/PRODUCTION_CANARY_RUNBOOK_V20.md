# ComePlayers V20 — Production Canary and Rollback Runbook

## Before opening live checkout

- Apply and verify all migrations through V20.
- Keep `CHECKOUT_KILL_SWITCH=1` while deployment and database changes settle.
- Confirm `/api/health/live` returns HTTP 200.
- Confirm `/api/health/ready` returns HTTP 200 in the deployment environment.
- Collect uptime evidence from at least two regions where possible.
- Run financial reconciliation and PayPal provider reconciliation.
- Resolve every critical mismatch and provider lookup error.
- Seed staging fixtures, run authenticated Playwright journeys, and clean fixtures.
- Run isolated mutation load tests for checkout, chat, and bulk listing import.
- Test the alert destination and on-call escalation path.
- Record all V20 sign-offs in `/admin/operations`.

## Controlled rollout

1. Set `PAYPAL_ENV=live` only after all automated and manual launch gates pass.
2. Keep the database checkout control `disabled` during the credentials switch.
3. Remove the environment kill switch only after the new deployment is healthy.
4. Set checkout to `canary` at 10%.
5. Observe for at least one full monitoring interval and verify:
   - payment capture and provider reconciliation
   - wallet and escrow ledger consistency
   - webhook inbox and replay status
   - error rate and p95 latency
   - support contacts and seller delivery flow
6. Increase to 25%, then 50%, only when the previous cohort remains clean.
7. Set 100% only after the canary launch sign-off is passed.

The cohort is deterministic per user ID. A user remains in the same allocation while the percentage changes.

## Emergency stop

Fastest stop:

```text
CHECKOUT_KILL_SWITCH=1
```

Then redeploy or refresh the runtime environment according to the hosting platform. The admin database control can also be set to `disabled`, but the environment switch has precedence.

The stop applies to:

- marketplace order creation
- PayPal checkout initiation
- wallet order payment

It deliberately does not block completion of a PayPal capture already approved by the buyer.

## Rollback triggers

Immediately stop new checkout when any of these occur:

- duplicate debit, credit, capture, or payout
- local/provider PayPal amount or currency mismatch
- unexplained provider status transition
- critical financial reconciliation finding
- repeated webhook processing or replay failure
- availability below the configured SLO
- p95 latency above the threshold for two monitoring windows
- RLS/RBAC exposure or secret leakage
- database integrity or restore concern

## Evidence preservation

Do not delete or rewrite:

- `payment_webhook_events`
- `paypal_provider_checks`
- `reconciliation_runs` and `reconciliation_issues`
- `operational_alerts` and `operational_runs`
- `uptime_checks`
- `admin_audit_logs`

Record the incident timeline, control changes, request IDs, affected order IDs, provider capture IDs, and remediation evidence.

## Recovery

1. Keep checkout disabled.
2. Reconcile affected orders and provider captures.
3. Correct data only through reviewed, idempotent repair procedures.
4. Verify wallet arithmetic, escrow, refunds, notifications, and seller payout state.
5. Run unit, E2E, reconciliation, and targeted load tests.
6. Reopen at 10% canary, not 100%.

# ComePlayers V18 Production Runbook

## Daily checks

1. Confirm `/api/health` is healthy.
2. Confirm the latest reconciliation run is `completed`.
3. Review critical and high findings in `/admin/reconciliation`.
4. Review failed PayPal webhook logs by request ID.
5. Review pending/processing withdrawals and active disputes.

## Critical reconciliation response

For every critical finding:

1. Do not manually edit balances immediately.
2. Open the linked order, wallet transaction, PayPal capture, or withdrawal.
3. Compare provider records with `orders`, `paypal_transactions`, `wallet_transactions`, and `admin_audit_logs`.
4. Preserve screenshots, provider references, timestamps, and request IDs.
5. Decide whether the source of truth is the provider or the internal ledger.
6. Apply corrections through an approved RPC/API, never through an unreviewed browser-side database mutation.
7. Run reconciliation again.
8. Resolve the finding with a precise note and external reference.

## PayPal webhook incident

- Search structured logs for `paypal.webhook.failed`, `paypal.webhook.invalid_signature`, or the response `x-request-id`.
- Verify `PAYPAL_ENV`, server credentials, webhook ID, and PayPal webhook delivery history.
- Re-send the provider event only after confirming the event ID and amount.
- Run a 7-day reconciliation scan after recovery.

## Reconciliation cron failure

- Verify `CRON_SECRET` and the Vercel cron execution log.
- Call the admin scan manually; do not expose the cron URL without its bearer secret.
- A failed run remains in history with `error_message`.
- A scan blocked by a recent `running` run should be investigated before deleting or changing records.

## Database backup and restore drill

Before real-money launch, perform this drill in a non-production project:

1. Create a Supabase backup or logical dump.
2. Record the backup timestamp and application release.
3. Restore into an isolated project.
4. Apply all repository migrations through V18.
5. Compare row counts for orders, wallets, wallet transactions, PayPal transactions, withdrawals, disputes, and reconciliation tables.
6. Run a 90-day reconciliation scan.
7. Verify admin login, one buyer order, one seller payout, and one withdrawal history.
8. Store the drill result, duration, owner, and any data-loss window.

## Go-live gates

Real money remains blocked until all of these are verified in the deployed environment:

- RLS/RBAC review
- PayPal webhook verification and replay test
- 90-day reconciliation with no unexplained critical findings
- backup/restore drill
- end-to-end buyer, seller, dispute, refund, and withdrawal tests
- alert ownership and incident escalation
- legal and prohibited-product review

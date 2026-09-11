# ComePlayers V21 Post-Launch Compliance Runbook

## Daily review

1. Open `/admin/operations` and confirm the V21 launch gates pass.
2. Open `/admin/compliance` and review high/critical policy items first.
3. Confirm the latest settlement report is `matched` and contains evidence lines.
4. Check failed or overdue privacy deletion requests.
5. Review commerce conversion, gross volume, tax collected, marketplace fees, delivery p95, disputes, and support volume.

## Product-policy incident

- Keep matched listings inactive while evidence is reviewed.
- Approve only when the listing content and game/platform rules are acceptable.
- Reject prohibited listings with a specific note; the seller receives a policy strike.
- A seller edit that passes automated screening supersedes the stale pending review but does not silently republish an out-of-stock listing.
- Escalate repeated or critical strikes through the existing seller/risk administration workflow.

## Tax incident

- Do not edit historical invoice snapshots.
- Deactivate an incorrect rule and create a new effective-dated rule.
- Pause checkout with the V20 kill switch when the error can materially affect customer totals.
- Identify unpaid orders created under the wrong configuration and recreate them after correction.
- Handle paid-order corrections through documented accounting/refund procedures; do not recalculate paid orders in place.

## Privacy deletion failure

- Failed deletions are launch blockers.
- Inspect `failure_reason` in `/admin/compliance`.
- Correct the external/schema problem and use **Retry**.
- Confirm the auth user is soft-deleted, profile and payout destinations are scrubbed, chat content is removed, and required financial/audit records remain pseudonymized.
- Never manually mark a request completed without evidence.

## Settlement mismatch

- Compare the report lines with `paypal_provider_checks` and local `paypal_transactions`.
- Confirm capture gross, PayPal fee, provider net, and local gross.
- Reports use the latest provider check per capture and treat zero evidence as `insufficient_data`.
- Keep provider-settlement sign-off blocked until a fresh report is matched.
- Escalate unexplained deltas as a financial incident and consider disabling checkout.

## Fraud feedback

- Dispute outcomes generate idempotent buyer/seller risk feedback.
- Review score changes together with original dispute evidence; do not use a score as the sole basis for irreversible enforcement.
- Correct erroneous dispute outcomes before applying manual risk overrides.

## Account retention

Financial, invoice, tax, dispute, fraud-prevention, and audit records are retained in pseudonymized form where operational or legal obligations require them. Document the actual retention schedule and jurisdictional basis before production launch.

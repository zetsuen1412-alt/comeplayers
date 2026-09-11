# ComePlayers V23 Finance Governance Runbook

## Rate changes

- Create proposals in `/admin/compliance`.
- Attach a policy/legal source and business reason.
- The requesting admin cannot approve.
- A second and third distinct admin action completes the two approvals.
- Never edit active rate rows directly in production.
- Confirm a test order created before the effective time keeps the old snapshot and a test order created after it receives the new snapshot.

## Seller tax residency

- Seller submits country, legal name, encrypted tax identifier, residency date, and evidence reference at `/seller/tax-profile`.
- Admin verifies evidence outside the public UI before marking `verified`.
- Never put a full tax identifier into notes, logs, screenshots, or audit metadata.
- Resubmission returns the record to `pending`.

## Accounting close

1. Open the YYYY-MM accounting period.
2. Resolve duplicate, missing, or mismatched seller-tax ledger entries.
3. Confirm all payout terminal states and settlement reports.
4. Close the period from `/admin/compliance` after its end timestamp.
5. Closing generates and freezes seller statements for every seller/currency represented in the tax ledger.
6. Do not reopen or rewrite a closed period without a separately reviewed corrective migration.

## FX

- Record provider, source reference, and effective timestamp.
- Do not overwrite historical FX rows.
- Verify the payout request stores source amount/currency, payout amount/currency, rate, and source FX row.
- Identity conversion uses rate 1.

## PayPal provider payout

- Approve the withdrawal only after risk, hold, tax rule, FX, and residency checks pass.
- Use **Execute PayPal Payout** once. The sender batch ID is deterministic for retry safety.
- Use **Sync PayPal Status** to retrieve provider evidence.
- Mark seller wallet withdrawal paid only after the provider reaches a successful terminal state.
- Failed/returned payouts must restore the full wallet source amount; the tax ledger is recognized only for paid payouts.
- Provider fee is a platform expense unless a future policy explicitly changes seller pricing and snapshots that change before submission.

## Incident response

- Disable checkout or provider payout execution when evidence is inconsistent.
- Preserve PayPal response payloads, payout attempt rows, audit log, withdrawal snapshot, and accounting period state.
- Do not manually change seller wallet balances without an audited compensating transaction.
- Re-run reconciliation before clearing the incident.

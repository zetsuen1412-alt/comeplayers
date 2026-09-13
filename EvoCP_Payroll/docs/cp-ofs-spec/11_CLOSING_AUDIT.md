# Closing, Adjustments, and Audit

## Closing lifecycle

Open -> Checking -> Ready -> Closed. Optional `Reopened` state records controlled reopen without erasing original close history.

## Prepare closing

Runs all configured deterministic checks and records totals/check results plus a snapshot hash. Typical checks: order completeness, amount/quantity reconciliation, payment reconciliation, worker earning consistency, payroll state, journal balance, vendor/inventory reconciliation if enabled, unresolved critical issues.

## Close

Close requires current snapshot, zero hard blockers, completed required approvals, and correct permissions. Transaction locks the period, revalidates snapshot, writes final totals, closes period, and audits the event.

## Closed-period behavior

Direct edits to finance-sensitive records inside the closed business-date range are rejected. Correct through formal adjustment/reversal/reopen workflow.

## Non-bypassable blockers

- unbalanced journal
- over-allocation/over-completion
- critical amount mismatch
- unresolved canonical identity affecting payroll/accounting
- invalid payroll double inclusion
- inconsistent payment over-match

## Adjustments

Adjustment records reason, entity, amount delta if monetary, original business date reference, current adjustment business date, requester, approver, journal link, and status. Approved handler creates the proper correction events; it does not run arbitrary SQL patches.

## Reversal

Reversal produces a new journal with opposite debit/credit. Original remains visible and links to reversal/replacement.

## Audit

Append-only audit records all sensitive actions. Audit before/after payload is sanitized to remove secrets/tokens/passwords/recovery codes.

## Reopen

Restricted high-risk action requiring reason and approval. Reopening does not permit editing posted journals; it only enables formal corrections within an explicitly reopened period according to policy.

## V2 closing integration

Closing may include:
- inventory valuation snapshot;
- material unresolved stock reconciliation;
- vendor receipt/payable mismatch;
- orphan reservation;
- worker completion without expected earning;
- fulfillment source mismatch.

Not every operational warning blocks finance. Blocking policy must distinguish material financial integrity from ordinary workload/SLA warnings.

A system incident is not the same as a closing issue, but an open material incident may prevent close if finance integrity cannot be demonstrated.

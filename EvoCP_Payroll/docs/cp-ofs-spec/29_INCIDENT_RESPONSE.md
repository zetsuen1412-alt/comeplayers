# Incident Response

## Incident versus Finance Issue

Finance issue:
a record/data problem such as X1465 mismatch.

Incident:
a system-level failure such as duplicate earning generator, cross-org leak, failed migration, or unavailable finance database.

One incident may cause many finance issues.

## Incident lifecycle
`open -> investigating -> mitigated -> monitoring -> resolved`

## Immediate controls
Depending on severity:
- disable finance mutations;
- disable payroll mutations;
- disable inventory mutations;
- enable broader maintenance mode;
- preserve read-only investigation.

Safety switches are restricted/audited.

## Incident timeline
Record detection, mitigation, root cause, deployment/fix, reconciliation, recovery, and resolution.

## Post-incident reconciliation
Before re-enabling sensitive writes:
- finance checks;
- duplicate earnings;
- payment reconciliation;
- journal integrity;
- payroll;
- closing;
- inventory;
- security review if applicable.

## Severity examples

P0:
- cross-organization data exposure;
- payroll duplication;
- posted-ledger corruption;
- destructive finance authorization bypass.

P1:
- reconciliation failure with material exposure;
- repeated earning generation failure;
- migration corruption before cutover.

## Postmortem
For material incidents document:
- impact;
- detection gap;
- root cause;
- immediate fix;
- permanent preventive action;
- test/monitor added.

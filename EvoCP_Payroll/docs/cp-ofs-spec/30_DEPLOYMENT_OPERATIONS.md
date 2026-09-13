# Deployment & Production Operations

## Environments
`LOCAL -> PREVIEW/STAGING -> PRODUCTION`

Production data should not be copied raw into local development. Use sanitized fixtures where needed.

## Feature flags
Feature availability examples:
- finance_system_v1
- inventory_v1
- ai_auditor
- auto_assignment

## Safety switches
Separate, high-restriction controls:
- finance_mutations_enabled
- payroll_mutations_enabled
- inventory_mutations_enabled

Do not treat safety switches as casual experiments.

## Migration flow
Local migration/tests -> staging migration -> integrity tests -> verified recovery plan/backup -> production.

High-risk change: use expand-and-contract.

## Rollback
Application deployment may be rolled back to a known-good build. Database schema/data rollback is not automatically safe; use forward fix, expand/contract compatibility, or planned recovery according to incident.

## Production rollout
Suggested stages:
0. read-only/demo
1. Owner + finance test users
2. selected FH/workers
3. all internal operations
4. finance/payroll primary
5. spreadsheet read-only archive
6. marketplace automatic integration

## Parallel run
Compare CP-OFS with legacy reports for multiple periods. A difference is acceptable only when explained and resolved/classified; CP-OFS may correctly expose legacy errors.

## Cutover
Define a business cutover timestamp/date. Freeze legacy transaction entry, capture final legacy balances, import approved opening balances/lineage, and begin CP-OFS as primary source.

## Production readiness
Required before primary finance cutover:
- P0/P1 = zero;
- core regression tests pass;
- RLS/security pass;
- closing/payroll test passes;
- verified backup/restore test;
- monitoring active;
- incident runbook;
- safety switches;
- schema/deployment version tracking.

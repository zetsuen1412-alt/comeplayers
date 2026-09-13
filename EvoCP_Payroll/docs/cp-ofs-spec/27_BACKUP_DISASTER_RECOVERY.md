# Backup & Disaster Recovery

## Principle
A backup is not considered trusted until restore has been tested.

## Protected domains
- PostgreSQL data/schema;
- private storage evidence/receipts/import files;
- source code/migrations;
- secret/vault configuration through its own supported recovery mechanism.

## Initial targets
Suggested starting targets subject to actual Supabase plan/capability:
- RPO <= 24h initially;
- mature target tighter where business value justifies it;
- RTO <= 4h target for critical internal service.

Do not promise provider capabilities that M0/M18 has not verified.

## Backup layers
Prefer:
1. provider/platform backup;
2. scheduled logical backup;
3. periodic off-platform copy.

## Confidentiality
Backups contain payroll/bank/customer/audit data and are highly confidential. Encrypt at rest, restrict access, log access.

## Manifest
Track:
- backup ID/time;
- schema/migration version;
- app commit/deployment;
- DB success;
- storage success;
- checksum where applicable.

## Restore test
Restore into isolated environment, then run:
- migration compatibility;
- journal balance;
- payroll integrity;
- closing snapshot checks;
- payment matching integrity;
- inventory movement/balance reconstruction;
- audit accessibility.

## Human error
Use business correction/reversal for individual mistakes. Do not restore an entire production database because one user entered a wrong amount.

## Catastrophic recovery
Use restore for corruption, destructive migration failure, provider/data loss, or similarly catastrophic events.

## Migration safety
High-risk schema changes require staging rehearsal, backup/recovery plan, and expand-and-contract where practical.

## Runbook
Detect -> freeze sensitive writes if required -> identify last known-good state -> restore/repair in isolation -> validate -> cutover/recover -> full reconciliation -> resume writes.

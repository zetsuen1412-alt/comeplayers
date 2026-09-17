# Admin-only bulk mutation reset

The owner requested a feature to delete all data shown in Payroll > Mutasi. Adding and deploying the feature does not execute a deletion. No production reset was invoked during implementation.

## User operation

On /admin/payroll/mutations, an administrator sees Hapus Semua Mutasi at the top of the page. Opening it only flushes pending edits and reads a server preview. The dialog states that the scope is ALL active orders, across ALL dates and sources, not just the visible filter. It displays the exact order count, total value and any unpaid payroll-ready count. The administrator must type HAPUS SEMUA MUTASI, tick the acknowledgement and press the final delete button. Cancel, Escape and ordinary page opening do not delete data.

The reset removes active order records used by Mutasi and Penjualan and recalculates pending payroll from the remaining data. Employee records, Product/Game catalog, kasbon, payroll settings, inventory, movements, historical closing records and edit history are unchanged. It does not transfer money, pay wages or run Closing. This is removal from active views, NOT permanent erasure of private backups and source archives.

## Backup and restrictions

The server commits a private before-state backup, imported source batch snapshots, attributed workspace audit, revision increment and deletion in one PostgreSQL transaction. A failed backup aborts the entire change. An administrator can download the resulting .json.gz backup through the authenticated API. The UI lists the latest five reset backups. Backup download is provided; there is no automatic one-click restore.

A locked workspace or ANY order associated with a closing, inventory allocation, consumed stock, linked warehouse movement or reconciled/matched payment blocks the entire bulk operation. These dependencies must be reviewed rather than silently changing inventory or paid payroll. Unpaid verified orders without those dependencies may be removed; their count and impact on pending payroll are disclosed.

Applied import batches are marked cleared, not deleted, within the same transaction. Their original source archive remains and the dedicated importer can accept the same packet again after an intentional reset. The import hash checks and original mapping rules are unchanged.

## Concurrency and security

The API verifies the authenticated user's administrator role and the database repeats that check under the existing per-actor advisory lock. PostgreSQL checks the exact typed confirmation, expected revision and count while holding the workspace row lock. Each reset has an idempotency UUID: retrying the same request never deletes orders created afterwards. A stale preview is rejected. The client blocks concurrent local edits until the server result is adopted and dispatches the existing storage notification to update all views. Ordinary workspace autosaves now reject order removals so they cannot bypass the audited admin operation. Direct anonymous/authenticated RPC access and backup table access are revoked; server-only access is retained.

## Verification

Preparation Actions run 35238212099 / job 105259540229 passed the full website TypeScript check, all 36 reset/manual-date/import regression tests, the real reset migration in an isolated PostgreSQL database, and isolated desktop/mobile browser tests. Database tests cover authorization, confirmation, stale revisions/counts, all dependency guards, backup-failure rollback, exact preservation of unrelated data, import archive retention, attributed audit integration, idempotency and privileges. Browser fixtures cover explicit approval, cancellation, wrong/missing confirmation, non-admin visibility, a locked workspace, stale data, private backup download and recovery from an uncertain response without a second reset request. Fixtures use no production data or credentials. Live deployment and authenticated production deletion are separate checks; do not execute a live reset merely to test the feature.

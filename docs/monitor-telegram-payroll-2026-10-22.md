# Monitor Android 1.6 / Windows 1.7 — Telegram FH3 and employee earnings

Only new authored posts by the verified, numerically pinned @evogamings account
in the bound FH3 group supply the order reference and TASK. Sheets → Payroll
remains disabled. Existing Payroll, employee, salary and Closing data are retained.

## Operational flow

1. Both clients poll while running. Choose an active FH3 employee and an order,
   then confirm TAKE. Merely selecting a row never assigns work.
2. If the order already has a unique Payroll record, use its existing locked
   assignment transaction. If it has no Payroll record, create only a private
   `cp_fh3_monitor_jobs` operational journal entry. It contains no price or salary.
3. The backend sends `order/employee/take` once. START remains disabled until the
   TAKE delivery is confirmed. A definite rejection permits a deliberate retry;
   `sending`/`unknown` requires reconciliation, not automatic resend.
4. Select a PNG/JPEG screenshot (maximum 7 MB), confirm START, then confirm DONE
   with the final screenshot. START replies to TAKE; DONE replies to START.
   The corresponding state changes only after Telegram acknowledges the report.
5. Unpriced work is recorded against the stable employee ID/code and appears in
   their work history. It does not create a zero-price sale or a payout. An admin
   enters and verifies the actual priced Payroll record. Matching reference and
   employee code then connect the financial history without counting work twice.

The app shows only the next allowed action and disables stale/ambiguous actions.
The database independently enforces the source, employee, group, order sequence,
and delivery claim. Changing groups cannot reuse TAKE/START from the old group.
Employee identities referenced by operational jobs cannot be removed or replaced;
renaming or deactivating the same employee remains possible.

## Payroll view

The owner requested visibility to everyone using Monitor. The earnings endpoint
therefore permits **all authenticated Payroll members**, including non-admins.
It is not a public endpoint. Existing admin-only assignment/report permissions
remain enforced. No credentials or other customers' account details are returned.

The server reuses Website Gaji's `buildLivePayrollRows`: employee share,
operational cost, penalties, bonuses/tips and advance deductions. DONE is not
automatic verification. Immutable Closing snapshots are shown as **booked**,
not proof of payment. Unpriced jobs show an explicit count; their income is not
invented. Work history is paginated in stable 100-row pages.

Salary data stays in client memory; it is not written to Android SQLite/JSON
backups or Windows local status files. Logout invalidates late reads and token
refreshes. The existing encrypted session stores remain Android Keystore and
Windows DPAPI CurrentUser. Bot/service-role credentials remain server-only.

## Builds and installation

- Windows source was recovered from the original unmerged
  `feature/cp-boost-monitor-windows-v1` branch at `a4063ee`. Only its native source,
  tests and workflow were imported; its old backend was not substituted for main.
- Windows 1.7 is a self-contained x64 EXE/ZIP. Close the old app before opening the
  new one. The same `%LOCALAPPDATA%/ComePlayers/CPBoostMonitor` files are retained.
- Android 1.6 uses package `id.comeplayers.boostmonitor.fh3`. The old published
  debug certificate differs from the local new build, and its private signing
  key is unavailable. This package installs alongside 1.5, without uninstalling
  it. Export old local status history and import it if desired. Server Payroll
  and work history are loaded after login.
- Future publication of the same Android package must use its original signing
  key. CI refuses to replace a published package with a different certificate.
  Never delete user data to work around signing. Current binaries are internal
  builds; Windows is not code-signed and Android is not a Play Store release.
- GitHub Actions builds/tests both native clients; publication happens only from
  main. The Android website download/ZIP/hash and version metadata are committed
  together from the exact verified build. Windows publishes a separate release.

## Deployment order and rollback

1. Verify the PR's backend, PGlite, Android and Windows tests. Back up current
   Payroll, staff, Closing and function definitions privately in the database.
2. Apply `20261022093000_fh3_monitor_delivery_consistency.sql`, then
   `20261022100000_fh3_monitor_operational_jobs.sql`, then
   `20261022103000_fh3_monitor_job_permissions.sql` (removes inherited default
   service-role DELETE/TRUNCATE privileges). The journal migration adds an empty
   private operational journal, protects its employee references, and routes
   only journal-backed work through the new RPC branch. It does not backfill or
   reset financial records. The underlying financial RPCs remain available only
   through their guarded wrappers.
3. Deploy the backend. Confirm anonymous requests still fail, Sheets still
   returns 410, source binding remains pinned, and financial snapshots match.
4. Publish the native builds; verify asset hashes, package/version and final
   website deployment. Update the existing webhook only if its allowed updates
   changed (this release keeps the already installed settings).
5. On an authorized real job, the operator selects the actual employee and
   confirms TAKE/START/DONE. Do not invent client work or post fake customer
   reports merely to claim an end-to-end test. Physical device/operator QA is
   distinct from automated HTTP/database tests and compiler success.

Rollback must retain operational jobs, delivery claims, employee references,
proofs and financial snapshots. Reverting the web deployment alone does not
revert SQL wrappers. Reconcile `sent`/`unknown` claims before restoring functions;
never clear them to force another Telegram message. Keep Sheets disabled.

## Verification notes

Local builds/tests and release status are recorded in the task's final report.
The PostgreSQL fixture covers a Telegram-only job through TAKE → START → DONE,
replies, first-writer assignment, unknown delivery, employee retention, RLS and
unchanged financial workspace/revision. The earnings fixture verifies no salary
before explicit priced verification and no duplicate work afterward.

Ten older DAY test failures used source rows 5000, now correctly archive-only
under the X2754 boundary. Their current-work fixtures now derive rows from
`FH_NEW_BOOK_ROW`; production salary/Closing rules were not loosened. Dedicated
pre-X2754 tests still verify that old work cannot be paid again.

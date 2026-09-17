# Manual payroll order date and time

Owner request: change the read-only server-controlled day/date on Tambah Pesanan to manual entry so historical orders can use their original spreadsheet timestamps.

## Behavior

The entry form at /admin/payroll/orders and /admin/payroll/orders/new now uses an editable datetime-local field labelled Hari, tanggal & jam pesanan (WIB). Day names are derived from the chosen date. The initial value is filled once after hydration; it never polls the server clock. A separate Gunakan waktu sekarang button explicitly resets the value to the current WIB time. Manual dates remain selected after a successful save for consecutive historical entry.

The minute-precision value is interpreted with an explicit +07:00 offset, regardless of device timezone. The existing due-date rule is preserved: selected order time plus 24 hours. Empty, malformed, and nonexistent calendar dates are rejected before any order or inventory mutation. The selected timestamp is captured before asynchronous persistence and is not replaced during submission. The date field is disabled while saving.

## Scope and safeguards

Existing order-code uniqueness, game/region/server choices, worker allocations, stock requirements, workspace locking, closing protections, and server-attributed audit timestamps are unchanged. This release changes no database schema or existing records and does not import a workbook, pay wages, or run Closing. The MUTASI FH V2 import link and all prior import code remain intact. Historical bulk imports still use the dedicated import page, not manual order creation without stock.

## Verification

GitHub Actions run 35231887900, job 105237829920 succeeded. The full website TypeScript check passed. All 23 tests passed: 11 manual-time/form/workspace/lock/audit checks and the existing 12 MUTASI FH V2 regression checks. Real OrderEntryForm browser tests passed with isolated storage hooks at desktop Asia/Jakarta and narrow-screen America/Los_Angeles timezones. They checked manual past dates, displayed weekdays, no refresh after advancing two minutes, explicit reset-to-now, empty-date rejection, disabled date during save, exact stored UTC timestamp and due date, preserved selection, and the unchanged missing-stock rejection. No production credentials or data were used by the browser fixtures.

Example tested: 8 September 2026 at 04:05 WIB is saved as 2026-09-07T21:05:00.000Z and displays again on 8 September in WIB. Production deployment and authenticated production interaction are separate from the isolated browser tests. Temporary preparation scripts/workflow are excluded from this release tree.

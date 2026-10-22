# Windows Monitor 1.8 — Order Selesai and dimensional UI

The owner requested replacing the Monitor Payroll screen with completed order
counts and lists per employee, and a polished futuristic 3D appearance. The owner
confirmed that counts must include **only Telegram orders with confirmed DONE
reports from Monitor**, excluding older website-only completions.

## Completed orders

`GET /api/admin/payroll/mobile/completed` is read-only and available to existing
authenticated Payroll members. It returns team totals and employee counts. Select
`employeeCode` for stable 50-order pages. Unknown workers return 404; incomplete
evidence reads fail closed. No wages, prices, bonuses, deductions, buyer account
details or credentials appear in this response.

The bound FH3 group and pinned sender select source receipts. A DONE proof must
be sent, have a Telegram message ID and timestamp, and match that group/employee.
For journal jobs, the completed state and stable employee ID must also match.
For older Monitor work backed by a financial order, the unique completed/verified
assignment must match. Each reference counts once. Archiving a source preserves
the already-confirmed completion history.

Payroll data, Closing and the legacy earnings endpoint remain available to the
website and installed older clients. Windows 1.8 never calls that endpoint. No
database migration or backfill is needed. TAKE/START/DONE write paths are unchanged.

## Interface

The Windows shell uses an expanded sidebar, a dimensional orb and isometric cube,
layered cards, beveled highlights, soft shadows, cyan/violet accents, animated
button hover transitions and dark custom scrolling. The completed view shows team
totals, an employee list and a selected worker's orders with local completion times.
Order evidence opens its fixed-format Telegram message link. Keyboard selection,
scroll keys, search, paging, loading, empty and error states remain available.

The offline Preview project renders the real WinForms controls with synthetic
data at large and small window sizes. It uses isolated nonexistent session/status
paths, disables authentication, timers and tray notifications, and never reads an
operator's saved session or posts to Telegram. Transparent non-activating windows
provide native control layout for bitmap rendering. Sample counts are **not live
employee performance**. Preview output is separate from the production ZIP.

## Installation and rollout

Build/test the website endpoint and Windows client, then merge the reviewed PR.
Vercel deploys the endpoint and download page; the Windows workflow publishes
`evogaming-monitor-windows-v1.8-completed-orders-3d`. Verify the release digest.
Close the old Windows app, extract the new ZIP and run EVOGAMINGMonitor.exe. DPAPI
session and local status files retain their existing paths and formats.

This release targets Windows, matching the supplied screenshot. Android 1.6 and
its installed signing identity are unchanged. No production trial orders or fake
DONE reports are created to populate the new screen. Until an actual Monitor
DONE exists, zero counts and the empty state are expected.

Rollback to the prior Windows build and website deployment requires no data
rollback. Keep Sheets disabled; do not delete journal, proof or financial records.

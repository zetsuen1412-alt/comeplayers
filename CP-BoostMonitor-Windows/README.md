# EVOGAMING Monitor — Windows

Native WinForms application for Windows 10/11 x64, packaged with .NET 8.

## Use

Download the current **EXE** or **ZIP** at
https://www.comeplayers.com/admin/payroll/boost-monitor . Both Windows downloads
contain the same application. Close the old Monitor before running the new EXE;
existing login and local history remain in place. The page also provides the
existing Android APK as a separate platform download.

Current accounts, wages, Tutup Buku and notifications: [release guide](../docs/monitor-accounts-closing-2026-10-24.md).

Log in using a ComePlayers username. Admins manage staff account bindings;
employees can operate their own work. Take Order shows employees by
name, new orders and active tasks. Select a worker and an order, then confirm TAKE.
START and DONE require a screenshot and confirmation before sending to Telegram.
Only verified direct @evogamings posts in the configured FH3 group supply orders
and TASK. Order Selesai shows only Telegram orders with confirmed DONE from Monitor.
Data Tutup Buku shows net wages entered by admins and immutable closing snapshots.
Existing website Payroll financial data stays separate.

Admins can select an order in **Order Baru** or **Tugas Aktif** and click the
**Hapus Order** button in the same panel. No separate worker selection is required.
Review the order and enter a reason
in the confirmation dialog. The app uses the current server control version and
refreshes the queue after confirmation. Deletion archives the order; restore it
through **Kelola Order → Pulihkan**. Employees do not see the delete action.
Windows 2.0.2 adds the active-task button using the same management API and needs
no new database migration. The active task's TAKE/START/DONE history is retained.
Sending or uncertain Telegram deliveries must be reconciled before archiving;
restoring the archive allows the retained work to continue.

The **Discord** column in new orders, active tasks and completed work uses the
verified Telegram metadata (Discord, Discord Server or DC Server). Discord names
are searchable. Older receipts have no recoverable Discord value because raw
credential-bearing captions were never retained; they display a dash until a
verified admin edit or repost supplies the field. Apply the additive Discord
receipt migration before deploying the updated webhook/API.
The existing Android APK also displays Discord in the order title after this API
update, without reinstalling or changing its signing identity.

## Local status and sleep

After Telegram confirms TAKE, Ready Boosting or Farming changes automatically
to **Sedang Bekerja**. Fresh active tasks also reconcile confirmed TAKE from other
devices when the app refreshes. Failed, missing or uncertain TAKE never changes
status. Existing Work status is idempotent, and manual Sleep/Break/Offline is
preserved. Each automatic change is recorded once in local history with its order
reference. This update does not automatically return employees to Ready on DONE;
the operator still changes status after the work ends.

Status changes apply to this Windows PC. Choosing **Tidur** records the start
instant immediately after confirmation. The status column displays elapsed
**hours:minutes:seconds**, refreshing every second. Hours can exceed 24.
There is no duration selector, deadline or automatic return to Ready.

The clock continues across app restarts, including time while the app is closed.
Selecting Tidur again does not reset it. Changing to another status ends that
sleep period and records its duration in local history and CSV exports.

Older snapshots retain their original start timestamp; previous auto-Ready flags
and deadlines are ignored. An old sleep event can recover a missing start. If
neither source exists, the UI says the start was not recorded instead of inventing
one. Unreadable history files are not overwritten by new status changes.

Employee codes remain internal identity keys but are hidden from tables and
selection labels. The interface follows Telegram light colors: white panels, a pale gray-blue
background, blue actions and selection, and dark blue navigation.

## Storage and safety

- DPAPI-encrypted session: `%LOCALAPPDATA%\ComePlayers\CPBoostMonitor\session.dat`.
- Local status/history: `%LOCALAPPDATA%\ComePlayers\CPBoostMonitor\local-status.json`.
- The additive Discord receipt migration does not change Payroll, salary, employees or Closing.
- No synchronization of PC sleep status to Android or other PCs.
- Backend credentials and Telegram bot tokens are never shipped in the EXE.
- TAKE/START/DONE require live server access; ambiguous delivery is never retried automatically.

## Build and verify

```powershell
dotnet run --project CP-BoostMonitor-Windows.Tests/CPBoostMonitor.Windows.Tests.csproj -c Release
dotnet run --project CP-BoostMonitor-Windows.Preview/CPBoostMonitor.Windows.Preview.csproj -c Release -- dist/monitor-ui-preview
dotnet publish CP-BoostMonitor-Windows/CPBoostMonitor.Windows.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:PublishTrimmed=false -o dist/windows
```

The preview renderer uses synthetic data and isolated paths, with no login,
network requests, tray icon or operational Telegram reports. CI verifies the
native app and publishes EXE/ZIP from main only. Releases are unsigned.
Official publisher signing is being prepared; see the
[certificate setup and verification guide](../docs/monitor-windows-code-signing.md).
Its verifier is tested in CI but is not yet connected to production publication.
The single-file runtime is compressed and smoke-tested with `--verify-package`,
which uses isolated preview paths without opening a user session or contacting
Telegram. CI mirrors the exact release binaries to website downloads, keeping
the private GitHub repository inaccessible to app users. Both files stay below
95 MB, use attachment headers and publish with source commit/SHA-256 metadata.
CI then downloads them anonymously from production and checks their bytes.
Earlier design notes remain in `docs/` as historical documentation.

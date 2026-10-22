# EVOGAMING Monitor — Windows

Native WinForms application for Windows 10/11 x64, packaged with .NET 8.

## Use

Download the current **EXE** or **ZIP** at
https://www.comeplayers.com/admin/payroll/boost-monitor . Both Windows downloads
contain the same application. Close the old Monitor before running the new EXE;
existing login and local history remain in place. The page also provides the
existing Android APK as a separate platform download.

Log in using an authorized ComePlayers account. Take Order shows employees by
name, new orders and active tasks. Select a worker and an order, then confirm TAKE.
START and DONE require a screenshot and confirmation before sending to Telegram.
Only verified direct @evogamings posts in the configured FH3 group supply orders
and TASK. Order Selesai shows only Telegram orders with confirmed DONE from Monitor.
Payroll financial data is not requested by this Windows view.

## Local status and sleep

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
selection labels. The interface uses neutral white, black and gray surfaces.

## Storage and safety

- DPAPI-encrypted session: `%LOCALAPPDATA%\ComePlayers\CPBoostMonitor\session.dat`.
- Local status/history: `%LOCALAPPDATA%\ComePlayers\CPBoostMonitor\local-status.json`.
- No database migrations or changes to Payroll, salary, employees or Closing.
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
Earlier design notes remain in `docs/` as historical documentation.

# Issue #83 — Payroll Sheets stop audit

Audit date: 22 October 2026 (Asia/Bangkok). No production writes or migrations.

## Current production evidence

- `main`: `8ffefaa88811dce56aae543ba4fe75fa704ccf61`.
- Vercel `evo-gaming`: production deployment `dpl_AucQXwMSe5qCGzX4kzy5mAmRf2YL`,
  READY, same commit, source `redeploy`.
- Environment metadata only (`decrypt=false`): dedicated production
  `PAYROLL_SHEETS_SYNC_SECRET` exists, created before that deployment. Values
  were never decrypted or logged. This confirms configuration presence, not
  equality/inequality to any Apps Script credential.
- Safe anonymous probes to `www.comeplayers.com/api/integrations/payroll-sheet`:
  GET 405; POST without body or credentials 401. No Payroll payload was sent.
- Therefore the legacy anonymous path is rejected, but a permanent production
  shutdown cannot yet be claimed. The new guard is proposed code only.

## Entry-point audit

- All incoming Apps Script order/roster/presence requests use POST
  `/api/integrations/payroll-sheet`. Manual sends and edit/change/minute sends
  converge on it. Guard returns 410 before credential checks/body reads/DB access.
- The uploaded historical XLSX bootstrap is reachable only from this POST in
  application code. Both loading and cursor advancement are behind the guard.
  Old XLSX cron route/schedule has already been removed on main.
- Employee-name writeback uses GET `/api/integrations/payroll-employee-renames`;
  the same guard pauses it before reading employee data.
- No other Google Sheets importer was found in app API, server libraries,
  scheduled workflows or `vercel.json`. Manual Payroll editor/import features
  remain explicitly operated website functions.
- Unrelated `evo-gaming-mirror.gs` and `evo-gaming-sheet-mirror.gs` are unchanged.
  Telegram cron and global `CRON_SECRET` are unchanged.
- No workspace merge/validation, employee record, pay calculation, Closing
  snapshot, schema, or workbook has been altered by this change.

## Verification and release

- TypeScript: `tsc --noEmit --incremental false` passed.
- 193 tests passed: Sheets API/script/merge/roster/daily, disabled guards,
  website edits/Closing, mobile assignment/task/proof regression suites.
- A separate pre-existing FH3 TAKE database test exposed START reply threading
  failure. It is tracked in the separate FH3 follow-up, not hidden by this suite.
- After approval to release this PR: leave `PAYROLL_SHEETS_SYNC_ENABLED` unset or
  `false`; deploy this code; verify GET returns 410 with `enabled:false` and
  `saved:false`. This deployment requires no database migration.
- Apps Script trigger removal, reactivation and rollback steps are in
  `docs/payroll-google-sheets-hourly-sync.md`. No live Script installation was
  changed from this environment.

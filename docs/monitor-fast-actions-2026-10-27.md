# Monitor: responsive Windows 2.2.1 / Android 1.9.1 actions

The 2.2.0 form used the same busy flag for automatic polling and user actions. A click during polling could be silently dropped. Polling also disabled the task panel, and a successful TAKE fetched roster/pending/tasks twice before releasing the operation.

## Behavior

- Polling and read-only admin/book panels no longer occupy the action lock. A selected START or archive can run while a background read is waiting.
- Only one user mutation can run at a time. Responses started before an action cannot overwrite newer state. Repeated post-action refreshes coalesce.
- Pending and tasks load concurrently. The roster is reused for up to two minutes within the same identity, instead of being fetched for every poll and mutation. Initial load and identity changes still fetch it. Server authorization and employee validation remain authoritative on every mutation.
- TAKE sends immediately after selecting the employee and order. START/PAUSE/CONTINUE/DONE send after selecting the screenshot, without another preview confirmation or success modal. Results appear in the status bar.
- Hapus Order immediately archives the selected row for admins, with a standard audit reason. It does not physically delete Payroll, wage, Closing, or historical records. Restore is available in Kelola Order.
- Pending/tasks include the existing `controlVersion`; Windows sends it to the existing atomic management RPC. This removes the full management preflight. Older servers without the field retain a read fallback; a missing version is never guessed as zero.
- Successful changes update the visible row immediately and refresh in the background. Photos with an uncertain outcome are not resent automatically. Daily-cycle and pause revision fields remain intact.

## Validation

`FastActionChecks` drives real WinForms buttons against an injected HTTP handler. A pending GET is deliberately stalled. START and archive must reach the handler before it is released; the START must not repeat; the archive must send the selected version without reading management; the delayed old snapshot must not resurrect the task. Two actions must cause only one follow-up refresh and no repeated roster read.

Existing native logic/API and UI checks cover public/admin access, uncertainty, sleep state, daily work, PAUSE/CONTINUE and notification resources. API fixtures check both linked and unpriced order versions, current authorization, verified Telegram sources, and daily/ordinary workflows. No real orders are mutated by tests.

Android has separate serialized lanes for reads and writes, single-flight token refresh, and generation guards against old poll results. Polling no longer disables START, and selecting a worker/photo sends the operation without another confirmation dialog. Successful actions use a toast, invalidate the old phase, and refresh only order lists. Roster login/sync no longer duplicates task reads. Android keeps its existing package and signing key.

## Database read cost

The public context previously rebuilt the operational projection from the entire Payroll JSON on every call, holding its per-IP rate-limit row lock during the calculation. The new migration builds that same projection once into a private RLS-enabled table, and keeps it transactionally current via insert/update/delete/truncate triggers. It preserves every employee and every order reference, including cross-team collisions and old orders; there is no TTL for authorization data. The RPC signatures, source guards, rate limits, daily workflow and administrator permissions are unchanged. The private schema/table/helpers are inaccessible to anon, authenticated and service_role; only the existing service-only snapshot RPC reads the projection.

The migration backfills derived data without updating the Payroll document, creating extra Payroll audit entries, or deleting any source/history data. Local tests compare the old/new outputs exactly, verify invalidation and rollback, run TAKE/START/PAUSE/CONTINUE/DONE through the full migration chain, and confirm the Payroll/Closing source remains identical. A synthetic local benchmark with 5,000 orders and 2 MB Closing measured median projection reads at 80.6 ms before and 4.7 ms cached (17x); this is PGlite timing, not a production latency guarantee.

Validation: 117 Windows logic/API checks, 82 UI/resource checks, 37 Android tests (SDK 35), 42 backend tests, Android debug/release builds and lint, TypeScript and ESLint. Fast-action tests hold a GET open while TAKE/archive and all four photo actions run on the independent write lane; no real Telegram reports or orders are changed.

## Rollout and limits

PR #116 requires explicit approval before merge/deployment, the additive projection migration and publication of both native packages. Current production download files remain unchanged. The new backend fields and cached RPC remain compatible with existing apps; native clients also remain compatible before the migration. Roll back performance behavior by restoring the previous snapshot RPC body; keep the derived table/triggers until a reviewed cleanup rather than deleting any source data.

Production PostgreSQL logs showed repeated snapshot/public-context timeouts. At 15:57 UTC a lightweight health query returned 23 connections, but the following data read timed out again. The existing preview built successfully, but its pending/tasks reads failed while the database was unhealthy. End-to-end production stability is therefore not yet verified. Do not present the local speedup as proof the incident is resolved. A previous authorized restart has already been consumed; any further restart needs new approval. Actual Telegram delivery still depends on the server and network; uncertain writes are never resent automatically.

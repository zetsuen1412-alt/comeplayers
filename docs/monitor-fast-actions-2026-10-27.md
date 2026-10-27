# Windows Monitor 2.2.1: responsive order actions

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

This is a Windows/client responsiveness fix with additive API fields. Android binaries, database schema, production data, and production download files are unchanged by this PR. Actual Telegram delivery still depends on network and server response time; the app no longer waits for background refreshes or extra dialogs before sending.

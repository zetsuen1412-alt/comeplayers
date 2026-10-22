# FH3 Monitor — verified admin Telegram source (proposed, not production)

Issue #83 follow-up to draft #82. Review this successor branch instead of merging
both implementations. Payroll Sheets shutdown is an independent PR/branch.

## Operational behavior

- Pending orders **and active tasks** require a receipt from the active FH3
  Telegram group. Payroll-only X4759 is omitted. Telegram X4519 carries the
  manually written TASK/game/duration, including photo captions.
- A missing financial Payroll record appears as `[BUTUH INPUT PAYROLL]` with
  `canTake:false`. The database refuses assignment; no sale, salary, employee,
  payout or Closing record is fabricated by Telegram intake.
- Only messages authored by **Adm EVO Gaming / @evogamings** can supply orders.
  No login to that account or manually supplied numeric Telegram ID is needed:
  on its first valid order, the webhook checks Telegram's live `getChatMember`
  username and administrator/creator role, then atomically pins its numeric ID
  in `cp_payroll_telegram_divisions.fh3_order_sender_id`. Later receipts, queue
  reads and action transactions must match that pinned ID. Display names and
  later username reuse by a different account cannot override it. Until a pin
  exists, no queue/task/action is allowed; a binding change retains the pin.
  Changing the intended account requires a separate reviewed configuration change.
- Group binding, live group title (`EVO Ilham FH3`, ignoring emojis/spacing),
  and current sender administrator/creator membership are also verified. Bots,
  anonymous `sender_chat` identities and forwarded posts are not accepted as
  order receipts. Repost historical content as a newly authored admin message.
- The first nonempty line must contain only the X code; TASK/TUGAS must be
  explicitly labelled. Only operational fields are retained; credential labels,
  inline credentials and credential continuation values are filtered. Photos,
  file IDs and the raw caption are not stored in this intake table.
- Admin photos in the bound group are consumed before legacy photo deletion,
  including album photos with no TASK. Other divisions keep their workflow.
- Removing TASK or changing the reference in an edited message invalidates its
  previous receipt. A newer repost supersedes an older one. Duplicate updates
  and out-of-order edits cannot overwrite newer metadata.
- To withdraw a post, an admin sends `/fh3_cancel X4519` in the bound group
  **before deleting it**. This creates a tombstone; late messages/edits cannot
  revive the old receipt. A new authored repost with a later message ID can
  restore it. Cancellation hides the pending/active projection and blocks new
  TAKE/START/DONE claims; existing Payroll records and financial history remain.
- Assignment, TAKE and photo claim RPCs recheck active receipts and binding in
  the same transaction. The old underlying functions lose service-role EXECUTE,
  preventing stale/legacy callers from bypassing the guards. A missing or
  duplicate Payroll reference is rejected under the workspace row lock.
- START replies to the confirmed TAKE message; DONE replies to START. An older
  newline-sensitive SQL rewrite could silently miss this; the new repair fails
  if its expected function shape is absent.

## Windows v1.6 compatibility

Wire schemas and `source:"payroll"` are retained, with an additional
`sourceOfTruth:"telegram_fh3_manual"`. An old client may still enable TAKE for
an unlinked row; both API and database reject the operation. `complete:true`
active snapshots omit cancelled/non-Telegram tasks. Binary UI behavior and cache
clearing on a physical Windows v1.6 installation still require staging QA.
No native client installer was changed or released.

## Verification

Local TypeScript and 148 Telegram/FH3/mobile API/database tests passed. Tests use
PGlite with the real migration chain, mocked Telegram transport, and synthetic
X4519/X4759 fixtures. They cover source validation, admin photo preservation,
TASK redaction, idempotency, cancellation, binding changes, unlinked financial
orders, service-role permissions, Closing/staff preservation and TAKE threading.
No live bot messages, Payroll records, secrets or production database were used.
Next.js optimized build also passed with public Supabase reads served by an
empty loopback fixture (four read requests, all writes rejected). A build with
no environment at all correctly stopped at sitemap generation because the public
Supabase URL was absent. The fixture build does not certify live integration.

Some older regression expectations were stale: evidence links now use the
protected website endpoint, picker keyboards include BACK, and SQL source
comparisons need CRLF normalization on Windows. Tests were corrected without
changing those existing product behaviors.

## Rollout — owner approval required

1. Use a separate staging database and test bot/group. Preview variables must
   not grant staging tests access to production Payroll. Do not redirect the
   production bot's webhook; a bot has one webhook.
2. On a staging clone of the existing schema, apply in timestamp order:
   `20261022002214_fh3_monitor_source_guards.sql` (TAKE reply repair), then
   `20261022070000_fh3_manual_telegram_intake.sql` (private receipts and guards).
   The latter is an updated **unreleased** draft migration. If an older #82
   schema was already applied to staging, prepare an additive upgrade before
   rollout; never replace or reset a database holding real Payroll data.
3. Verify RLS, grants, wrappers and a read-only Payroll/Closing snapshot before
   and after migrations. New metadata is service-role-only; public/authenticated
   table access and unguarded function access must be denied.
4. Deploy staging code, make the **test** bot administrator, and bind the intended
   test FH3 group. Webhook allowed updates: `message`, `edited_message`,
   `callback_query`. Administrator rights are required for reliable role checks.
5. Test admin/member/forwarded/photo/album/edit/cancel cases. Confirm pending
   X4519 appears, Payroll-only X4759 stays absent in both lists, unlinked TAKE is
   blocked, and photos remain in Telegram. Confirm cancellation and a group
   rebind clear old cards after client refresh.
   Post the first valid order from @evogamings to establish the numeric sender
   pin automatically. An unrelated group administrator must not establish it or
   contribute receipts. X4827's caption format (standalone AION, Duration, TASK)
   is supported; use synthetic credentials for staging, never screenshots of
   actual buyer credentials in test artifacts.
6. With a synthetic linked order, validate Windows v1.6 TAKE → START → DONE,
   correct reply threads, double-click/retry handling and no duplicate sends.
7. Record backup, commit IDs and staging evidence. Request separate owner
   approval for production migrations, webhook changes and deployment.

## Rollback and platform limits

Retain the private metadata table and audit records. Roll back with a reviewed
forward migration only if needed; function renames have dependencies. Reverting
the website to pre-FH3 code re-exposes Payroll-only rows, so it is **not** a safe
source-policy rollback. Keep queue filtering and database guards; disable the
Monitor client while repairing a failed rollout. Rollback must not delete the
Payroll workspace, staff, salary, Closing or Telegram admin photos.

The Bot API cannot retrieve old chat history and does not deliver a general
message-deletion notification. Receipt persistence is not a live proof that a
post still exists. Use the explicit cancellation command before deletion and
reconcile old active receipts operationally. Do not infer cancellation from a
missing history response or automatically change Payroll financial records.
TASK contained only inside an image needs an admin-authored caption; there is
no OCR. Details: [Telegram Bot API](https://core.telegram.org/bots/api),
[RLS and service roles](https://supabase.com/docs/guides/database/postgres/row-level-security).

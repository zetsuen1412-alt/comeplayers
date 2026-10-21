# FH3: Telegram manual order is the intake source (preview)

## Why
The Windows EVOGAMING Monitor v1.6 used `/api/admin/payroll/mobile/pending` backed by
`cp_payroll_workspace`. That queue can show X4759 even when admin never posted it
in the bound FH3 Telegram group. The actual operational order and TASK are typed
manually by group administrators, often as a caption attached to a photo.

## Changes in this branch
- A new private table `cp_fh3_telegram_manual_orders` records ONLY order code,
  group/message/admin IDs, game, server, duration, TASK and Telegram timestamp.
  It does **not** store photos, Telegram passwords, login IDs or raw captions.
- The configured Payroll Telegram webhook inspects manual text/photo captions
  **before** legacy photo-evidence processing (which may delete a media post).
  Only group/supergroup posts in the active, bound FH3 chat from a verified
  group administrator with an X-code and a labelled TASK are accepted.
- Message edits can refresh that TASK; later messages supersede earlier ones,
  and Telegram retries are idempotent. Messages sent by other members do not
  create order cards.
- `GET /api/admin/payroll/mobile/pending` is restricted to captured FH3 manual
  order codes. It uses Telegram TASK, game and duration, and does not expose
  Payroll buyer details or Telegram credentials. Schema 2 + `source=payroll`
  remain for compatibility with Windows v1.6; `sourceOfTruth` indicates the
  effective queue policy.
- Telegram posts not yet present in Payroll **still appear** in the queue as
  `[BUTUH INPUT PAYROLL]`, `canTake=false`, `unlinkedPayroll=true`.
  Existing Windows v1.6 does not understand `canTake` and might still enable
  the TAKE button; the server returns a conflict asking the admin to register
  the order in Payroll. No financial order/zero-priced sale is auto-created.
- `POST /mobile/assign` independently verifies the Telegram evidence and
  FH3 group before assigning any order, even if a client is outdated.

## Production rollout: requires explicit approval
Nothing in this branch is deployed. Stage first and test against a test group.
1. Back up Payroll workspace, record current Telegram group bindings and active
   order count. Do not copy real buyer passwords into tickets or screenshots.
2. Apply migration `website/supabase/migrations/20261022070000_fh3_manual_telegram_intake.sql`
   in **staging**; check RLS, service-role grants and RPC. Rehearse rollback.
3. Deploy preview website and set its Telegram webhook to a **test bot/group**.
   Do not attach a staging webhook to the production bot (one webhook per bot).
4. On the actual approved rollout, make the Payroll Telegram bot a group
   **administrator** in the intended FH3 group (or disable BotFather group
   privacy mode and re-add it). Verify the already existing `/bind FH3`
   group binding. Webhook must allow `message`, `edited_message`,
   `callback_query`. Existing setWebhook setup must be run by admin.
5. Post a new test **X code + TASK** as a plain message and as a photo
   caption. Confirm only the correct bound group/admin is accepted and the
   original Telegram photo remains in the group. Confirm no credentials appear.
6. Validate pending queue from Windows v1.6: Payroll-only X4759 absent,
   verified Telegram code present with the correct TASK; unmatched Telegram
   codes labelled as requiring Payroll input.
7. Check admin TAKE (only on a test order linked to Payroll), START and DONE
   after verified group setup. Confirm no duplicate or unsolicited Telegram
   posts. Only then consider production migration and deployment.

## Limitations
- Telegram Bot API cannot backfill old chat history and does not send a
  general update when an admin deletes a Telegram message. For existing X4519,
  repost/forward its order message **into the bound FH3 group** after bot
  setup. Deletion/withdrawal needs a separate explicit reconciliation workflow
  before production.
- This change does not scrape Telegram Desktop or images and cannot OCR TASK
  contained only *inside* the photo. TASK must be in text or photo caption.
- The receipt is verified against the bound FH3 group and author role, not
  against external payment/order marketplaces. Manual group posts are not
  automatic finance records.
- Existing Windows v1.6 has no client-side disabled TAKE state for
  `unlinkedPayroll`; the server rejects attempts safely.
- Test and typecheck have not been confirmed from this GitHub edit; CI and
  staging verification remain release gates. Do not merge/deploy blindly.

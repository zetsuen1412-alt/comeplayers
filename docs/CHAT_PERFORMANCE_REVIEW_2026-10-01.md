# Chat performance release — 1 October 2026 (UTC+7)

Source commit: `0308c9aadd87bb67ce491b2218aa2c91fe8beda4`.

## Changes and measured work reduction

- Android encrypted history commits each verified page atomically, including cursor, outbox acknowledgments and an encrypted projection journal. It displays each 50-message page before requesting the next. Interrupted projection replays idempotently; overlapping call-key and message catch-up share a queue.
- A real SQLite/crypto fixture with 500 messages takes 520 commits including message projection, versus 2,010 previously (74.1% fewer). The history layer alone takes 10 versus 1,510. Empty history polls write nothing. These are transaction counts, not physical-device timing.
- Idle Android call reconciliation drops from 30 to 4 scheduled reads/minute, and web from 20 to 4, only after both the server capability and realtime connection are confirmed. Active calls and failures retain 2-second Android / 3-second web fallback. Startup/reconnect and call events cause additional immediate reads. Healthy Android inbox fallback drops from 3 to 1 read/minute; realtime/push/foreground updates remain immediate.
- Call revisions are written atomically with call state, so a newer chat message cannot hide an incoming call invalidation. Only account-scoped revision metadata is published; call data still comes from the authorized API. No navigation invalidation consumes this new scope.
- Public-channel unread counts are aggregated in Postgres instead of transferring up to 5,000 message rows. Membership and channel privacy are checked again in a service-role-only function. SQL fixtures include 24,006 messages and counts over 5,000. The live read-only sample checked four channels and found zero mismatches (that sample had zero unread messages).
- Notification settings are cached per account for 60 seconds with shared pending reads and immediate invalidation after saves. Alerts are suspended during refresh and rechecked after asynchronous claim so muting cannot race a notification sound.
- Community no longer mounts the marketplace header or hidden voice panel. Header/assistant code loads when relevant, and stable group-message content is memoized.

## Public initial JavaScript comparison

Same script fetched public HTML and unique initial `/_next/` script references before and after deployment. Gzip sizes use local normalized compression, not browser transfer measurements. Dynamically fetched assets, images and authenticated runtime work are not included.

| Route | Before raw bytes | After raw bytes | Before gzip bytes | After gzip bytes |
| --- | ---: | ---: | ---: | ---: |
| `/` | 1,384,023 | 1,026,127 | 401,209 | 307,129 |
| `/cpcommunity` | 1,544,196 | 1,209,877 | 441,436 | 355,108 |
| `/chat` | 1,388,873 | 1,054,293 | 403,629 | 317,003 |

Community initial gzip bytes fell 19.6%; home fell 23.4%; transaction chat fell 21.5%. Public audit evidence is at `C:/Comeplayers-new/output/performance-review-20261001/{before,after}.json`. The candidate-domain audit followed a Vercel protection redirect and is invalid for comparison; only the production-domain before/after files are evidence. The script now rejects cross-origin redirects.

## Verification

- Website full suite: 863 passed, zero failures; production Next build and TypeScript passed.
- App `.mjs` suite: 134 passed, zero failures; desktop/mobile/shared TypeScript passed. Additional private-history/crypto/recovery TypeScript tests passed.
- Tests cover dropped realtime capability, HTTP failures, subscription disposal, mute races, database RLS, transactional rollback, corrupt last-page events, process interruption, edits/deletions/receipts/stars, revocation, concurrent catch-up and later-page network failure.
- Candidate call API without authentication returned 401 and `Cache-Control: no-store`.
- Production browser opened the community, loaded actual group/channel content and composer, and had no captured browser errors. No production messages or calls were sent.
- Post-release Vercel runtime query for this deployment found no 5xx logs in the first observation window. This short window is not a long-term availability measurement.

## Deployment and rollback

- Supabase project `uyehruetoxedmookyfcd`: applied `20260930180309_public_channel_unread_aggregation.sql` and `20260930182225_atomic_call_revision_events.sql`.
- The call migration grants only schema USAGE to the existing service role, adds the own-account read policy and private invoker trigger. Live verification confirmed the trigger enabled, own-account scope restriction, revision table published, raw calls unpublished, and no direct function execution granted to anon/authenticated/service_role. Security advisors did not flag the new objects; existing project advisories are outside this change.
- Vercel production server variable `CALL_REVISION_EVENTS_ENABLED=true` was enabled only after migration verification. Old binaries/omitted capability keep fast fallback. To disable slower reconciliation, set the variable to false and redeploy; leave the additive migrations installed during application rollback.
- Website deployment `dpl_68LpmQZEUtJJcBaN2i7b2bhucViK` was built with production settings, checked, then promoted to `www.comeplayers.com`. `/api/app-version` confirms the same ID. The CLI candidate was built from the final source before its Git commit; changes afterward were test fixtures/documentation only.
- Android OTA group `429173f3-fa71-4b34-a508-0cd9b8ae808c`, update `01a0f39e-4ad8-7602-8b49-f60bbc368aa3`, production channel, runtime `0.16.4`, published and confirmed by Expo. Users apply the “Pembaruan siap” banner after finishing their messages/calls. This is not a new Google Play native binary or a new public Store rollout.
- Previous website rollback: `dpl_Fnbc9gpQrD2C7EzZdJTB2YWqfnZW`. Previous Android OTA: `689281b0-b51a-48d7-840d-ec66ae949854`.
- Windows receives website changes through its existing shell. No new MSIX or certification status was claimed.

Physical-device responsiveness, battery usage and two-device audio/video quality still require device validation. These measurements demonstrate reduced work; they do not establish parity with Telegram or guarantee zero lag on every device/network.

# Chat and call performance — 30 September 2026

## Observed causes

- Production deployment `dpl_F4Kt6Yn4voAoT3d3fcjnoXt4QH23` ran in `iad1`; Supabase `uyehruetoxedmookyfcd` runs in `ap-southeast-1` (Singapore). Three pre-release `/api/health` requests measured 1169/734/736 ms total and 302/266/277 ms for the server database check, with `sin1::iad1` response headers. These are three health samples, not end-to-end chat or call benchmarks.
- The Vercel project default was also `iad1`. Updated and read back `serverlessFunctionRegion=sin1` and `resourceConfig.functionDefaultRegions=[sin1]`; source `website/vercel.json` already requests `sin1`.
- Android refreshed all 100 rooms on local message/media/read events and performed four SQLite calls per room.
- Browser call controls and incoming alerts polled separately. Chat eagerly imported all arcade engines and community voice code. Unchanged group snapshots repeatedly wrote read receipts.

## Changes

- Batch room/preview/unread reads and writes on Android; keep authenticated server rooms as the local inbox allow-list and discard stale snapshots.
- Keep message bubbles stable while typing. Paint verified local history before a network sync; skip rebuilding unchanged web history.
- Defer arcade and voice engines; stop closed contacts and unused direct-chat presence tasks. Coalesce sidebar refreshes without changing selected rooms or navigation.
- Bound automatic photo work; videos/audio/documents decrypt on request and display inline when opened.
- Share one browser call monitor with race-safe mutation refreshes. Keep the Android camera tree out of duration timer updates. Use 480p/20fps camera defaults and a 500kbps cap, preserving echo cancellation and audio loss recovery.
- Parallelize independent call authorization reads, checking all results before token creation. Move noncritical inbox activity after the response and use one conditional atomic activity write. Call termination and LiveKit deletion remain awaited.

## Validation

- Android TypeScript and 28 chat/call/update regression tests passed.
- SQLite tests seed 10,001 messages and verify indexed latest-per-room selection: 100-room refresh uses 4 reads and at most 1 write transaction instead of roughly 400 reads/up to 100 transactions.
- 100 local inbox invalidations coalesce into 1 local read with no extra room-list HTTP request. Account membership allow-list and delayed-snapshot tests pass.
- A 40-message Android list incurs no extra bubble renders across 10 keystrokes. A one-message change rerenders one bubble.
- Browser call-monitor simulation produces 21 rather than roughly 62 requests/minute with two consumers; unchanged snapshots do not notify them.
- Forty unchanged web conversation loads produce no extra read-receipt requests. New message/channel/account boundaries and retries remain supported.
- Call API tests verify deferred activity, parallel checks, blocked/foreign/expired calls, accept/end races, and awaited LiveKit termination.
- One existing full-suite mock missed the current push-recipient dependency; corrected the mock and its 12-test suite passed.

## Release and limits

Published release identifiers are recorded below. Android changes are JavaScript-only and retain runtime `0.16.4`; no native dependency or protocol changes. The web release also benefits the Windows webview; Microsoft Store 1.0.1.0 certification is not cancelled.

Physical Android-to-browser call quality, device FPS, and real-world message latency have not been measured. No claim of Telegram-equivalent performance or zero network delay is made. No production messages or calls were sent during tests.

Final source checks: website TypeScript passed; full website suite 835/835 passed; scoped lint and diff-check passed. Android TypeScript and 28/28 focused tests passed.


## Published performance release

- Source: `15b61d4551ad26b4cbf759a320c84b9598d29d3f`.
- Website: `dpl_4ZQeXpZLNXQL47TBBZXwZvmXNsMB`, promoted to www.comeplayers.com after candidate health and unauthenticated-call checks passed.
- After promotion, three public health checks measured 610/355/282 ms total and 49/54/35 ms database time, with `sin1::sin1` headers. Compare only with the three health samples above; these do not measure message delivery or call media latency.
- Android production OTA group: `689281b0-b51a-48d7-840d-ec66ae949854`, Android update `01a0f33b-fa00-7ae2-9daa-c8b374ae313b`, runtime `0.16.4`. This is an update for the existing Android build, not a new Google Play binary.
- The mobile update flow downloads in the background and applies on explicit user action or next launch, preserving the current chat.

## Embedded game retirement

The user subsequently requested removal of old games while preserving Crazy Rich. Crazy Rich is a separate Unity project in the primary checkout, on `codex/crazy-rich-world-tour`; it is not the old CP Monopoly browser module. That checkout and its game/backend are untouched.

The community's six old selectable games (Empires & Allies, Frontline, Strike, Snake, Chess, CP Monopoly), the obsolete Match route and unused legacy arcade runtime are removed. Marketplace game catalogs, offers, chat, calls and historical database migrations remain. Shared Alexia avatar artwork remains because the active assistant still uses it. The separately hosted Empires service and its compatibility API/CSP configuration are retained because deleting the endpoints could break existing service webhooks. They are not imported into community startup; the separate service source is excluded from website deployment.

The initial broad deletion was rejected by automatic approval review over possible shared assets. After a new file/reference audit, removal was narrowed to exact Git-tracked runtime and asset files, preserving the shared avatar and separate service; this narrower action was approved.

Retirement verification: 38,385,587 bytes of obsolete public assets removed, plus obsolete source/styles. Three direct graphics packages and 20 total lockfile packages removed; marketplace dependencies unchanged. TypeScript passes after excluding the pre-existing, non-deployed `website/patch` archive. Nineteen focused retirement/performance tests pass. The first full run passed 820/821: its only failure was a test requiring the removed Game menu; the updated navigation test then passed. A final full run follows before promotion. Primary Crazy Rich checkout remains clean at `cc6149dff025f37f3a46c47b3fb4475f71eacc97`.
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

Release identifiers and final validation are recorded after publishing. Android changes are JavaScript-only and retain runtime `0.16.4`; no native dependency or protocol changes. The web release also benefits the Windows webview; Microsoft Store 1.0.1.0 certification is not cancelled.

Physical Android-to-browser call quality, device FPS, and real-world message latency have not been measured. No claim of Telegram-equivalent performance or zero network delay is made. No production messages or calls were sent during tests.

Final source checks: website TypeScript passed; full website suite 835/835 passed; scoped lint and diff-check passed. Android TypeScript and 28/28 focused tests passed.

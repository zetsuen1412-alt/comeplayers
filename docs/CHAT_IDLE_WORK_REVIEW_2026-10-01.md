# Further chat idle-work review — 1 October 2026 (UTC+7)

## Scope

Reduce unnecessary work while preserving incoming call/message delivery and stable room selection. These changes do not remove chat, calls, Crazy Rich or the isolated Empires & Allies launcher.

## Changes

- Android call-history refresh pauses and aborts while the app is backgrounded or the active-call overlay is showing. It resumes immediately on foreground/call completion. This removes up to six scheduled full-history reads per minute in those states; the independent incoming-call monitor remains active. Reads are serialized, stale account results are fenced and unchanged lists retain their identity.
- Community typing polls run only when the text conversation is visible. Home, voice channels and the compact inbox avoid the 2.5-second typing poll (up to 24 scheduled reads/minute when Redis is enabled). Browser visibility/connectivity suspends timers and aborts pending reads.
- Presence is scoped to the community, so switching channels does not restart the same member-list fetch and heartbeat. Offline presence is cleared; returning online refreshes it.
- Hidden community conversations do not fetch history or send read receipts. Selected account/room/channel guards prevent delayed send/reaction callbacks or stale responses from overwriting the visible conversation or marking another channel read.
- Deployment checks pause in hidden browser tabs, have bounded request lifetime and never auto-reload conversation/community routes. Existing payment, draft and modal protections remain.
- Empires attack and invitation notifications now target its standalone launcher instead of entering community through an obsolete game query parameter.

## Empires & Allies finding

The community route does not import or launch the game. The launcher obtains a ticket only after the user presses Play and navigates to the external game service. Removing that launcher would not remove a game engine from chat startup because the engine is already separate.

An independently open game tab can still use the same computer's CPU/GPU/memory. The game-service template contains animation/loading timers and does not explicitly suspend them on page visibility changes; actual Ruffle background behavior and device resource usage were not measured. No game-service files or deployment were changed in this release. A separate service does not prove separate physical database capacity.

## Validation and release

- Website full suite: 883 passed, zero failures before the final default-channel response guard. After that guard and same-room member-count fallback, 31 affected tests passed; independent review reproduced and confirmed the stale default-channel regression fixed.
- App `.mjs` suite: 140 passed, zero failures. Desktop, mobile and shared TypeScript checks passed.
- Final website TypeScript passed with `--incremental false` (avoiding an unrelated workspace cache-file permission error).

- Changed website files pass ESLint with zero errors (the large community page still reports 25 warnings). Git diff whitespace checks passed.
- Vercel production build and build-time TypeScript passed. The candidate unauthenticated calls endpoint returned 401 with `Cache-Control: no-store`.
- Source commit: `38509bca442f11f31a831496a54438f4df7e78a1`.
- Website `dpl_6fJnFi1gu9psbSdHMBw1LpuqmU5P` was checked then promoted. `https://www.comeplayers.com/api/app-version` returned that exact release ID with HTTP 200 and no-store headers.
- Android production OTA group `7d62f650-74c1-4d16-b7b9-772af8ef03a6`, update `01a0f3d2-06c1-7535-80db-dc93947036b8`, runtime `0.16.4`, published and independently confirmed by `eas update:view`. This updates compatible installed applications; it is not a new Google Play binary or public Store rollout.
- The initial deployment-scoped Vercel log query found no 5xx entries. This is a short observation window, not an availability guarantee.
- Production browser verification loaded authenticated community content and the composer, switched communities, opened the board, retained its selection through background refreshes and reopened chat successfully. Current-room member/online totals stayed visible. Captured browser error logs were empty. No test messages, reactions or calls were sent.
- Website rollback: `dpl_68LpmQZEUtJJcBaN2i7b2bhucViK`. Android rollback OTA group: `429173f3-fa71-4b34-a508-0cd9b8ae808c`. No database/schema or game-service change needs rollback in this follow-up.

Request counts above describe eliminated scheduled work, not measured FPS, battery savings or physical-device call quality. Physical-device responsiveness and two-device calls remain unverified in this review.

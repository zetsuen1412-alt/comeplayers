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

Final affected test results and deployment identifiers are recorded here after release. Request counts above describe eliminated scheduled work, not measured FPS, battery savings or physical-device call quality.

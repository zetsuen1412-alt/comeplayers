# ComePlayers Marble V64 — Replay Studio & Share Codes

## What changed

V64 upgrades V63 replay into a permanent Replay Studio. Long matches are loaded in ordered pages, the timeline can be scrubbed without replaying from the beginning, and finished authoritative matches can be published to a durable Supabase archive with an eight-character share code.

## Apply the database update

Run this migration after V57 through V63:

```text
supabase/migrations/20260720123000_marble_v64_replay_studio.sql
```

V62 did not require a migration.

## Try Replay Studio

1. Open the project in Cocos Creator 3.8.8.
2. Open `assets/scenes/Match.scene` and press Preview.
3. Join or create an authoritative online room.
4. Open **ONLINE → OPEN 3D SERVER BOARD**.
5. Choose **LOAD LIVE REPLAY**.
6. Drag the replay slider, use **-10 EVENTS** / **+10 EVENTS**, pause, change speed, or skip to the end.
7. Seeking uses replay checkpoints, so the board is restored near the requested point instead of recalculating every frame from event zero.

## Publish and share a replay

1. Finish an authoritative match as the room host.
2. On the server board choose **PUBLISH REPLAY**.
3. Choose `PRIVATE`, `UNLISTED`, or `PUBLIC`.
4. Save the returned eight-character code.
5. Open **REPLAYS → OPEN SHARE CODE** from another authenticated profile and enter the code.

Visibility rules:

- `PRIVATE`: only the archive owner can open the code.
- `UNLISTED`: any authenticated player with the code can watch it.
- `PUBLIC`: shown in the Replay Studio library and can also be opened by code.

## Limits

- One server page contains at most 180 events.
- The client loads at most 12 pages, or 2,160 events, for one replay session.
- Publishing is available only to the authenticated room host after the match reaches `FINISHED`.
- Shared replay viewers receive the archived snapshot and copied event stream, not access to the original room.

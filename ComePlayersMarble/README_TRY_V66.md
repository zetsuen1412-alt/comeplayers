# ComePlayers Marble V66 — Realtime Season & Team Cups

## Preview

1. Open this project in Cocos Creator 3.8.8.
2. Open `assets/scenes/Match.scene`.
3. Apply all Supabase migrations through V66.
4. Configure the Supabase Project URL and publishable key.
5. Enable Anonymous Sign-Ins or use authenticated accounts.
6. Disable public Realtime channels and keep the competitive channel private.
7. Press Preview and open `COMPETE`.

## Realtime ranked queue

1. Choose Solo or Team mode.
2. Press `QUEUE SOLO` or `QUEUE TEAM`.
3. V66 subscribes to the authenticated topic `marble-competitive:<user-id>`.
4. A server broadcast refreshes the hub automatically when a room is reserved.
5. Press `JOIN MATCHED ROOM` when the match card appears.

The Poll button is no longer required. A manual hub refresh remains available as a recovery path.

## Native tournament input

Tournament creation and join codes now use a Cocos `EditBox`, so desktop and mobile builds do not depend on browser `prompt()`.

Create a cup using:

- `4 SOLO`
- `8 SOLO`
- `4 TEAM`
- `8 TEAM`

Team entrants are seeded in pairs. Four players produce one Team 2v2 final. Eight players produce two semifinals and one final.

## Server seasons

Competitive profiles use a UTC monthly season key. At rollover, the server archives current wins/losses/cup wins into lifetime counters, resets seasonal rating and progress, and sends a private season update. If Supabase Cron is enabled, V66 schedules the rollover for 00:05 UTC on the first day of each month. Competitive RPC usage also performs a lazy rollover as a fallback.

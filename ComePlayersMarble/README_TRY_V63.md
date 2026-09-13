# ComePlayers Marble V63 — Spectator & Server Replay

## What changed

V63 adds read-only spectator controls and a durable authoritative replay flow for Supabase matches. Spectators use the same private room membership and server snapshot as players, but they never receive turn controls.

## Apply the database update

Run this migration after V57 through V61:

```text
supabase/migrations/20260720101500_marble_v63_spectator_replay.sql
```

V62 did not require a migration.

## Try spectator mode

1. Open the project in Cocos Creator 3.8.8.
2. Open `assets/scenes/Match.scene` and press Preview.
3. Create an online room in browser/profile A.
4. Join as a player in browser/profile B and ready both players.
5. Open a third browser/profile, choose **JOIN / SPECTATE BY CODE**, enter the invite code, then choose `S`.
6. Start the server match from the host.
7. On the spectator client, open **ONLINE** and choose **OPEN 3D SERVER BOARD**.
8. Use **OVERVIEW**, **NEXT PLAYER**, and **AUTO FOLLOW** to control the camera.

## Try authoritative replay

1. Keep the spectator or player 3D server board open.
2. Choose **LOAD REPLAY**.
3. Use **PAUSE / RESUME**, **SPEED**, and **SKIP TO END**.
4. When replay finishes, the board returns to the newest live server snapshot.
5. Refresh and reconnect to confirm old events are not replayed as live effects.

## Safety and limits

- The replay RPC only works for authenticated room members, including spectators.
- The response is capped at 180 ordered events per request.
- Action buttons are disabled while replay is active.
- V63 reconstructs the important match timeline from server events, then reconciles to the final authoritative snapshot.
- There is no public replay browser or replay sharing link yet.

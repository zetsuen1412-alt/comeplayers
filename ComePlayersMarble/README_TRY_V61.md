# Try ComePlayers Marble V61 — Cinematic Multiplayer + Server Loadouts

## Requirements

- Cocos Creator 3.8.8
- Node.js 20 or newer
- A Supabase project
- V57, V58, V59, and V60 migrations already applied

## Install

```bash
npm ci
```

Apply this migration after V60:

```text
supabase/migrations/20260719091500_marble_v61_cinematic_loadouts.sql
```

Keep Realtime channels private, enable anonymous sign-in or normal authentication, and configure only the Project URL plus publishable key in the client.

## Preview

1. Open `assets/scenes/Match.scene` with Cocos Creator 3.8.8.
2. Preview the project in two separate browser profiles.
3. Create a Supabase room in the first profile.
4. Join using the invite code from the second profile.
5. Ready both players.
6. Equip a character, pendant, and booster before the host starts the server match.
7. Open `ONLINE`, start the server match, and select `OPEN LIVE BOARD`.
8. Use `ACTIVATE SERVER SKILL` before rolling.
9. Continue until round 2 to verify the first authoritative World Event.

## What to verify

- Each player snapshot shows character, skill, pendant, booster, free upgrade credits, travel credits, and rent protection.
- The active skill can be used only once and only before another turn action.
- A free upgrade credit refunds the authoritative upgrade cost and is consumed by the server.
- World Events are generated every two rounds when room settings enable them.
- Remote event banners, dice reveals, tile pulses, and marker movement are deduplicated by event sequence.
- Refresh/reconnect restores the latest snapshot without replaying the entire event history.

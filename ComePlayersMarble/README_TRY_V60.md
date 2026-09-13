# Try ComePlayers Marble V60 — Authoritative Special Tiles + Live Board

## Requirements

- Cocos Creator 3.8.8
- A Supabase project
- Anonymous Sign-Ins enabled, or normal authenticated users
- V57, V58, and V59 migrations already applied

## Install

1. Run `npm ci` in the project folder.
2. Configure `assets/scripts/network/SupabaseProjectConfig.ts` with the Supabase Project URL and publishable key.
3. Apply migrations in order:
   - `supabase/migrations/20260719031721_marble_v57_realtime_rooms.sql`
   - `supabase/migrations/20260719045800_marble_v58_authoritative_turns.sql`
   - `supabase/migrations/20260719061200_marble_v59_authoritative_economy.sql`
   - `supabase/migrations/20260719074500_marble_v60_authoritative_special_tiles.sql`
4. Keep Realtime room channels private and disable public channel access.
5. Open `assets/scenes/Match.scene` and press Preview.

## Two-player V60 test

1. Open two browser profiles with different Supabase sessions.
2. Create and join one online room.
3. Set both players Ready and start the server match.
4. Open **ONLINE**, then press **OPEN LIVE BOARD**.
5. Roll until the server lands on the following special tiles:
   - Fortune: server draws and resolves one card.
   - Game Center: choose a number from 1 to 3.
   - Olympic: choose one eligible owned city.
   - World Travel: choose one safe city destination.
   - Island: the next two turns are skipped by the server.
6. Confirm the second browser receives the same position, balance, property owner, building level, Olympic marker, pending choice, and special result.
7. Refresh either browser and reconnect; the Live Board must rebuild from the latest server snapshot.

## Authoritative in V60

- Dice, movement, START salary, turn ownership, and rounds
- Property purchase, upgrade, Landmark, rent, takeover, liquidation, bankruptcy, and victory
- Fortune card draw and rewards/penalties
- Game Center number choice and server draw
- Olympic property choice, multiplier, and expiration
- World Travel cost/pass, destination, movement, and follow-up purchase/upgrade choice
- Island entry and skipped turns
- Rent Shield consumption before server liquidation
- Live 32-tile server board with positions, ownership, buildings, money, pending choices, and event results

## Current limitations

- The V60 Live Board is a synchronized 2D authoritative mirror opened from Online Center.
- The existing cinematic 3D board is not yet replaying every remote event, camera move, and animation from the event stream.
- Character active skills, loadout effects beyond server rent shield/travel credits, and World Events are not yet fully server-authoritative.
- Cocos Creator Preview/native build must be run on a computer with Cocos Creator 3.8.8 installed.

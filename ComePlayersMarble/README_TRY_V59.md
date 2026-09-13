# Try ComePlayers Marble V59 — Authoritative Economy

## Requirements

- Cocos Creator 3.8.8
- A Supabase project
- Anonymous Sign-Ins enabled, or normal authenticated users
- V57 and V58 migrations already applied

## Install

1. Run `npm ci` in the project folder.
2. Configure `assets/scripts/network/SupabaseProjectConfig.ts` with the Project URL and publishable key.
3. Apply migrations in order:
   - `supabase/migrations/20260719031721_marble_v57_realtime_rooms.sql`
   - `supabase/migrations/20260719045800_marble_v58_authoritative_turns.sql`
   - `supabase/migrations/20260719061200_marble_v59_authoritative_economy.sql`
4. Disable public Realtime channel access.
5. Open `assets/scenes/Match.scene` and press Preview.

## Two-player economy test

1. Open two browser profiles with different Supabase sessions.
2. Create and join one online room.
3. Mark both players Ready and start the server match.
4. The current player presses **ROLL SERVER DICE**.
5. The action button changes according to the server decision:
   - **PURCHASE SERVER CITY**
   - **UPGRADE SERVER CITY** / **BUILD SERVER LANDMARK**
   - **TAKE OVER SERVER CITY**
   - **END / SKIP SERVER TURN**
6. Use **SYNC SERVER STATE** after refreshing a browser.
7. Confirm the other browser receives money, property, building, bankruptcy, and winner changes.

## Authoritative in V59

- Dice, movement, START salary, turn ownership, and round advancement
- City ownership and server balance
- Purchase, repeat upgrade, and Landmark construction
- Rent settlement and Team rent exemption
- Takeover price and ownership transfer
- Automatic 70% asset liquidation
- Bankruptcy and asset return to bank
- Tax and Bonus Game economy
- Solo/Team last-standing victory
- Round-limit winner by server net worth
- Revision, idempotency, append-only events, and private Broadcast

## Current limitations

The Online Center console can exercise the full V59 property reducer. The rendered 3D board is not yet rebuilt directly from remote property snapshots. Fortune, Game Center, Olympic, World Travel, and Island choices also remain local-only. Those systems require the next authoritative choice reducer and board-state renderer.

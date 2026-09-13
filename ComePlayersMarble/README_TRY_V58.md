# Try ComePlayers Marble V58 — Authoritative Turns

## Requirements

- Cocos Creator 3.8.8
- A Supabase project
- Anonymous Sign-Ins enabled, or a normal authenticated session
- V57 migration already applied

## Install

1. Open this folder in Cocos Creator 3.8.8.
2. Run `npm ci` in the project folder.
3. Configure `assets/scripts/network/SupabaseProjectConfig.ts` with the Project URL and publishable key.
4. Apply migrations in order:
   - `supabase/migrations/20260719031721_marble_v57_realtime_rooms.sql`
   - `supabase/migrations/20260719045800_marble_v58_authoritative_turns.sql`
5. Disable public Realtime channel access in Supabase Realtime Settings.
6. Preview `assets/scenes/Match.scene`.

## Cross-device authority test

1. Open two browser sessions with different anonymous/authenticated Supabase users.
2. Player A creates an online room.
3. Player B joins using the invite code.
4. Both players mark Ready.
5. The host presses **START SERVER MATCH**.
6. The Authority Console shows revision, round, current player, last dice, and event sequence.
7. Only the current authenticated player may press **ROLL SERVER DICE**.
8. After a valid roll, press **END SERVER TURN**.
9. Try pressing Roll from the wrong browser: Postgres rejects the command.
10. Refresh and press **RESUME AUTHORITY** to restore the server snapshot.

## What is authoritative in V58

- Dice generation
- Current turn ownership
- Turn advancement and doubles
- Board position counter
- START salary counter
- Revision checks
- Duplicate-command protection
- Append-only event sequence

## Current limitation

Property purchases, rent, cards, building upgrades, and victory resolution still use the local match model. V58 provides the secure server protocol and test console; the full board action reducer remains the next networking stage.

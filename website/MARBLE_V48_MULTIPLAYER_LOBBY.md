# ComePlayers Marble V48 — Multiplayer Lobby

V48 upgrades the existing V47 room-code multiplayer foundation.

## Added

- Ready / not-ready confirmation for every online participant.
- Host-controlled seat count, starting cash, Blitz mode, and Free Parking jackpot.
- Rule changes reset all ready confirmations to prevent unexpected starts.
- Host can remove non-host players while the room is waiting.
- Start is blocked until at least two players join and every player is ready.
- Automatic detection and reconnection to the user's latest waiting or active room.
- Public room cards display joined and ready counts.

## Supabase

Run migrations in order:

1. `20260713234500_arcade_cp_monopoly_v43.sql`
2. `20260718153000_arcade_marble_v47_room_codes.sql`
3. `20260719143000_arcade_marble_v48_multiplayer_lobby.sql`

## Important

The V48 UI remains compatible with offline mode. Online ready, host-control, and kick actions require the V48 migration.

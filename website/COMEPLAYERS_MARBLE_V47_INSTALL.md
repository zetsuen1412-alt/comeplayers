# ComePlayers Marble V47

## Included

- New pre-match lobby for the redesigned Marble World board.
- Character selection: Alexia, Nova, Rex, and Miko.
- One, two, or three strategic AI rivals.
- Quick and Classic match modes.
- Online Multiplayer entry connected to the existing realtime Supabase engine.
- Public rooms, global matchmaking, and six-character friend invite codes.
- Existing V46 dice control, liquidation, takeover, World Tour, and special victory rules remain available in Solo mode.

## Supabase migration

Run these migrations in order if they are not already installed:

1. `supabase/migrations/20260713234500_arcade_cp_monopoly_v43.sql`
2. `supabase/migrations/20260718153000_arcade_marble_v47_room_codes.sql`

The V47 migration adds a unique six-character `room_code` to every online room and the `arcade_monopoly_join_room_code` RPC.

## Environment variables

Online rooms require:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Solo mode works without the V47 migration.

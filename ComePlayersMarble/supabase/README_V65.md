# Supabase Setup — ComePlayers Marble V65

Apply V65 after all earlier ComePlayers Marble migrations:

```text
20260720143000_marble_v65_competitive_circuit.sql
```

## Added tables

- `marble_competitive_profiles`
- `marble_ranked_queue`
- `marble_competitive_results`
- `marble_tournaments`
- `marble_tournament_entries`
- `marble_tournament_matches`

All tables have RLS enabled. Direct Data API grants are revoked; clients use authenticated RPC functions.

## RPC functions

- `get_marble_competitive_hub`
- `join_marble_ranked_queue`
- `poll_marble_ranked_queue`
- `cancel_marble_ranked_queue`
- `finalize_marble_competitive_match`
- `create_marble_tournament`
- `join_marble_tournament`
- `get_marble_tournament`
- `advance_marble_tournament`

The migration also replaces `join_marble_realtime_room` so a user with a pre-reserved queue/tournament membership can claim that room without being rejected as an extra player.

## Production checklist

- Enable Auth for every player; anonymous Auth is acceptable for closed testing.
- Disable public Realtime channels.
- Bundle only the Project URL and publishable key.
- Do not expose secret or service-role keys.
- Run Database Advisors after applying the migration.
- Test Solo with two independent sessions and Team with four.
- Verify duplicate result finalization does not change rating twice.
- Verify a non-member cannot finalize a room or advance a tournament.

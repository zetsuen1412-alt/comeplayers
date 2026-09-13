# ComePlayers Marble V61 — Cinematic Loadouts and World Events

Apply:

```text
20260719091500_marble_v61_cinematic_loadouts.sql
```

after V57 through V60.

## New RPC

```text
configure_marble_authoritative_loadout(room_id, character_id, active_skill_id, pendant_id, booster_id)
```

The existing `start_marble_authoritative_match` and `submit_marble_authoritative_command` names remain the public authenticated entry points. V61 wraps and revokes the V60 functions.

## Dashboard settings

- Authentication: enable anonymous sign-ins or require normal login.
- Realtime: disable public channel access.
- Client: use Project URL and publishable key only.
- Never bundle a service-role or secret key.

## Verification query

After starting a test match, inspect the newest snapshot through the game and optionally verify player loadouts in SQL:

```sql
select profile_id, character_id, active_skill_id, skill_used,
       pendant_id, booster_id, free_upgrade_credits,
       travel_credits, rent_shield_percent, rent_shield_charges
from public.marble_authoritative_match_players
order by match_id desc, seat;
```

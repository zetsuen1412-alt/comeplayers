# ComePlayers Marble V63 — Spectator Replay RPC

Apply after the V57–V61 migrations:

```text
20260720101500_marble_v63_spectator_replay.sql
```

V62 was client-only.

## New RPC

```text
get_marble_authoritative_event_history(room_id, after_sequence, limit)
```

The caller must:

- have an authenticated Supabase session;
- be a current member of the room as a player or spectator.

The RPC returns a maximum of 180 ordered authoritative events plus the latest match snapshot and a timeline checksum.

## Required dashboard configuration

- Enable anonymous sign-ins for guest play, or require normal authenticated accounts.
- Disable public Realtime channel access.
- Keep room channels private.
- Bundle only the Project URL and publishable key in the Cocos client.
- Never bundle `service_role`, `sb_secret_`, database passwords, or JWT signing secrets.

## Verification queries

Check that only authenticated callers can execute the replay RPC:

```sql
select routine_name, grantee, privilege_type
from information_schema.routine_privileges
where routine_name = 'get_marble_authoritative_event_history'
order by grantee;
```

Check the newest room event stream:

```sql
select match_id, sequence, kind, actor_profile_id, created_at
from public.marble_authoritative_match_events
order by created_at desc, sequence desc
limit 30;
```

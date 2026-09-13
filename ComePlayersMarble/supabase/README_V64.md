# ComePlayers Marble V64 — Replay Studio Database

Apply after all V57–V63 migrations:

```text
20260720123000_marble_v64_replay_studio.sql
```

## New tables

```text
public.marble_authoritative_replays
public.marble_authoritative_replay_events
```

Both tables have RLS enabled. Direct Data API privileges are revoked; clients use authenticated RPCs only.

## New RPCs

```text
publish_marble_authoritative_replay(room_id, visibility)
list_marble_authoritative_replays(limit)
get_marble_authoritative_replay_by_code(replay_code, after_sequence, limit)
delete_marble_authoritative_replay(replay_id)
```

## Security model

- All RPCs reject a missing `auth.uid()`.
- Publishing is restricted to the room host and a finished authoritative match.
- Private archives are owner-only.
- Unlisted and Public archives require authentication and the exact share code.
- Event pages are capped at 180 rows.
- Function execution is revoked from `PUBLIC` and `anon`, and granted to `authenticated`.
- Do not add direct table grants to the Cocos client.
- Never bundle `service_role`, `sb_secret_`, database passwords, or JWT signing secrets.

## Verification queries

Check function privileges:

```sql
select routine_name, grantee, privilege_type
from information_schema.routine_privileges
where routine_name in (
  'publish_marble_authoritative_replay',
  'list_marble_authoritative_replays',
  'get_marble_authoritative_replay_by_code',
  'delete_marble_authoritative_replay'
)
order by routine_name, grantee;
```

Check RLS status:

```sql
select relname, relrowsecurity
from pg_class
where relname in (
  'marble_authoritative_replays',
  'marble_authoritative_replay_events'
);
```

Check recent archives without exposing event payloads:

```sql
select replay_code, visibility, mode, event_count, created_at
from public.marble_authoritative_replays
order by created_at desc
limit 20;
```

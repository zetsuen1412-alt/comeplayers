# ComePlayers Marble V58 — Authoritative Turn Server

Apply `20260719045800_marble_v58_authoritative_turns.sql` after the V57 room migration.

The migration adds:

- Server-generated dice through `pgcrypto`.
- Host-only authoritative match start.
- Turn ownership validation using `auth.uid()`.
- Optimistic concurrency with `expected_revision`.
- Idempotency keys that return the original result for duplicate commands.
- Append-only authoritative events.
- Private database Broadcast on the existing room topic.
- Read-only RLS access for room members; gameplay writes are RPC-only.

The client must use a publishable key. Never ship a `service_role` or `sb_secret_` key.

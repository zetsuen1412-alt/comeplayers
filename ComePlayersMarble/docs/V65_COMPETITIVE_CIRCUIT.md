# V65 — Competitive Circuit, Server Matchmaking, and Tournament Brackets

## Objective

V65 adds a server-backed competitive layer above the authoritative multiplayer stack from V57–V64. The client no longer pretends that a local AI queue is global. Matchmaking, rating, queue reservations, tournament entries, bracket advancement, and competitive results are stored and validated in Postgres.

## Competitive profile

Each authenticated Supabase user receives one `marble_competitive_profiles` row containing:

- sanitized profile ID and display name;
- server rating and derived tier;
- season points;
- wins, losses, active streak, and best streak;
- tournament championships.

The top twenty profiles are returned by a bounded RPC leaderboard. Direct table reads are not granted to the game client.

## Server-ranked queue

The queue supports `SOLO` and `TEAM` modes.

- Solo waits for two authenticated users.
- Team waits for four authenticated users.
- Region defaults to `GLOBAL` and is restricted to a short allowlisted identifier.
- Initial rating tolerance is ±150 RP.
- The tolerance expands by 75 RP every fifteen seconds, capped at ±600 RP.
- Queue entries expire after ten minutes.
- A matched room reservation lasts twenty minutes.

`pg_advisory_xact_lock` serializes each mode/region matching group. When enough compatible users are present, Postgres atomically creates a private `marble_realtime_rooms` row and reserved membership rows. Reserved players are initially disconnected and not ready; each player must claim the room, connect to Presence, and press Ready before the host can start the authoritative match.

## Result finalization

`finalize_marble_competitive_match` accepts only:

- an authenticated room member;
- a room marked as server-ranked;
- an authoritative match in `FINISHED` phase.

A unique `match_id` row makes rating settlement idempotent. The first successful finalization updates every participant exactly once, then expires the queue reservation. Solo and Team results are both supported.

## Tournament circuit

V65 tournaments are Solo single-elimination cups with four or eight entries.

- The creator is entered automatically.
- One user may belong to only one Open/Active tournament at a time.
- The bracket starts automatically when all slots are filled.
- Each bracket pair receives a reserved private room.
- Authoritative match results are read from Postgres; clients cannot submit a winner manually.
- `advance_marble_tournament` completes finished bracket matches, eliminates losers, creates the next round, and awards the champion once.

The tournament detail RPC returns only game-facing profile IDs and names. Supabase Auth user UUIDs are hidden for other entrants. Match room IDs, invite codes, and private topics are also hidden unless the viewer is one of the two players or the tournament host.

## Security boundary

All V65 tables have RLS enabled and direct access is revoked from `PUBLIC`, `anon`, and `authenticated`. The client uses restricted RPC functions only. Every public RPC checks `auth.uid()`, uses fixed input limits, runs with an empty `search_path`, and has execute permission granted only to `authenticated`.

The client still accepts only the Supabase Project URL and publishable key. Never bundle a secret key or `service_role` key in Cocos.

## Current limits

- Queue notification is polling-based; it does not yet use a per-user Realtime queue topic.
- Tournament matches are Solo only in V65.
- There is no admin cancellation or moderation panel.
- Season rollover is not yet scheduled server-side.
- The migration must be applied and tested against the user's actual Supabase project before production release.

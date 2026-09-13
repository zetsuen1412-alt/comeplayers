# V64 — Replay Studio, Durable Archives, and Share Codes

## Objective

Turn the bounded V63 room replay into a permanent, seekable replay product while preserving the server-authoritative event stream and preventing replay viewers from receiving access to the original room.

## Timeline seek architecture

`AuthoritativeReplayPlayer` now maintains immutable replay checkpoints every 12 events. Seeking performs these steps:

1. Clamp the requested progress to the replay range.
2. Locate the nearest preceding checkpoint.
3. Apply only the remaining events between that checkpoint and the target.
4. Rebuild the 3D presenter at the resulting snapshot.
5. Leave the player paused at the selected frame, or finished at the end.

The Replay Studio controls provide:

- a native Cocos slider;
- jump backward or forward by ten events;
- pause/resume;
- 0.5x, 1x, 2x, and 4x playback;
- skip-to-end;
- current sequence, event count, timestamp, and progress reporting.

Live authoritative controls stay disabled while a replay is playing, paused, or seeking. Returning to live mode reconciles the board to the newest server snapshot.

## Multi-page history

`SupabaseAuthoritativeMatchAdapter` loads replay pages in ascending sequence order:

- maximum 180 events per RPC response;
- maximum 12 pages per client request;
- maximum 2,160 normalized events;
- duplicate sequences removed when pages overlap;
- merged checksum regenerated client-side;
- newest page snapshot retained for reconciliation.

## Durable archive schema

V64 adds:

- `public.marble_authoritative_replays`
- `public.marble_authoritative_replay_events`

A published archive contains:

- owner and source identifiers;
- eight-character replay code;
- visibility and game mode;
- winner, finish reason, round, and event count;
- final authoritative snapshot;
- SHA-256 event checksum;
- a copied append-only event stream.

The copy remains available after the original room is no longer active.

## RPC boundary

The client uses only these RPCs:

- `publish_marble_authoritative_replay`
- `list_marble_authoritative_replays`
- `get_marble_authoritative_replay_by_code`
- `delete_marble_authoritative_replay`

Direct table access is revoked from `PUBLIC`, `anon`, and `authenticated`. Each RPC requires `auth.uid()`, uses a bounded response, and execution is granted only to `authenticated`.

Publishing additionally requires:

- current authenticated user is the room host;
- an authoritative match exists;
- match phase is `FINISHED`;
- at least one authoritative event exists;
- one archive per owner/source match.

## Visibility

- **PRIVATE** — owner-only, including code lookup.
- **UNLISTED** — discoverable only by an eight-character code.
- **PUBLIC** — included in the server replay library and available by code.

The list RPC returns archives owned by the caller plus public archives. The code RPC never exposes a private archive to a non-owner.

## Current limits

- Authentication is still required even for Public and Unlisted replay codes.
- There is no HTTP/deep-link share page outside the Cocos application.
- Replay titles are generated automatically.
- The database migration has been statically validated but must still be applied and tested against the user's live Supabase project.

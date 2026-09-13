# V63 — Spectator Camera and Durable Server Replay

## Objective

Allow room members to watch a live authoritative match without participating, and provide a bounded cinematic replay built from the durable Postgres match-event stream.

## Spectator architecture

The existing room membership role is reused:

- `PLAYER` receives authoritative action controls only during the player's own turn.
- `SPECTATOR` receives snapshots, Realtime Presence, Broadcast events, camera controls, and replay controls.
- Spectators are marked ready automatically and do not count toward the four-player seat limit.
- The current room limit remains four players plus two spectators.

`AuthoritativeBoardOverlay` now treats role as a hard input boundary. A spectator cannot invoke roll, purchase, upgrade, takeover, skill, special-tile selection, or end-turn commands from the board overlay.

## Spectator camera

`Authoritative3DBoardPresenter` adds:

- Overview camera.
- Next-player camera cycling.
- Auto-follow of the current authoritative turn.
- Camera state reset when replay begins.
- Forced snapshot reconciliation after replay or reconnect.

## Durable event history

The V63 migration adds:

```text
get_marble_authoritative_event_history(room_id, after_sequence, limit)
```

The RPC:

- requires an authenticated Supabase session;
- checks room membership through the existing private membership helper;
- returns events ordered by sequence;
- caps one page to 180 events;
- returns the newest authoritative snapshot;
- includes first/last sequence, pagination state, and a SHA-256 timeline checksum;
- revokes execution from `PUBLIC` and `anon`, then grants only `authenticated`.

## Replay pipeline

1. `SupabaseAuthoritativeMatchAdapter` requests a bounded event page.
2. `AuthoritativeReplayProtocol` normalizes, sorts, deduplicates, and caps the event list.
3. `AuthoritativeReplayPlayer` creates a clean starting snapshot.
4. Events are applied in sequence and converted into existing cinematic presentation cues.
5. The 3D presenter animates dice, movement, property actions, payments, bankruptcy, and match completion.
6. At completion or skip-to-end, the latest server snapshot replaces reconstructed state.

## Live/replay isolation

- Live events arriving during replay are not played immediately.
- Server action controls are disabled while replay is playing or paused.
- Online refreshes do not overwrite replay frames.
- Replay completion restores the latest live snapshot.
- Event sequence protection from V61/V62 remains active, preventing stale live effects after reconnect.

## Replay accuracy

Replay reconstruction prioritizes visible match flow. Property visuals use authoritative property records from the latest snapshot when the matching property event is reached. Final money, property, winner, and status values are always reconciled to the newest authoritative snapshot when replay ends.

## Current limits

- One replay load is capped at 180 events.
- No seek slider or arbitrary timeline scrubbing.
- No public match discovery or replay sharing.
- Only current room members can request history.
- This version does not create a permanent cross-season replay archive.

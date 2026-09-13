# V66 Realtime Seasons and Team Cups

## Goals

V66 removes manual ranked queue polling, introduces server-owned monthly seasons, adds Solo/Team tournament routing, and replaces competitive browser prompts with native Cocos input.

## Realtime queue notification

- Topic: `marble-competitive:<auth.uid()>`
- Channel mode: private Broadcast
- Event: `queue_update`
- Delivery source: an `AFTER INSERT OR UPDATE` trigger on `marble_ranked_queue`
- Client behavior: receive notification, then fetch a bounded competitive hub snapshot through RPC

The broadcast does not contain a room invite code. The client reloads the authorized RPC snapshot, which reduces sensitive data exposure in event payloads.

## Season model

Profiles contain:

- `season_id`
- `season_started_at`
- `season_ends_at`
- `lifetime_wins`
- `lifetime_losses`
- `lifetime_tournament_wins`

The rollover function uses a transaction advisory lock. It archives seasonal statistics and resets rating to 1000, season points, win/loss counters, streak, and season tournament wins.

## Team Tournament 2v2

Team cups use separate protected tables to avoid breaking V65 Solo brackets. Participants join individually and are paired by deterministic seed order:

- Seeds 1 + 2 → Team 1
- Seeds 3 + 4 → Team 2
- Seeds 5 + 6 → Team 3
- Seeds 7 + 8 → Team 4

The room membership order is Team 1A, Team 2A, Team 1B, Team 2B so the authoritative TEAM room assigns Team 1 to Blue and Team 2 to Gold.

## Security

- Direct table access is revoked.
- All public competitive operations require `authenticated`.
- Private room credentials are returned only to match participants or the cup host.
- Cross-mode triggers prevent one account from entering simultaneous active Solo and Team cups.
- Cross-table code guards prevent Solo/Team tournament code collisions.
- The client accepts only a publishable key; server secrets are not bundled.

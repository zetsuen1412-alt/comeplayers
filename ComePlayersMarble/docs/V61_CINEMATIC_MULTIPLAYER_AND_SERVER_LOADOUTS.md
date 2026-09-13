# V61 Cinematic Multiplayer and Server Loadouts

V61 connects the authoritative event stream to a bounded Cocos presentation queue and moves character loadouts, active skills, free upgrades, and World Events into the server reducer.

## Event presentation

`AuthoritativeEventPresentationQueue` accepts normalized append-only events, rejects duplicate sequences, bounds memory usage, and converts raw payloads into presentation cues. `AuthoritativeBoardOverlay` plays those cues as event banners, server dice reveals, player-marker movement, and tile pulses. Snapshot rendering remains the source of truth, so reconnect always corrects the presentation state.

Events added in V61:

- `LOADOUT_APPLIED`
- `CHARACTER_SKILL_ACTIVATED`
- `WORLD_EVENT_RESOLVED`

## Server loadout

Each authenticated player configures one character, its matching active skill, an optional pendant, and an optional booster while the room is still in `LOBBY`. The RPC validates every identifier against a fixed allowlist and only updates the caller's own membership row.

When the host starts the match, Postgres copies the loadout into the match player state and applies these bonuses:

- Banker Badge: CP 200,000
- Travel Compass: one Travel Credit
- Architect Blueprint: one free upgrade credit
- Insurance Charm: one 35% rent shield
- Marble Fund: CP 150,000
- Upgrade Permit: one free upgrade credit
- First Class Ticket: one Travel Credit
- Rent Shield: one 50% rent shield

## Character skills

The `ACTIVATE_SKILL` command requires authentication, current-turn ownership, matching revision, no pending decision, and an unused skill. The server resolves all six character skills and records the result append-only.

## Free upgrade authority

V61 captures the pending upgrade cost before the V60 reducer runs. If the player owns a free upgrade credit, Postgres refunds that exact validated server cost, consumes one credit, increments the match revision, updates the idempotent command result, and emits `LOADOUT_APPLIED` with `FREE_UPGRADE_USED`.

## World Events

When room settings enable round events, V61 resolves one event after an `END_TURN` command advances the match into every even round. `lastWorldEventRound` prevents duplicates during retries or reconnect.

Available events:

- Sponsor Drop
- Construction Grant
- Travel Festival
- Insurance Day
- City Maintenance
- Comeback Fund

## Security boundary

- Client uses only a publishable key.
- The server accepts only authenticated users, including Supabase anonymous users.
- Loadout updates are restricted to the caller's own room membership.
- Commands use expected revision and idempotency keys.
- Private Realtime Broadcast remains protected by `realtime.messages` RLS.
- Previous V60 entry points are revoked from client roles and called only inside the V61 security-definer wrappers.

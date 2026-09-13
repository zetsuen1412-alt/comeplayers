# V60 Authoritative Special Tiles and Live Server Board

V60 completes the first full online board reducer by moving the classic special-tile choices into Postgres and adding a Cocos UI that renders the current authoritative snapshot.

## Live Server Board

`AuthoritativeBoardOverlay` renders a 32-tile board directly from `AuthoritativeMatchSnapshot`. It displays:

- all player positions and active turn;
- balances, property counts, Island turns, and bankruptcy state;
- city ownership by seat color;
- Villa/Building/Hotel/Landmark level;
- Olympic multiplier duration;
- last dice, landing tile, pending action, and special result;
- server revision and round;
- only the actions allowed by the latest server snapshot.

The overlay does not calculate outcomes. It only submits a typed command and waits for the returned/broadcast snapshot.

## Fortune

The server draws one of six cards using PostgreSQL cryptographic random bytes:

- Marble Jackpot: +CP 250,000
- Sponsor Contract: +CP 150,000
- System Audit: up to -CP 120,000, including authoritative liquidation/bankruptcy
- First Class Pass: +1 World Travel credit
- Rent Barrier: 50% reduction for the next rent payment
- Tax Rebate: +CP 100,000

The card result is appended as `FORTUNE_CARD_DRAWN`.

## Game Center

Landing creates a `GAME_CENTER` pending action with choices 1, 2, and 3. The client submits only the selected number. Postgres draws the winning number and awards CP 240,000 on a match. The result is appended as `GAME_CENTER_RESOLVED`.

## Olympic

Landing creates an allow-list of up to eight eligible cities owned by the current player. The selected city receives +0.5 rent multiplier, capped at 3.0, for three rounds. Expired multipliers return to 1.0 during authoritative turn advancement and append `OLYMPIC_EXPIRED`.

## World Travel

The server generates up to eight safe city destinations. A free travel credit is consumed first; otherwise CP 150,000 is charged. The server changes position and creates a follow-up purchase or upgrade decision when valid. Opponent-owned destinations are excluded from the safe list in V60.

## Island

Landing stores two Island turns on the player row. A later `ROLL` command does not roll dice while detention remains; the server decrements the counter, records `ISLAND_TURN_SKIPPED`, and waits for authoritative End Turn.

## Rent Shield

A one-use Rent Shield is applied inside the server payment function before asset liquidation. The effective rent is reduced and the charge is consumed atomically in the same transaction.

## Protocol additions

Commands:

- `GAME_CENTER_CHOICE`
- `SELECT_OLYMPIC`
- `SELECT_TRAVEL`

Pending actions:

- `GAME_CENTER`
- `OLYMPIC`
- `WORLD_TRAVEL`

Snapshot additions:

- `specialResult`
- player Island, travel-credit, and rent-shield state
- property Olympic expiration
- bounded server choice options

## Security model

All special commands require an authenticated room player, active phase, current-turn ownership, expected revision, and a unique idempotency key. Choice values must exist in the server-created option array. Previous V59 wrappers are revoked from client roles; only the V60 entry points are executable by `authenticated`.

## Deferred work

The authoritative snapshot is now playable through the 2D Live Board. The next presentation step is an event-stream bridge that drives the existing 3D board, pawn animation, dice animation, camera, and result effects from remote events rather than local decisions.

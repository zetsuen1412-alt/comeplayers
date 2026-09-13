# V62 — 3D Authoritative Board Presentation

## Objective

Present the existing Postgres-authoritative match on the main procedural 3D board without moving game authority back into the client.

## Architecture

`Authoritative3DBoardPresenter` owns a temporary 3D stage containing:

- `BoardView`
- procedural player rigs
- `DiceController`
- `VfxManager`
- a dedicated perspective camera

`FrontEndShell` hides its normal lobby canvas while this stage is active. `AuthoritativeBoardOverlay` remains as a transparent input/control layer.

## Snapshot rules

- The first snapshot places every player and property immediately.
- Sequential realtime events are animated in order.
- Duplicate or stale event sequences are rejected.
- If a snapshot jumps by more than one sequence, the presenter treats this as a reconnect/missed-event condition and reconciles immediately.
- After an event queue finishes, the visual board snaps to the latest server snapshot.

## Event presentation

- `DICE_ROLLED`: physical dice animation, camera focus, movement path, landing effect.
- `WORLD_TRAVEL_COMPLETED`: direct travel movement and travel VFX.
- Property purchase/upgrade/takeover: camera focus, ownership/building sync, VFX.
- Rent and liquidation: coin effects.
- Fortune, skill, and world event: card reveal effects.
- Olympic: Olympic marker and effect.
- Bankruptcy: sad character state.
- Match finish: winner/loser animations and celebration effect.

## Compatibility fix

The authoritative SQL payload uses `from` and `to` for movement. Earlier client parsing only recognized `fromPosition`/`toPosition`. V62 accepts both forms, so remote movement now follows the actual server payload.

## Database

No V62 migration is required. V57–V61 remain the current schema chain.

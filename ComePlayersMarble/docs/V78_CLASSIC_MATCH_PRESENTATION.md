# V78 Classic Match Presentation

V78 is a presentation-focused upgrade built on top of V77's classic tabletop overhaul. It improves moment-to-moment readability without changing authoritative dice results, economic rules, save data, or victory conditions.

## Widescreen adaptation

The lobby, match HUD, and authoritative overlay now use fixed-height adaptation. The rendered backdrop and chrome are wider than the original 1920-unit frame, and the preview/build templates pin the game container to the full viewport. This targets the wide browser viewport shown in user testing, where the previous project left visible unused bands.

## Turn flow

The match now communicates each phase explicitly:

- Roll phase
- Dice/movement phase
- Property decision
- Payment/takeover
- Fortune resolution
- World Travel destination
- Olympic host selection
- Game Center choice
- Result calculation

The phase label is derived from the live `MatchModel` pending-action state, so it represents real gameplay rather than a decorative animation.

## Board feedback

After the authoritative dice result is received, the board displays the actual movement path. The path is cleared after movement. The current tile is highlighted during each step and at the beginning of a turn. Reaching the final tile triggers a short original particle burst.

World Travel and Fortune-card movement use the same route and landing feedback.

## Arrival card

A classic parchment-style arrival card appears after tile resolution begins. It displays:

- Player name
- Tile name
- Tile category
- Real landing result message

Purchase, payment, travel, Olympic, Fortune, and Game Center decision windows remain separate and functional.

## HUD and lobby

The player cards now expose the active seat with a `TURN` badge and subtle scaling. The system ticker stores the latest three real match messages. The lobby adds a compact service ribbon and expands its fallback background for widescreen displays.

## Compatibility

V78 does not alter local save schemas or Supabase authoritative protocols. V77 saves and replay data remain compatible.

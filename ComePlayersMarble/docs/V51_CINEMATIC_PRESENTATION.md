# ComePlayers Marble V51 - Cinematic Presentation

## Goal

V51 improves moment-to-moment feedback without changing deterministic match authority. Dice values, movement paths, property decisions, rewards, and save data still come from the existing model and services. Presentation consumes those results only after they have been validated.

## Dice sequence

Each die now has five visual phases:

1. compressed anticipation;
2. launch and first spin;
3. airborne drift and second spin;
4. small rebound;
5. authoritative face settle and result pulse.

The final face is still applied from `DiceAuthorityResult`. Animation timeout behavior remains intact.

## Player movement

Board movement now calculates a yaw from the next tile direction and uses a bounded parabolic-looking hop made from two deterministic tween segments. Landing squash-and-stretch happens inside the allotted step duration. The model still owns the path and current tile index.

## City presentation

Owner markers and procedural skylines animate from a small scale into their final size. Existing building-level geometry is retained, including the gold landmark tower at the highest level.

## Burst VFX

`VfxRequest` accepts optional `count` and `radius` fields. Values are validated and capped at twelve nodes and radius four. Burst positions use a deterministic ring instead of randomness, preserving repeatable presentation and predictable pool capacity.

New cues:

- Double Bonus
- Coin Burst
- Level Up

## Audio

Seven new semantic cues separate important moments that previously shared generic sounds. Assigned Cocos AudioClips take priority. Web Preview can still use the procedural tone backend when no clip is assigned.

## UI

- Match countdown values pop into place.
- Turn banners slide down and retract.
- Dice results receive a dedicated overlay with normal, power-roll, and double styling.

## Performance boundary

All new effects use existing tweens, procedural primitives, shared materials, and bounded pools. No runtime image, model, video, or reference asset is loaded.

## Copyright boundary

V51 uses original ComePlayers code, geometry, names, balance, color system, and Alexia integration. Reference media remains isolated under `references/` and is not imported by runtime scripts.

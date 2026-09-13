# ComePlayers Marble V98 — Rival Gauntlet & Tactical Replays

## Open the project

1. Extract this ZIP into a new empty folder.
2. Do not overwrite an older project folder.
3. Remove `library`, `temp`, `build`, `.creator`, and `node_modules` if copied from another workspace.
4. Open the extracted folder with Cocos Creator 3.8.8.
5. Run the main project scene.

## Confirm the correct version

The lobby header must show:

`V98 RIVAL GAUNTLET & TACTICAL REPLAYS`

The Career/Missions page must show Gauntlet division, Gauntlet score, podium streak, six circuits, and Tactical Replay Reel entries.

## Main V98 tests

Run:

`npm run test:v98`

This tests Gauntlet scoring, circuit rewards, duplicate prevention, podium streaks, season rollover, save migration, and Tactical Replay integration.

Then run:

`npm run verify`

## Build

`npm run build:web`

The build command requires a local Cocos Creator 3.8.8 executable. Set `COCOS_CREATOR_PATH` when Creator is installed in a non-default location.

## Save compatibility

V97 and older supported local saves are normalized automatically. V98 uses Career progression version 7 and local save version 11.

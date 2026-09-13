# ComePlayers Marble V97 — Rival Contracts & Highlight Reel

## Open the project

1. Extract this ZIP into a new empty folder.
2. Do not overwrite an older project folder.
3. Remove `library`, `temp`, `build`, `.creator`, and `node_modules` if copied from another workspace.
4. Open the extracted folder with Cocos Creator 3.8.8.
5. Run the main project scene.

## Confirm the correct version

The lobby header must show:

`V97 RIVAL CONTRACTS & HIGHLIGHT REEL`

The Career/Missions page must show Rival Rating, the local Rival Board, Rival Contracts, and Highlight Reel.

## Main V97 tests

Run:

`npm run test:v97`

This runs the Rival Contract, season rollover, save migration, and Highlight Reel integration tests.

Then run:

`npm run verify`

## Build

`npm run build:web`

The build command requires a local Cocos Creator 3.8.8 executable. Set `COCOS_CREATOR_PATH` when Creator is installed in a non-default location.

## Save compatibility

V96 and older supported local saves are normalized automatically. V97 uses Career progression version 6 and local save version 10.

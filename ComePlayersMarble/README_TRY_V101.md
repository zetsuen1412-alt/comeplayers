# ComePlayers Marble V101 — Live Replay Academy

## Open the project

1. Extract the ZIP into a new empty folder.
2. Do not overwrite V100.
3. Remove `library`, `temp`, `build`, `.creator`, and `node_modules` if they were copied from another workspace.
4. Open the project with Cocos Creator 3.8.8.
5. The lobby should display `V101 LIVE REPLAY ACADEMY`.

## What to test

- Start a local match and check the new `LIVE ACADEMY` rail.
- The objective is selected from the weakest Replay Academy metric.
- Tempo objective: perform three quick rolls while at least 60% of the timer remains.
- Economy objective: complete three property purchase or development actions.
- Control objective: perform one takeover or World Travel action.
- Resilience objective: finish solvent with at least CP 250,000 cash.
- Complete consecutive objectives to increase the Live Academy streak.
- Confirm the result screen shows objective status, streak, and CP reward.
- Return to Replay Studio or Career and confirm Live Academy totals persist.

## Compatibility

- V100 local saves migrate from version 12 to 13.
- Replay Library migrates from version 3 to 4.
- Existing replays, Replay Coach data, Academy drills, Career, Journey, Rival, ranked, and multiplayer data remain compatible.

## Build note

The Web Desktop build is not included because Cocos Creator 3.8.8 is not installed in the packaging environment. Run `npm run build:web` on a machine with Cocos Creator configured.

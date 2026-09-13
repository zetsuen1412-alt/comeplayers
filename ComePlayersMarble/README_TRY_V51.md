# Try ComePlayers Marble V51

## Required software

- Cocos Dashboard
- Cocos Creator 3.8.8

## Open the project

1. Extract the Full Source ZIP.
2. Open Cocos Dashboard and choose **Add**.
3. Select the `ComePlayersMarble` folder containing `package.json`.
4. Open it with Cocos Creator 3.8.8.
5. Wait until asset import finishes.
6. Open `assets/scenes/Match.scene`.
7. Press Preview.

## Test the V51 presentation update

1. Start a local match from **Create Room** or **Quick Match**.
2. Roll the dice and confirm each die launches, spins, bounces, and settles.
3. Confirm the large dice-result card appears after every roll.
4. Roll doubles and confirm the gold double-bonus sound and VFX burst.
5. Watch each player piece face its direction and hop from space to space.
6. Buy or upgrade a city and confirm the owner marker and skyline grow into place.
7. Pass START and confirm the CP coin burst.
8. Win Game Center and confirm the celebration and coin burst.
9. Finish a match and confirm the victory burst. If the saved career levels up, confirm the level-up cue.

## Optional authored audio clips

V51 works without external sound files by using procedural placeholder tones in Web Preview. To replace them, assign AudioClip assets in `GameBootstrap.audioClips` using these names:

- `turn-start`
- `dice-roll`
- `dice-land`
- `double-bonus`
- `movement-step`
- `player-land`
- `property-purchase`
- `building-upgrade`
- `level-up`

Existing V50 cue names remain supported.

## Save compatibility

V49 and V50 local save data remain compatible. V51 changes presentation only and does not change economy authority or save schema.

## Publishing

The `references/` directory is design-study material only. Remove it before distributing a public build.

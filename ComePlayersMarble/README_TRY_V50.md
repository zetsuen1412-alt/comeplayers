# Try ComePlayers Marble V50

## Required software

- Cocos Dashboard
- Cocos Creator 3.8.8

## Open the project

1. Extract the ZIP.
2. Open Cocos Dashboard.
3. Choose **Add**.
4. Select the `ComePlayersMarble` folder containing `package.json`.
5. Open the project with Cocos Creator 3.8.8.
6. Wait for asset importing to finish.
7. Open `assets/scenes/Match.scene`.
8. Press Preview.

## Test V50

1. Choose **Create Room** or **Quick Match**.
2. Press **Ready & Start**.
3. Confirm the READY / 3 / 2 / 1 / START sequence appears.
4. Confirm each turn displays a player banner.
5. Complete a match.
6. Check the result screen for CP, XP, level, and mission rewards.
7. Return to Lobby and open **Missions**.
8. Confirm the profile, mission progress, and recent match record are saved.

## Existing V49 save data

V49 local save data remains compatible. Career data is added automatically the first time V50 loads the existing save.

## Reset local progress

Use browser storage/devtools for the preview origin and remove:

`comeplayers.local-save.v2`

The next launch creates a fresh local profile.

## Publishing

The `references/` directory is design-study material only. Remove it before distributing a public build.

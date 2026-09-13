# ComePlayers Marble V79

V79 adds functional classic dice control and stronger board-motion presentation.

## Clean preview steps

1. Extract V79 into a new folder. Do not overwrite an older project folder.
2. Close Cocos Creator and every old localhost preview tab.
3. Delete `library`, `temp`, `build`, and `.creator` if they were generated previously.
4. Open the extracted project with Cocos Creator 3.8.8.
5. Wait for asset import to finish, then preview `assets/scenes/Match.scene`.
6. Confirm the lobby header says `CLASSIC CLIENT V79` and `V79 DICE CONTROL & BOARD MOTION`.

## Visible V79 checks

- The bottom center contains a purple ROLL button.
- The left side of the roll dock contains AUTO/ODD/EVEN controls.
- LOW/MID/HIGH selects a preferred total range.
- Selected controls show a gold diamond marker.
- After rolling, route points are connected by glowing rails.
- The final destination has a raised animated beacon.
- One center lamp pulses more strongly for the active player.
- Buying or upgrading property triggers rising construction beams before the building settles.

## Dice-control behavior

Dice control is a probability modifier, not a guaranteed roll. It is implemented only for local authority. Supabase/online authority remains server-controlled.

- LOW targets totals 2-5.
- MID targets totals 6-8.
- HIGH targets totals 9-12.
- ODD and EVEN apply a parity preference.
- AUTO applies no parity preference.

## Build

Set `COCOS_CREATOR_PATH` when Cocos Creator is installed outside the default Windows path, then run:

```bash
npm run verify
npm run build:web
npm run preview
```

The expected web output is `build/web-desktop-v79`.

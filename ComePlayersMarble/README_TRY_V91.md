# ComePlayers Marble V91 - Strategic Takeover Director

## Open the project

1. Extract this full project into a new empty folder.
2. Do not overwrite V90.
3. Ensure `library`, `temp`, `build`, `node_modules`, and `.creator` are absent before first launch.
4. Open the folder in Cocos Creator 3.8.8.
5. Wait for Cocos Creator to reimport all assets.

## Confirm the correct version

The lobby header must show:

`V91 STRATEGIC TAKEOVER DIRECTOR`

The match HUD must show:

`WORLD MAP - STRATEGIC TAKEOVER DIRECTOR - V91`

## Test the main feature

1. Start a local match.
2. Land on an opponent-owned non-Landmark city.
3. Complete the rent payment.
4. Review the takeover panel before choosing an action.
5. Confirm that it shows strategic score, projected rent, reserve after purchase, reserve risk, color-group transitions, and tactical tags.
6. Select TAKEOVER and confirm that the ownership-transfer rings, control beam, fins, and seal play on the tile.

## Build

Run `npm run build:web` only after configuring a valid Cocos Creator 3.8.8 executable or `COCOS_CREATOR_PATH`.

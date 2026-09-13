# ComePlayers Marble V87 - Classic Development Planner

1. Extract this full project into a new empty folder.
2. Open it with Cocos Creator 3.8.8.
3. Remove `library`, `temp`, `build`, `node_modules`, and `.creator` if copied from another workspace.
4. Open `assets/scenes/Match.scene` and run Preview.
5. The lobby must show `V87 CLASSIC DEVELOPMENT PLANNER`.

## What to test

- Land on an unowned city and verify four development packages can appear: Land, Villa, Building, and Hotel.
- Confirm each package shows total cost, projected rent, payback landings, and SAFE/TIGHT/DANGER reserve status.
- Buy a higher package and verify the city immediately reaches the selected building level.
- Land on your own developed city and verify multi-level upgrade packages are offered through Landmark.
- Complete a colour group through a purchase and verify the selected package shows `SET COMPLETE x2`.
- Confirm City Intel displays current rent threat and the next upgrade forecast.
- Confirm bots choose the strongest affordable non-dangerous package instead of always buying land only.

V87 keeps online authoritative snapshots server-controlled. The local development planner changes offline/local decisions while authoritative online state remains controlled by the server.

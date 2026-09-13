# ComePlayers Marble V90 — Bankruptcy Rescue & Liquidation

## Open the full project

1. Extract the V90 ZIP into a new empty folder.
2. Do not overwrite V89.
3. Remove `library`, `temp`, `build`, `node_modules`, and `.creator` if they were copied from another folder.
4. Open the project with **Cocos Creator 3.8.8**.
5. Run the `Match` scene or create a Web Desktop build.

The correct lobby header shows:

`V90 BANKRUPTCY RESCUE & LIQUIDATION`

## Test the new system

1. Start a local match.
2. Buy and develop several properties.
3. Let the player cash reserve become lower than an opponent's rent.
4. Land on the opponent's city.
5. The game should automatically sell building levels first.
6. If more money is needed, low-priority land should be returned to the bank.
7. The payment window should report the recovered value and every asset action.
8. The board should update downgraded buildings or clear repossessed properties.
9. Bankruptcy should occur only when liquidation still cannot cover the rent.

## Recovery rates

- Building recovery: **70%** of the relevant construction step.
- Land recovery: **60%** of purchase price.

## Important limitation

The source and ZIP are statically verified. A Web Desktop build is not included because Cocos Creator 3.8.8 is not installed in the packaging environment. Runtime presentation must be checked after opening the project in Cocos Creator.

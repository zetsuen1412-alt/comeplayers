# ComePlayers Marble V75

Open this clean project with Cocos Creator 3.8.8 and run the main scene.

V75 closes a major gameplay-parity gap by implementing the three classic instant victory paths and making them visible throughout the match.

## Main checks

1. Buy all properties in three complete color groups and confirm **TRIPLE MONOPOLY** ends the match.
2. Buy every ownable city on one board side and confirm **LINE MONOPOLY** ends the match.
3. Collect Alexia Park, Neon Falls, Sky Temple, and Marble Observatory and confirm **TOURISM MONOPOLY** ends the match.
4. Watch the player panels update Triple, Line, and Tourism progress after every property change.
5. Confirm the victory banner stays visible before the complete result screen appears.
6. Confirm the structural winner is ranked first and the correct victory reason appears in career history and replay summaries.
7. Confirm online authoritative snapshots remain the source of truth and are not locally overridden.
8. Confirm old V74 progression and career saves still load without migration.

Run `npm run verify` before creating a release build.

The clean archive intentionally excludes `library`, `temp`, `build`, `node_modules`, and `.creator`.

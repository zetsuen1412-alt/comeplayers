# ComePlayers Marble V86 - Color Monopoly Economy

1. Extract this full project into a new empty folder.
2. Open it with Cocos Creator 3.8.8.
3. Remove `library`, `temp`, `build`, `node_modules`, and `.creator` if copied from another workspace.
4. Open `assets/scenes/Match.scene`.
5. Run Preview. The lobby must show `V86 COLOR MONOPOLY ECONOMY`.

## What to test

- Buy every city in one colour group.
- Confirm the completed group receives animated gold gates and crowns.
- Land an opponent on one of those cities.
- Confirm the payment dialog shows `COLOR MONOPOLY x2`.
- Confirm City Intel displays the final multiplied rent.
- In Team Match, split a colour group between two allied players and confirm the team still completes the set.

V86 keeps authoritative online snapshots server-controlled. The client visualizes completed online colour groups but never rewrites server rent or match state.

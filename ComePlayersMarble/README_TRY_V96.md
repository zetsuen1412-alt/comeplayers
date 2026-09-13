# ComePlayers Marble V96 - Season Archive & Rival Board

Open the project with Cocos Creator 3.8.8 and preview the main scene.

Expected lobby markers:

`V96 SEASON ARCHIVE & RIVAL BOARD`

Expected match header:

`WORLD MAP • SEASON ARCHIVE COMMAND • V96`

Open Missions / Career and verify:

- Lifetime Journey XP is displayed separately from current-season Journey XP.
- The current season reward total and best archived season XP are visible.
- A six-entry `LOCAL RIVAL BOARD` is displayed and clearly labels the human player as `YOU`.
- The current local rival rank updates from the human player's current Journey XP.
- The latest archived Journey season is listed when archive history exists.

Season rollover verification:

- Complete a match after the UTC calendar month changes.
- The previous Journey season is archived exactly once.
- The archive stores season XP, tier, Prestige, season reward CP, Perfect Day/Week totals, and best activity streak.
- Current-season tier, Prestige, mission cycle, and season reward counters reset without deleting lifetime totals.
- The result screen displays `SEASON ARCHIVE` and a turquoise archive-ring presentation around the human player.
- Repeating matches in the new season does not create duplicate archive entries.

V95 local saves are migrated from save version 8 to version 9. Career data is migrated from version 4 to version 5. Generated and cache folders are intentionally excluded from the release ZIP.

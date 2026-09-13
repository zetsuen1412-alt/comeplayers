# ComePlayers Marble V95 - Journey Prestige & Perfect Streaks

Open the project with Cocos Creator 3.8.8 and preview the main scene.

Expected lobby markers:

`V95 JOURNEY PRESTIGE & PERFECT STREAKS`

Expected match header:

`WORLD MAP • JOURNEY PRESTIGE • V95`

Open Missions / Career and verify:

- World Journey base tier progress remains available through tier 20.
- Prestige progress appears after the base Journey is completed.
- Active-day streak and best streak are displayed.
- Perfect Day and Perfect Week progress are displayed.
- Three daily missions and four weekly missions retain UTC reset behavior.

Finish local matches and verify:

- The first completed match of a new UTC day grants a streak Journey XP bonus.
- Completing all daily missions awards `PERFECT JOURNEY DAY` once for that day.
- Completing all weekly missions awards `PERFECT JOURNEY WEEK` once for that week.
- Crossing a Prestige threshold awards CP and lists `JOURNEY PRESTIGE` in the final result.
- Repeating matches in the same cycle cannot award the same Perfect Cycle or Prestige reward twice.
- A second magenta Prestige ring and crown appear when a Prestige reward is unlocked.

V94 local saves are migrated from save version 7 to version 8. Career data is migrated from version 3 to version 4. Generated and cache folders are intentionally excluded from the release ZIP.

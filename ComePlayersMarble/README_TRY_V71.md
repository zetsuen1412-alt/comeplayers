# ComePlayers Marble V71

V71 is the Career Intelligence update and remains compatible with V70 local saves.

## What to test
1. Open **Missions / Career** from the front-end shell.
2. Confirm Career completion and Recommended mission appear.
3. Complete several matches and confirm Recent form, Momentum, and Avg rank update.
4. Confirm existing V70 career level, credits, missions, badges, and match history remain available.

## Commands
- `npm run verify` verifies the clean source release.
- `npm run build:web` creates `build/web-desktop-v71` when Cocos Creator 3.8.8 is installed.
- `npm run preview` serves the generated web build.

## Save compatibility
No save schema was changed. All intelligence values are derived from existing career match history and progression totals.

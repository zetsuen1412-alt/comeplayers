# ComePlayers Marble V70

V70 is the Career Prestige update. It builds on V69 without resetting local saves.

## New career features

- 13 total career missions.
- Career Mastery tiers and progression targets.
- Achievement badges calculated from lifetime match statistics.
- Two elite missions with larger credit rewards.

## Test in Cocos Creator

1. Open this folder using Cocos Creator 3.8.8.
2. Allow Cocos Creator to regenerate `library` and `temp`.
3. Open the main project scene.
4. Start Preview and enter `MISSIONS` from the front-end menu.
5. Confirm Mastery tier, progress target, mission count, and badges are visible.
6. Complete a match and confirm rewards and mission progress are saved.

## Commands

- `npm run verify` validates release source integrity.
- `npm run build:web` builds `build/web-desktop-v70` when Cocos Creator is installed.
- `npm run preview` serves the generated web build.

## Compatibility

V69 career save data is compatible. V70 derives its new tiers and badges from existing lifetime totals and does not change the career save schema.

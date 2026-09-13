# ComePlayers Marble V62 — 3D Authoritative Board

## What changed

V62 brings Supabase authoritative events from the 2D diagnostic mirror onto the procedural Cocos 3D board. The database snapshot remains the source of truth; the 3D stage only presents validated server events.

## How to try it

1. Open the project in Cocos Creator 3.8.8.
2. Open `assets/scenes/Match.scene` and press Preview.
3. Configure Supabase using the existing V57–V61 instructions.
4. Create an online room in one browser and join from a second browser/profile.
5. Ready both players and start the server match.
6. Open **ONLINE**, then choose **OPEN 3D SERVER BOARD**.
7. Roll the server dice and use the authoritative action buttons.
8. Refresh one browser and reconnect. The board should snap to the latest server snapshot without replaying old events.

## Notes

- V62 does not require a new database migration. Keep migrations V57 through V61 applied.
- The 3D presenter hides the lobby while active and restores it when **CLOSE** is pressed.
- Reduced camera motion is respected.
- Remote players use procedural colored character rigs when final character prefabs are not assigned.

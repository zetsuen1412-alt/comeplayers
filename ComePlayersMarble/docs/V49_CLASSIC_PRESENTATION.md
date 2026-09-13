# ComePlayers Marble V49 - Classic Presentation Merge

## Goal

V49 merges the playable Cocos Creator project with the supplied reference library and recreates the high-level PC marble-game flow using original ComePlayers code, balance, names, artwork, and UI geometry.

Reference media remains under `references/` and is never loaded by the runtime. Production assets live only under `assets/`.

## Implemented in V49

### Lobby and room flow

- Three-column classic lobby: Alexia loadout, channel/room browser, and player hub.
- Channel cycling and All/Solo/Team room filters.
- Six deterministic room-list entries with open, full, private, and event states.
- Selected-room details, Join Room, Create Room, and Quick Match actions.
- Four-slot waiting room with host/ready labels and team grouping.
- Horizontal map/rules strip that no longer overlaps player slots.
- Local player-count, turn timer, auto-roll, and Ready & Start controls.

### Board presentation

- Original blue/gold table frame and dark recessed board center.
- Stronger city color groups and raised tile caps.
- Procedural building clusters and landmark silhouettes.
- Distinct special-tile monuments.
- More character-like procedural player pieces instead of plain capsules.
- Corner-oriented player HUD, top match bar, round/timer controls, and bottom dice dock.

### Character progression

- Existing pack purchase, deterministic reveal, equip, material selection, combine, and point redemption remain active.
- New direct Character Card Upgrade action consumes one upgrade point and raises the focused equipped card by one star, up to five stars.
- Upgrade results use the same committed-save-before-reveal transaction boundary as packs and combine results.

### Alexia presentation

- Added an original ComePlayers Alexia image at `assets/resources/alexia/AlexiaLobby.png`.
- Lobby tries to load the imported SpriteFrame from Cocos `resources` and falls back to the procedural portrait if the image has not finished importing.

## Reference library merged

- Original guide PDF.
- Original image reference ZIP plus an extracted browsable copy.
- Existing long-form gameplay videos.
- Three newly supplied short videos renamed by analyzed flow.
- Contact sheets for the guide and all three short videos.

## Copyright boundary

This build does not include Netmarble executables, decoded game packages, proprietary sprites, music, sound effects, logos, balance tables, or source code. References are bundled only as private design-study material supplied by the project owner. Do not publish or redistribute the `references/` directory.

## Open and run

1. Install Cocos Creator 3.8.8.
2. Add this project folder in Cocos Dashboard.
3. Wait until Cocos finishes importing `assets/resources/alexia/AlexiaLobby.png` and creates its `.meta` file.
4. Open `assets/scenes/Match.scene`.
5. Press Preview.
6. Use Create Room or Quick Match to enter the waiting room, then Ready & Start.

For a distributable build, use Project -> Build and choose Web Desktop or Windows.

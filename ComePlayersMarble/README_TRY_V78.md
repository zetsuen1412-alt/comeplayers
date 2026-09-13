# ComePlayers Marble V78

V78 focuses on classic match presentation and widescreen usability.

## Important clean-preview steps

1. Extract V78 into a new folder. Do not overwrite an older project folder.
2. Close Cocos Creator and every old localhost preview tab.
3. Delete `library`, `temp`, `build`, and `.creator` from the extracted project if Cocos generated them previously.
4. Open the extracted project with Cocos Creator 3.8.8.
5. Wait for asset import to finish, then preview the `Match.scene` scene.
6. Confirm the lobby header says `CLASSIC CLIENT V78` and `V78 MATCH PRESENTATION`.

## Visible V78 checks

- The lobby fills wide browser windows without the old large empty side or top bands.
- The lobby event ribbon shows channel, room, player, ping, reward, and V78 client data.
- During a roll, glowing route points appear across the destination path.
- The active tile has a pulsing halo.
- A parchment arrival card appears after landing.
- The phase ribbon changes between roll, property, payment, Fortune, travel, Olympic, Game Center, and result states.
- The bottom system ticker remembers the latest three match messages.
- The active player card shows `TURN` and is slightly emphasized.

## Build

Set `COCOS_CREATOR_PATH` when Cocos Creator is installed outside the default Windows path, then run:

```bash
npm run verify
npm run build:web
npm run preview
```

The expected web output is `build/web-desktop-v78`.

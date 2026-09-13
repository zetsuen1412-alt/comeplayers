# ComePlayers Marble V56 — Online Foundation & Replay Library

## Requirements

- Cocos Creator 3.8.8
- Windows 10/11 recommended for Editor Preview

## Preview

1. Add the `ComePlayersMarble` folder to Cocos Dashboard.
2. Open it with Cocos Creator 3.8.8.
3. Wait for asset import to finish.
4. Open `assets/scenes/Match.scene`.
5. Press Preview.

## Try the Online Center

1. Open **ONLINE** from the bottom navigation.
2. The game creates one persistent local profile ID, player tag, and six-character friend code.
3. Press **CREATE FRIEND ROOM**.
4. Add test players until four player slots are occupied.
5. Add up to two spectator slots.
6. Press **SIMULATE DISCONNECT**, then **RECONNECT HOST**.
7. Press **PREPARE CLOUD BACKUP** to generate a revisioned checksum manifest.
8. Press **SIMULATE SERVER ACK** to test the synced state.

## Try the Replay Library

1. Complete a Solo, Team, or Ranked match.
2. Return to the lobby.
3. Open **REPLAYS**.
4. Review the match mode, round, winner, duration, event count, event preview, and checksum.
5. Play more matches to store up to twelve recent records.
6. Use **DELETE REPLAY** to remove the focused record.

## Save migration

V55 local-save version 4 automatically migrates to V56 local-save version 5. Existing settings, characters, inventory, career, missions, ranked rating, and match history remain intact. New online-profile and replay-library sections receive safe defaults.

## Important online notice

V56 is an online-ready foundation, not a public server release. Friend-room guests and server acknowledgements in the preview are simulated locally. No personal data is uploaded. A Supabase, WebSocket, or REST transport adapter must be implemented and secured before real public multiplayer or cross-device cloud save is enabled.

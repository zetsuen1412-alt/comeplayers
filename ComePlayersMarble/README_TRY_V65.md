# ComePlayers Marble V65 — Competitive Circuit

## Install the update

1. Replace the V64 project files with the V65 Replace Files package.
2. Run `npm ci` in the `ComePlayersMarble` folder.
3. Apply the migrations from V57 through V64 if they are not already installed.
4. Apply:

```text
supabase/migrations/20260720143000_marble_v65_competitive_circuit.sql
```

5. Keep Anonymous Sign-Ins enabled for guest testing, or use normal authenticated accounts.
6. Keep Realtime public-channel access disabled and use private channels.
7. Open `assets/scenes/Match.scene` in Cocos Creator 3.8.8 and press Preview.

## Test server-ranked matchmaking

1. Open the game in two browser profiles for Solo, or four profiles for Team.
2. Open **COMPETE**.
3. Select Solo or Team using the existing room mode control.
4. Press **QUEUE SOLO** or **QUEUE TEAM** on every profile.
5. Press **POLL QUEUE** until the server returns a matched six-character room code.
6. Press **JOIN MATCHED ROOM**.
7. Every player presses Ready.
8. The reserved room host starts the authoritative match.
9. Finish the match, return to **COMPETE**, and press **FINALIZE SERVER RESULT**.
10. Refresh the global standings and confirm the result is not applied twice.

## Test a tournament

1. Open **COMPETE → CREATE / JOIN CUP**.
2. Enter `C` to create a tournament.
3. Choose a name and capacity of 4 or 8.
4. Share the eight-character tournament code with the other profiles.
5. Other players enter the code through **CREATE / JOIN CUP**.
6. When the bracket is full, each pair receives a private room.
7. Press **JOIN BRACKET MATCH**, Ready, and start the authoritative match.
8. After the match finishes, press **ADVANCE / SYNC BRACKET**.
9. Winners receive the next-round room. Repeat until the champion is shown.

## Important

- Ranked and tournament rooms reserve membership before connection. V65 updates the room-join RPC so reserved users can claim a room even when all player slots are already reserved.
- A player must still connect and press Ready; reservations alone cannot start a match.
- Tournament room identifiers are returned only to the two assigned players and the tournament host.
- Queue entries expire after ten minutes and matched rooms after twenty minutes.
- Native mobile/desktop builds still need a proper Cocos `EditBox` flow for tournament-code input. Web Preview uses the browser prompt during development.

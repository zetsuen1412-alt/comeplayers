# ComePlayers Marble V54 - Team Clash

## Open the project

1. Open Cocos Dashboard.
2. Add the `ComePlayersMarble` folder.
3. Use Cocos Creator 3.8.8.
4. Open `assets/scenes/Match.scene`.
5. Press Preview.

## Try Team Match

1. Open `CREATE ROOM` or `QUICK MATCH`.
2. Press `MODE: SOLO` until it becomes `MODE: TEAM`.
3. Team mode automatically enables four players.
4. Slots alternate between Team Blue and Team Gold:
   - Player 1 and Player 3: Team Blue.
   - Player 2 and Player 4: Team Gold.
5. Press `READY & START`.

## Team rules

- Teammates never pay rent to each other.
- Teammate properties cannot be taken over through an ally landing.
- AI considers teammate properties when completing city groups.
- AI treats teammate cities as safe World Travel destinations.
- A team wins when the opposing team has no solvent players left.
- At the round limit, combined team net worth determines the winning team.
- Both members of the winning team use the celebration animation.
- The local human receives a career win when Team Blue wins, even if an AI partner ranks above the human individually.

## Compatibility

V53 room settings migrate to V54 automatically. Existing character cards, pendants, boosters, career history, missions, and local CP remain compatible.

## Limitation

This environment does not include the Cocos Creator editor. Final scene preview and platform builds must be verified in Cocos Creator 3.8.8 on the development computer.

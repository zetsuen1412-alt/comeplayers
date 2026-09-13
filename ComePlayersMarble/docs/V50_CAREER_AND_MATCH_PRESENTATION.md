# ComePlayers Marble V50 - Career and Match Presentation

## Goal

V50 continues the Cocos Creator classic-marble rebuild with a more complete match flow and persistent local progression. The update keeps authority, economy, and card systems from V49 while making the start, turn changes, and result ceremony feel closer to a polished PC marble game.

## Match presentation

- Full-screen Skyline Circuit match intro.
- READY, 3, 2, 1, START countdown before turn timing begins.
- Per-turn banner with player color, current round, and timer duration.
- Extra-turn banner for doubles.
- Result overlay now includes saved CP, XP, level-up, and mission-completion information.

The countdown is presentation-only. It never changes dice authority, board state, or the deterministic model.

## Persistent career

A new `CareerProgressionData` section is added to the existing version-2 local save bundle as an additive field. Older V49 saves remain valid and automatically receive default career data.

Saved career state includes:

- level and current experience;
- total matches, wins, podiums, and win rate;
- current and best win streak;
- total property actions, World Travel uses, Game Center wins, and takeovers;
- up to eight recent local match records;
- claimed career mission IDs;
- total locally earned reward credits.

## Match rewards

Every completed local match records the human player's final rank and activity. Rewards combine:

- participation reward;
- rank reward;
- property action bonus;
- World Travel bonus;
- Game Center win bonus;
- takeover bonus;
- one-time career mission rewards.

The result is persisted before CP is granted to the local character-wallet balance. If persistence fails, no currency is added and the result screen reports the failure.

## Career missions

- FIRST MATCH: complete one match.
- CITY BUILDER: purchase or upgrade ten properties.
- WORLD TRAVELER: use World Travel once.
- MARBLE CHAMPION: win three local matches.

Mission rewards are automatically granted once and remain claimed after restarting the project.

## Front-end integration

- Header displays saved level and rank title.
- Player Hub displays actual win rate and record.
- Lobby mission rows display real saved progress.
- Missions page now shows career XP, active mission, and most recent match record.
- Character currency displays saved CP together with career XP.

## Copyright boundary

The runtime still uses original ComePlayers code, naming, balance, UI geometry, procedural visuals, and Alexia artwork. Reference videos, PDF files, and image archives remain isolated under `references/` and are not loaded by the game.

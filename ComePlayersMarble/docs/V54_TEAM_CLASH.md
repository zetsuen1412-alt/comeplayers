# V54 Team Clash

## Goal

V54 adds a complete local 2v2 rule set while preserving the existing solo match. It is implemented as an original ComePlayers mode and does not use Netmarble source code or runtime assets.

## Match settings version 3

`MatchSettingsData` now stores `matchMode` with two values:

- `SOLO`: two to four independent players.
- `TEAM`: four players divided into Blue and Gold teams.

Version-2 settings migrate to version 3 as Solo. Selecting Team forces four occupied slots to prevent invalid 2v1 or empty-partner games.

## Team assignment

Teams alternate by turn order:

- P1: Blue.
- P2: Gold.
- P3: Blue.
- P4: Gold.

This keeps opposing teams interleaved during each round.

## Economy rules

Landing on a teammate-owned property produces no rent payment and no takeover decision. Ownership remains individual, while end-of-match team score combines cash, property value, city count, and building count.

## AI cooperation

Bots now receive teammate property indices when evaluating a purchase. This increases the value of properties that help the team complete a board group. World Travel destinations also expose the owner's team, allowing bots to treat ally cities as safe destinations instead of enemy-rent hazards.

## Victory and results

Team matches finish when only one team has solvent players or the round limit is reached. Results include:

- Winning team.
- Aggregate Blue and Gold net worth.
- Solvent member count.
- Individual ranking inside the same result screen.

Career progression counts a win when the human belongs to the winning team. Both winning-team pieces celebrate.

## HUD and lobby

The waiting room includes a mode toggle, dynamic room title, team bands, locked four-player setup in Team mode, and an ally-rent rule summary. During play, player panels and turn banners display team membership. The result screen displays combined team scores.

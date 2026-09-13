# V94 World Journey Missions

V94 adds a time-based progression layer without changing match rules or server authority.

## Journey season

- A Journey season is identified by UTC year and month.
- Each season contains twenty reward tiers.
- Every tier requires 500 Journey XP.
- Tier rewards are granted automatically when the XP threshold is crossed.
- Major tiers at 5, 10, 15, and 20 provide larger CP rewards.

## Daily and weekly missions

The service selects mission sets deterministically from the cycle identifier. This means the same UTC day or week always produces the same mission set on every reload.

Daily cycles expose three missions and reset at 00:00 UTC. Weekly cycles expose four missions and reset every Monday at 00:00 UTC.

Mission categories include:

- Match completion and placement
- Wins and classic victory conditions
- Property purchases and upgrades
- World Travel
- Game Center wins
- Property takeovers

## Match integration

Every completed local match can grant Journey XP from:

- Match completion
- Winning and podium placement
- Performance score
- Match Legacy Awards
- Triple, Line, or Tourism Monopoly victory
- Property, travel, Game Center, and takeover activity

Mission and tier CP rewards are included in the career reward total before currency is committed.

## Save migration

Career progression version 3 adds a nested Journey progression object. Missing V93 values normalize to a clean Journey state. Local save version 7 includes version 6 in its migration candidates and legacy key list.

## Presentation

The Career page displays season, tier, reset times, active daily and weekly missions, and total Journey rewards. The result screen displays Journey XP and reward breakdowns. Mission or tier completion triggers an original 3D World Journey ring and orbit around the human player.

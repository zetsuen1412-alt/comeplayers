# ComePlayers Marble V97 — Rival Contracts & Highlight Reel

## Release goal

V97 turns the V96 local Rival Board into an actual seasonal progression system. Rival ranking is no longer a static comparison generated relative to the player. Each rival now has a deterministic season rating, while the player's Rival Rating changes after every completed match.

## Rival Rating

- New seasons begin at 1,000 RR.
- Placement, performance score, Match Legacy Awards, and classic Monopoly victories affect the rating change.
- Rating changes are bounded to prevent a single match from breaking progression.
- The six-entry Rival Board is sorted by rating.
- Lifetime best rank and season best rank are persisted separately.

## Seasonal Rival Contracts

Four contracts are available every Journey season:

1. Rival Debut — complete one match.
2. Podium Hunter — reach three podiums.
3. Elite Signal — earn two A-grade or S-grade performances.
4. Rival Board Champion — reach local rank #1.

Contract rewards include CP and Journey XP. Every reward is stored using a unique contract ID, so it cannot be granted twice.

## Highlight Reel

Career progression exposes up to five recent highlight matches. A match enters the reel when it has a custom highlight, an A/S performance, or a classic victory. The Career page presents the three newest highlights next to the local Rival Board and season archive.

## Save migration

- Career progression version: 6.
- Local save version: 10.
- V96 and older supported saves are normalized automatically.
- Monthly rollover archives final Rival Rating, final Rival rank, and completed contract count.
- Lifetime Rival wins, best rank, and Rival reward credits remain intact.

## Presentation

- Career UI shows RR, rating delta, current rank, best rank, contract progress, Rival rewards, and highlight reel.
- Result UI shows rating changes and contract rewards.
- A new V97 3D Rival Contract effect surrounds the human character after rating changes or contract completion.
- Rank #1 adds a dedicated Rival Champion crown.

## Compatibility

Rival progression does not alter dice results, board economy, property ownership, classic victory conditions, replays, ranked rating, or authoritative multiplayer state.

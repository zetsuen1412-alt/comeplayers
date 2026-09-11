# ComePlayers Arcade V37

## What changed

- Replaced the **Play** menu label in ComePlayers Messages with **Games**.
- Replaced marketplace links in that dropdown with browser-game links.
- Added a new `/arcade` page containing ten playable lightweight games.
- Added local browser high-score storage for every game.
- Added keyboard, mouse, and touch controls where applicable.
- Added `/arcade` to the public sitemap.

## Included games

1. Alexia Dash
2. Aim Challenge
3. Squad Snake
4. CP Kart Mini
5. ComePlayers Arena
6. Bomb Arena
7. Tower Rush
8. Pixel Penalty
9. Memory Battle
10. Gaming Trivia

## Installation

Extract this ZIP into the ComePlayers project root and allow the files to be replaced.
No SQL migration and no new npm dependency are required.

## Verification

```bash
cd website
npm run typecheck
npm run build
```

Then verify:

- Open `/messages` and confirm **Games** appears in the top navigation.
- Open the dropdown and choose **Instant Play**.
- Confirm `/arcade` displays all ten game cards.
- Play a game, finish a round, refresh the page, and confirm the personal best remains saved.

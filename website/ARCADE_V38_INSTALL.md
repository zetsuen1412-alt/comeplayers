# ComePlayers Arcade V38 — Full Games Menu

## What changed
- The Games dropdown now shows all 10 playable browser games.
- The dropdown uses a responsive two-column layout on desktop and one column on narrow screens.
- Added a View All shortcut to `/arcade`.
- All games remain playable directly in the browser without extra npm packages or SQL migrations.

## Install
1. Extract this ZIP into the `Comeplayers-new` project folder.
2. Allow Windows to replace the existing files.
3. Make sure backup folders are outside `website`.
4. Run:

```powershell
cd C:\Comeplayers-new\website
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
npm run build
npm run dev
```

## Games included
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

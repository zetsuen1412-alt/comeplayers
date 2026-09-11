# ComePlayers Strike Alpha 0.1

## Included routes

- `/games/comeplayers-strike` — public game landing page.
- `/play/comeplayers-strike` — fullscreen playable FPS alpha.
- `/games` — now includes a featured ComePlayers Strike banner when no marketplace filter is active.

## Installation

1. Extract the patch into the main `Comeplayers-new` project folder and allow matching files to be replaced.
2. Open a terminal in `Comeplayers-new/website`.
3. Install the updated dependencies:

   ```bash
   npm install
   ```

4. Run locally:

   ```bash
   npm run dev
   ```

5. Open:

   ```text
   http://localhost:3000/games/comeplayers-strike
   ```

No Supabase migration or new environment variable is required.

## Current gameplay

- Procedural Three.js/WebGL arena.
- Team Deathmatch against six enemy bots.
- Three-minute match timer.
- First-person movement and mouse look.
- Assault rifle with automatic fire, recoil, ammo, and reload.
- Right-click aim-down-sight.
- Body damage and headshots.
- Health, armor, elimination, and respawn.
- Bot patrol, pursuit, line-of-sight shooting, and respawn.
- Tactical minimap, objective marker, scoreboard, player stats, and match result screen.
- Low, Medium, and High graphics settings.
- Fullscreen support.
- Desktop/mobile capability notice.

## Controls

- `W A S D` — move
- Mouse — aim
- Left click — fire
- Right click — aim-down-sight
- `Shift` — sprint
- `Ctrl` — crouch
- `Space` — jump
- `R` — reload
- `F` — fullscreen
- `Esc` — pause / release mouse

## Open-source license

The game uses `three` under the MIT License. The complete notice is included in `THIRD_PARTY_NOTICES_STRIKE.md`.

All game-specific procedural geometry, HUD code, ComePlayers branding, and generated promotional images in this patch are project assets. No proprietary assets from Counter-Strike, Valorant, Call of Duty, or another commercial shooter are included.

## Recommended next development phase

1. Improve character and weapon models with optimized GLB assets.
2. Add footsteps, weapon sound effects, hit effects, and animation.
3. Add a second map and Search & Destroy mode.
4. Move damage and movement validation to a multiplayer server.
5. Connect ComePlayers login, party, matchmaking, rankings, and profiles.

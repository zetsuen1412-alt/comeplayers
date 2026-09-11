# ComePlayers Strike Prototype 0.2

## Updated routes

- `/games/comeplayers-strike` — redesigned public landing page.
- `/play/comeplayers-strike` — fullscreen Strike command center and playable WebGL FPS.
- `/games` — updated featured Strike banner.

## Installation

1. Extract the patch into the main `Comeplayers-new` folder and replace matching files.
2. Open a terminal in `Comeplayers-new/website`.
3. Install dependencies when required:

   ```bash
   npm install
   ```

4. Start development mode:

   ```bash
   npm run dev
   ```

5. Open:

   ```text
   http://localhost:3000/play/comeplayers-strike
   ```

No new environment variable or Supabase migration is required.

## New command-center interface

- Redesigned FPS home screen with Alexia, rank, missions, party, friends, and featured modes.
- Interactive mode-selection screen with rules, rewards, queue controls, and map rotation.
- Interactive loadout and operator screen with operator roster, weapon categories, attachments, equipment, perks, and operator stats.
- Interactive room lobby with mode tabs, attackers/defenders, squad chat, spectators, map voting, ready state, and match settings.
- Updated pause, gameplay HUD, objective progress, and match-result screens.

## Playable prototype modes

### Team Deathmatch

- Six enemy bots.
- Respawn enabled.
- Three-minute timer.
- First side to 20 points wins, or highest score when time expires.

### Bomb Defusal

- Five defending bots.
- Reach Point A and hold `E` for approximately 3.2 seconds to plant.
- Defend the charge for 35 seconds.
- Defenders rush the objective and can complete a defuse.
- One life for the player during the prototype round.

### Free For All

- Seven hostile rivals.
- Respawn enabled.
- First to 15 eliminations wins.
- A simulated rival score advances during the match.

### Zombie Mode

- Five survival waves.
- Infected use melee attacks and become faster and tougher in later waves.
- Health, armor, and ammunition are partially restored between waves.
- No player respawn.

## Controls

- `W A S D` — move
- Mouse — aim
- Left click — fire
- Right click — aim-down-sight
- `Shift` — sprint
- `Ctrl` — crouch
- `Space` — jump
- `R` — reload
- `E` — objective interaction / plant bomb
- `F` — fullscreen
- `Esc` — pause / release mouse

## Verification performed

- TypeScript: `npx tsc --noEmit` — passed.
- ESLint on all Strike files and routes — passed without warnings.
- Development route checks returned HTTP 200 for `/games`, `/games/comeplayers-strike`, and `/play/comeplayers-strike`.
- Next.js production compilation completed successfully; the full project-wide build process continued into its TypeScript stage beyond the environment execution limit.

## Current limitation

All four modes are currently local browser prototypes against bots. Real online multiplayer, authoritative servers, persistent inventory, account rank, party matchmaking, battle pass, and store transactions are not connected yet.

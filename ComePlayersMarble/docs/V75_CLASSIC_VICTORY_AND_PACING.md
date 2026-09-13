# V75 Classic Victory and Match Pacing

## Objective

V75 implements the classic board-structure victory loop that was still missing after the V74 presentation convergence pass. The feature is original ComePlayers code and presentation, while following the reference behavior: players can win through economic elimination, three complete color groups, a complete board line, or all tourism destinations.

## Victory architecture

`ClassicVictoryService` owns the board-structure evaluation and exposes both final results and live progress.

- **Triple Monopoly:** three fully controlled color groups.
- **Line Monopoly:** all ownable city tiles on one board side.
- **Tourism Monopoly:** all four tourism destinations.
- **Solo:** only the current player's ownership counts.
- **Team:** combined ownership from players sharing the same team ID counts.

Structural evaluation runs after any action that can change ownership and after turn resolution. A structural result finishes a local match immediately and is passed to the result service as an explicit winner override.

Online authoritative play remains protected. Once an authoritative snapshot is applied, local structural evaluation is disabled and the server controls the match phase and winner.

## Tourism layout

The board now contains four spaced tourism destinations:

1. Alexia Park
2. Neon Falls
3. Sky Temple
4. Marble Observatory

Tourism tiles use unique tile typing, tourist visual treatment, purchase values, and live collection progress. They do not count as ordinary color-group cities.

## HUD threat readability

Every player panel displays a compact structure-threat line:

`TRIPLE x/3 • LINE x/y • TOUR x/4`

This gives players enough information to defend against instant victories without opening another menu. Property dialogs also explain whether a tile advances a color group or the tourism set.

## Result and replay flow

Structural victory uses this sequence:

1. Resolve the ownership-changing action.
2. Detect the winning structure.
3. Present a dedicated victory banner.
4. Hold the banner long enough to read.
5. Record rewards, career result, and replay event.
6. Unlock and render the complete result screen.

The structural winner is ranked first even when another player temporarily has higher net worth.

## Central presentation timings

`ClassicPresentationTiming` centralizes pacing constants for:

- dice total reveal;
- tile focus;
- event resolution;
- Fortune reveal;
- Game Center result;
- special-tile results;
- victory banner;
- return to board overview.

Centralizing these values prevents individual event handlers from drifting into inconsistent speeds.

## Compatibility

- Save schema unchanged.
- V74 career history remains valid.
- Ranked, multiplayer, replay, progression, premium 3D dice, and authoritative economy remain intact.
- No proprietary Modoo Marble art, logo, character, sound, card, or source code is included.

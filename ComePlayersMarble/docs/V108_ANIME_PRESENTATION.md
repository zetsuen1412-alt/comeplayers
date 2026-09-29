# Crazy Rich: World Tour — V108 anime presentation foundation

Scope: the Cocos Creator 3.8.8 project in `ComePlayersMarble`, based on main commit
`80e7dd78d13cd93ef6c54f0bdf6a6ab3e2b50aa1` (V107). This is not a Unity-client migration.

## Implemented

- One shared sky/mint/coral/gold/lavender palette and reusable light UI panels.
- Three-band, baked vertex-color cel lighting through Cocos's existing `builtin-unlit` shader.
  This is deliberately NOT advertised as a dynamic `builtin-toon` shader or an outline post-effect.
- Rounded property tiles, a bright dice arena, and low-budget trees/clouds outside the property track.
- Procedurally constructed chibi player and bot pieces, with silver hair for Alexia,
  large eyes, highlights, headphones, and player-color clothing.
- Four distinct property levels (house, building, hotel, landmark), with owner-color roofs.
- Small construction puffs instead of tall light beams.
- Light lobby/room/collection/settings/result panels and stateful buttons that reuse their Graphics component.
- Contrast-adjusted UI labels. Round coral ROLL, visible only when the existing turn guard permits rolling.
- Match title changed to Crazy Rich: World Tour, with the public video-reference subtitle removed.

The active V105-named factory entry points in BoardView now delegate to the V108 builders.
Legacy inactive factories are retained; this is not a rewrite of the game simulation.
The online 3D presenter also uses BoardView; its separate 2D overlay is not restyled in this pass.

## Preserved

Game rules, movement destinations, turn resolution, random dice results, camera controller,
save identifiers, room/network logic, property prices, purchases and inventory are not changed.
Scene clear color and skybox visibility are presentation changes, not camera-position changes.
`useAnimeCharacters: false` permits an explicitly supplied authored human prefab; the default
uses the same procedural chibi standard for human and bot pieces.

## Verification

Run `npm ci` and `npm run test:anime`. The tests cover rounded mesh indices/winding/bounds,
non-mutating vertex colors, selected text/background contrast pairs, reused UI components,
chibi parity, outside-track scenery, property construction and source integration.
Tests use small Cocos stand-ins: they do NOT prove GPU rendering, engine import, frame rate,
network play, or final visual quality. The source needs a Cocos 3.8.8 preview/build review before merging.

## Required visual acceptance before release

- Open Match.scene in Cocos 3.8.8; test lobby, room, practice, settings, collection, and results.
- Play a complete match: roll, movement, construction, rent, cards, travel, turn change and restart.
- Check all four player colors, each building level, busy states, and player/bot turns.
- Inspect 1920x1080 and a small landscape/mobile viewport for clipped text and obscured tiles.
- Check online 3D mode and the unchanged 2D overlay separately.
- Confirm scene cleanup on repeated lobby/match transitions and measure frame time on target devices.

## Not finished by this foundation pass

Authored/rigged character assets and facial animation; new card/portrait illustrations; new music
or voice acting; every map theme; a redesigned online 2D overlay; device performance acceptance;
Unity integration; a published playable binary. Existing dice-number semantics are preserved,
not converted to the separately discussed 0–6 dice system by this visual-only change.

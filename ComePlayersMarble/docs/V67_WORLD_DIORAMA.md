# V67 — World Diorama Presentation

## Goal

Raise the existing playable Cocos vertical slice from flat procedural primitives to a cohesive, original 3D tabletop diorama while preserving the V50–V66 game rules, saves, replay format, and server authority boundaries.

## Runtime presentation

`BoardView` now assigns one of four bounded material finishes to shared color profiles:

- `MATTE` for soft surfaces such as sand and dark bases.
- `GLOSS` for enamel tiles, characters, city shells, and the board surface.
- `METAL` for gold trim, trophies, roofs, and landmark structure.
- `GLOW` for cyan/gold accents that remain readable from the overview camera.

The board creates a raised midnight-blue pedestal, metallic frame, emissive inner rails, central globe, animated orbit, and four unique corner landmarks. Non-corner special spaces use small semantic props so the player can read the board before opening the HUD detail.

## Animation

All new motion uses bounded Cocos tweens and is stopped during `BoardView.destroy()`:

- board entrance lift and scale settle;
- center-orbit rotation;
- globe crown, portal, trophy, tourist, Olympic, and fortune pulses;
- existing player state, dice physics-style roll, camera sequence, and event VFX remain intact.

Reduced camera motion continues to suppress camera-intensive presentation. Ambient diorama motion does not change match timing or authority.

## Lighting and dice

The Match scene enables 2048 shadow maps with two CSM levels. Procedural PBR meshes cast and receive shadows, while emissive readability accents stay unlit. Dice now use standard PBR body/pip materials plus eight shared gold corner accents per die.

## Lobby art

`assets/resources/environment/ComePlayersLobbyWorldV67.png` is a project-bound, original 1672×941 raster generated with the built-in image-generation workflow. The lobby loads it asynchronously and keeps a procedural fallback plus a dark readability overlay.

Generation mode: built-in image generation, `stylized-concept` use case, project-bound 16:9 lobby background.

Final prompt:

```text
Use case: stylized-concept
Asset type: 16:9 Cocos game lobby background, project-bound
Primary request: Create an original premium 3D diorama background for a colorful world-tour board game lobby.
Scene/backdrop: A floating square board-game island viewed from a high three-quarter isometric camera, surrounded by a deep midnight-blue atmosphere. The board perimeter contains colorful property tiles, tiny futuristic city skylines, a tropical island corner, a glowing travel portal, a trophy plaza, two glossy dice, and a small gold airship above the board.
Style/medium: polished stylized 3D game render, tactile toy-like materials, family-friendly, high-end mobile/PC game key art, fully original
Composition/framing: landscape 16:9; keep the far left 30% relatively calm and darker for an overlaid character panel; main board sits center-right; generous safe margins; no cropped important objects
Lighting/mood: cinematic cyan rim lighting, warm golden highlights, soft volumetric glow, joyful competitive adventure
Color palette: midnight navy, electric cyan, warm gold, coral accents, small emerald highlights
Materials/textures: glossy enamel tiles, brushed gold, soft plastic miniature buildings, subtle glass glow
Constraints: no people, no characters, no logos, no words, no letters, no numbers, no watermark; clearly a unique original world-tour board game and not a copy of any existing commercial board layout
Avoid: photorealism, flat 2D illustration, clutter, legible text, casino imagery, direct imitation of Monopoly or Modoo Marble
```

## Compatibility

- Save schema: unchanged.
- Local match rules and economy: unchanged.
- Replays: unchanged.
- Supabase migrations: no V67 migration required.
- Supabase SDK: exposed at runtime through `globalThis.supabase` or `globalThis.COMEPLAYERS_SUPABASE_SDK`, so Creator does not eagerly execute the full SDK while registering the local scene.
- Existing optional Alexia prefab and authored animation clips: unchanged.

## Verification result

The strict TypeScript check, JSON/metadata validation, relative-import audit, Cocos packer registration, and zero-error Cocos resolution map pass. An offline command-line Web Desktop build was produced at `build/web-desktop-v67` by responding to Creator's Dashboard identity IPC with an empty local profile.

The final browser run completed lobby → Quick Match → Ready & Start → 3D board → dice roll → animated movement → property purchase → bot turn. The console remained free of errors and warnings. See `VERIFICATION_V67.txt` for the exact counts and observed gameplay values.

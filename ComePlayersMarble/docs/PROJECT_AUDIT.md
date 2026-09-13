# ComePlayers Marble - Project Audit

Audit date: 17 July 2026. Baseline checkpoint: `480a6f3`.

## Baseline

- Cocos Creator project UUID: `9cba75ad-9017-4466-8193-5e5c7a964608`.
- Declared Creator version: 3.8.8 (`package.json`).
- TypeScript extends Cocos generated `temp/tsconfig.cocos.json`. Strict mode was disabled at baseline.
- One scene existed: `assets/scenes/Main.scene.scene`, containing one perspective camera and one directional light. It is now safely renamed to `assets/scenes/Match.scene`.
- One empty script existed: `assets/scripts/core/Main.scene.ts`, class `NewComponent`. Its UUID is preserved while the implementation is now `GameBootstrap.ts`.
- No prefabs, gameplay data, board generator, bootstrap, turn system, UI implementation, or networking implementation existed.
- Existing folders were metadata-only placeholders. No working implementation was overwritten.

## Checks

| Check | Baseline result | Milestone result |
|---|---|---|
| Creator version | 3.8.8 | unchanged |
| BoardGenerator | absent | runtime `BoardView` added |
| GameBootstrap | absent | typed composition root implemented and attached |
| Scenes | one baseline scene | renamed to `Match.scene`, UUID preserved, bootstrap reference validated by Builder |
| Prefabs | none | none required; nodes are runtime-generated |
| Strict TypeScript | disabled | enabled |
| Git | repository without commits | baseline checkpoint created |

## Risks and constraints

- The TypeScript compiler bundled with Cocos Creator 3.8.8 was available and `tsc --noEmit` passes with zero errors.
- Cocos Creator 3.8.8 command-line Web Desktop build completes successfully. The first build exposed an invalid raw component class ID; the scene now uses the exact compressed class ID emitted by Cocos (`82ddeLBsFNN3rs5aAPHqo54`) and the clean rebuild has no missing-class warning.
- The scene was not rebuilt manually. One component reference attaches the preserved script UUID (`GameBootstrap`) to Main Camera; all gameplay nodes are generated at runtime.
- Automated in-app browser inspection could not be completed because the browser surface blocked the local URL after an initial connection failure. Visual Preview remains a manual Editor check; this does not affect the successful Cocos build result.
- Visuals and audio are placeholders. No copyrighted reference asset is imported into `assets/`.
- Multiplayer and Supabase are intentionally out of scope. Gameplay depends only on `NetworkService`; local authority is injected.

## Milestone 1 scope delivered

Runtime-generated 32-tile board, isometric camera, four capsule players, two animated authoritative dice, roll flow, cancellable step movement, START salary, property purchase/skip, ownership markers, base rent, four player panels, turn timer, extra turns on double, three simple bots, round-based winner, restart, and structured console logging.

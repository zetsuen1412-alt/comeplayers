# ComePlayers Marble - Architecture

## Composition

`GameBootstrap` in `GameBootstrap.ts` is the composition root and keeps the UUID of the baseline script. It creates a fresh vertical slice on start/restart:

1. `createBoardData()` creates immutable tile configuration.
2. `MatchModel` owns deterministic game state and economic rules.
3. `LocalMatchNetworkService` provides dice authority behind `NetworkService`.
4. `BoardView` creates disposable 3D visuals; `PlayerMovement` owns cancellable tile movement.
5. `DiceController` animates two 3D dice to values supplied by the authority and always applies the catalogued settle orientation after animation or timeout.
6. `BoardCameraController` owns camera states and eased/reduced-motion transitions.
7. `MatchHUD` creates safe-area runtime controls and reflects model state.
8. `TurnTimer` and `BotDecisionService` stay independent from UI and player control.
9. Property services own purchase, building levels, landmark state, protection, takeover, and rent calculation; `SpecialTileResolver` applies bounded non-city rules.
10. `FortuneDeck` supplies a seeded draw-without-replacement cycle; `CardEffectResolver` applies all card rules without UI branching.
11. `WorldTravelService` validates destinations and applies paid/free-ticket travel atomically; the model exposes only a pending decision and destination summaries to UI/bots.
12. `OlympicService` owns bounded rent-multiplier upgrades; property selection, bot scoring, HUD projection, and board markers consume the same decision data.
13. `GameCenterService` hosts an injectable `GameCenterMiniGame`; the default `SignalMatchGame` owns option validation, authoritative target selection, and atomic rewards outside the HUD.
14. `TakeoverService` quotes invested property value, enforces Landmark/shield rules, and atomically transfers money, ownership state, and player property lists.
15. `MatchResultService` creates a deterministic final ranking from cash and invested property value, while `MatchHUD` presents the reason, statistics, and replay action without coupling result rules to UI nodes.
16. `TutorialService` owns the five-step onboarding state machine behind a small completion-store interface; `LocalSaveService` persists normalized `PlayerSettingsData`, and the HUD only renders snapshots/actions.
17. `SettingsService` owns pause-modal state and bounded Music/SFX/camera preferences; it shares one `LocalSaveService` cache with tutorial progress so independent settings writes cannot regress onboarding completion.
18. `AudioManager` owns category gain, cue cooldowns, and payload validation; `CocosAudioBackend` provides eight disposable Cocos channels, name-based clip registration, and original procedural Web tones when authored clips are not assigned yet.
19. `VfxManager` owns a validated ten-cue visual catalog and one bounded `ObjectPool` per cue; shared low-poly meshes/materials and tween-completion release keep dice, movement, landing, property, card, travel, Olympic, and celebration effects allocation-light.
20. `LocalSaveService` owns a versioned atomic `LocalSaveData` v2 bundle behind an injectable key-value storage contract. Player settings, optional `MatchSettingsData`, and `CharacterProgressionData` are normalized independently; structurally invalid current data falls back to valid legacy data, v1 imports preserve an existing card collection, and progression actions report persistence failure instead of silently spending currency.
21. `AlexiaAnimationController` maps twelve typed gameplay states to name-resolved skeletal clips and a lightweight procedural fallback. `BoardView` keeps movement on `PlayerRig` and animation on `VisualRoot`, while optional Alexia Prefab, clip, and scale fields in `GameBootstrap` provide an Inspector-only asset replacement path.
22. `BoardCameraController` composes `CameraSequenceController` and `CameraShakeController` on separate runtime transforms. The presentation rig owns overview/follow/focus sequences, the camera child owns bounded impact offsets, and live reduced-motion settings finalize the current pose while suppressing shake without affecting gameplay timing.
23. `DiceVisualFactory` builds the two dice from one shared body mesh, one shared pip mesh, and two shared unlit materials. `DicePresentationTypes` is the asset-free source of truth for six face layouts, opposite pairs, authority settle rotations, and three original palette presets exposed through `GameBootstrap`.
24. `FrontEndShell` owns the pre-match safe-area Canvas and original Lobby, Local Room, Shop, Character, Dice, Inventory, Missions, and Settings routes. `FrontEndCatalog` keeps page copy and bounded room-state transformations data-only, while `PlayerCatalog` is the shared source of truth for Room and Match identities; `GameBootstrap` creates match systems only after Local Room saves validated settings, then can dispose the match and return to Lobby from Pause or Result.
25. `CharacterProgressionService` owns local CP, stable card instances, deterministic reward generation, equip, two-material combine, upgrade points, and collection limits. Combine is order-independent, rejects any result that would not be stronger than both materials, and rolls back the in-memory transaction when storage cannot persist it. `FrontEndShell` renders Shop, Character, and Inventory from one read-only snapshot and places every destructive action behind a fullscreen input-blocking confirmation/reveal layer.

Gameplay has no dependency on Supabase, UI nodes, or scene UUIDs. A future hosted service can implement `NetworkService` without changing `MatchModel`.

## Dependency rules

- Data modules do not depend on views.
- The model does not access Cocos nodes.
- Views receive state/actions and do not implement economy rules.
- Only the composition root coordinates asynchronous turn flow.
- Runtime roots are destroyed on restart/onDestroy, preventing listener and node leaks.

## Runtime hierarchy

```text
Scene
|- FrontEndShell (active before/after a local match)
|  |- Main Menu / Lobby
|  |- Local Room with 2-4 stable slots
|  |- Shop / Character / Inventory with live local card progression
|  `- Dice / Missions / Settings
|- Main Light
|- RuntimeCameraPresentationRig
|  `- Main Camera + GameBootstrap (composition root and local impact transform)
|- RuntimeBoard
|  |- Arena / Core / 32 tiles
|  |- owner and building markers
|  `- PlayerRig-* (4)
|     `- VisualRoot + AlexiaAnimationController
|- RuntimeDice
|  |- Dice-1
|  |  |- Body
|  |  `- Pips (21 shared-mesh renderers)
|  `- Dice-2
|     |- Body
|     `- Pips (21 shared-mesh renderers)
|- RuntimeAudio
|  `- Music / UI / Dice / Movement / Property / Card / Celebration / Ambience
|- RuntimeVFX
|  `- 15 prewarmed pooled primitives across 10 bounded cue pools
`- MatchHUD (Canvas)
   |- status, dice and player labels
   |- ROLL / PAUSE / GUIDE / RESTART
   |- first-run tutorial overlay with NEXT / SKIP
   |- pause/settings overlay with volume and motion controls
   |- purchase decision
   |- rent Payment Popup with optional takeover
   |- paged World Travel destination picker
   |- paged Olympic city picker
   |- Game Center option and result overlays
   |- Fortune Card reveal overlay
   `- final net-worth ranking and PLAY AGAIN overlay
```

`FrontEndShell` and the match runtime are mutually exclusive. Destroying one Canvas before creating the other prevents duplicate UI cameras, stale input, and hidden match simulation behind the menu.

## Growth path

Milestone 3 should continue by assigning the final Alexia model and authored clips to the completed animation foundation, then add authored music/ambience/SFX, presentation VFX assets, tuned camera curves, rigid-body dice tuning, emotes, and Android profiling. Assigning clips named after the animation/audio catalogs, selecting/replacing dice skins, tuning camera profiles, or replacing pooled primitive factories does not change gameplay. The current single-scene front-end shell can later split into Boot/Lobby/Room scenes when online loading and hosted services require independent lifecycles; its data-only room contract already feeds the versioned save bundle and remains suitable for a future server-backed `NetworkService`.

## V50 career boundary

`CareerProgressionService` consumes only a final `MatchResultSummary`, the local human player ID, and a small match-activity snapshot. It does not depend on Cocos nodes or `MatchModel` mutation. `GameBootstrap` records human property actions, World Travel uses, Game Center wins, and takeovers, then commits one career result at match completion. `LocalSaveService` stores the normalized career section beside existing player, room, and character progression data. `FrontEndShell` and `MatchHUD` consume read-only career/reward snapshots and do not calculate rewards.

## V60 online authority boundary

`RealtimeMultiplayerService` submits typed commands through `SupabaseAuthoritativeMatchAdapter`. PostgreSQL owns dice, movement, turn order, balances, properties, special-tile random outcomes, choice allow-lists, and final state. `AuthoritativeMatchProtocol` rejects malformed remote payloads and clamps bounded presentation fields. `AuthoritativeBoardOverlay` is a disposable read-only Cocos projection of the latest snapshot; it never calculates an outcome and only exposes commands permitted by `pendingAction`. `MatchModel.applyAuthoritativeSnapshot` and `PropertyController.synchronize` provide the bridge for future event-driven 3D reconstruction without making the local model authoritative online.

## V61 cinematic authority boundary

`AuthoritativeEventPresentationQueue` receives normalized append-only events from `RealtimeMultiplayerService`, rejects stale or duplicate sequences, and converts accepted events into bounded presentation cues. `AuthoritativeBoardOverlay` consumes those cues sequentially for dice reveals, marker travel, tile pulses, economic banners, special-tile announcements, World Events, and match results. A reconnect first applies the newest authoritative snapshot and then accepts only later event sequences, so presentation cannot mutate or replay old gameplay state.

Before a server match starts, `GameBootstrap` sends the selected character, equipped pendant, and selected booster through `configure_marble_authoritative_loadout`. PostgreSQL validates fixed allow-lists, applies starting credits and protections, owns one-use skill state, and emits the resulting loadout/skill/world-event records. The Cocos client displays those records and may submit only typed commands allowed for the authenticated member and current revision.

## V95 Journey Prestige boundary

`CareerJourneyService` remains a pure progression module. It receives a normalized journey snapshot, immutable match context, and timestamp, then returns one complete next-state object plus a reward summary. Base tiers, Prestige levels, mission claims, Perfect Cycle IDs, and streak state are persisted atomically by `CareerProgressionService`; UI and 3D presentation consume snapshots only. No Journey system changes dice, property, economy, victory, multiplayer, or authoritative state.

## V96 Journey Season Archive boundary

`CareerJourneyService.alignProgression` owns monthly rollover detection and archive creation. Archive records are normalized by `CareerProgressionData` and capped at twelve unique season IDs. `CareerProgressionService` persists rollover state atomically with the first match of the new season. `FrontEndShell` renders the local Journey command center, while `MatchHUD` and `BoardView` only present rollover results and do not alter progression state.


## V97 Rival Contract boundary

`CareerJourneyService` owns deterministic local Rival Board generation, Rival Rating changes, seasonal contract completion, and duplicate-safe rewards. `CareerProgressionData` persists normalized Rival state and season archive fields. `CareerProgressionService` combines Rival rewards with existing Career and Journey rewards in one atomic save. `FrontEndShell`, `MatchHUD`, `GameBootstrap`, and `BoardView` only consume immutable reward/snapshot data and do not calculate authoritative gameplay results.

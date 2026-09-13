# ComePlayers Marble - Milestones

## Milestone 0 - Audit

Status: complete.

- Repository, configuration, scene, scripts, and reference package inventoried.
- Baseline Git checkpoint created.
- Architecture and reference findings documented.
- Video automation unavailable because `ffmpeg` is not installed; manual review remains.

## Milestone 1 - Vertical slice

Status: complete. Exit gate passed in Cocos Creator 3.8.8.

- 32-tile runtime board and tile data.
- Four players, local player plus three safe-spending bots.
- Seedable two-die authority (2-12), bounded 3D dice animation, per-tile movement, camera follow/overview.
- START salary, city purchase, owner marking, base rent, bankruptcy flag.
- Safe-area runtime HUD, purchase modal, timer/auto-roll, double extra turn, restart, 12-round winner.
- Local/network boundary through an interface.

Verification completed:

- strict TypeScript: pass, zero source errors;
- scene JSON integrity: pass, bootstrap reference resolves;
- board data: exactly 32 records and 32 unique perimeter positions;
- headless gameplay tests: pass for 1,000 dice rolls, ordered movement, START salary, purchase, rent transfer, double extra turn, and bot reserve policy;
- Cocos Creator 3.8.8 Web Desktop build: pass, no missing class or build failure;
- Editor Browser Preview: pass at desktop and Asus ROG Phone 6 landscape preset;
- runtime interaction: pass for roll, movement, double extra turn, purchase modal, purchase balance/ownership, and bot continuation;
- final Editor Console after runtime checks: 0 warnings, 0 errors.

Exit gate completed on 2026-07-17. Git checkpoint: `60c9e3c`.

## Milestone 2 - Core board game

Status: complete. Exit gate passed in Cocos Creator 3.8.8 after twelve bounded slices.

Implemented across Milestone 2:

- explicit property ownership state and purchase service;
- building upgrades from Land through Villa, Building, Hotel, and Landmark;
- level-based rent calculator and landmark takeover guard foundation;
- immediate runtime owner/building markers;
- bot upgrade policy with a safe cash reserve;
- modular special-tile resolver with active Island, Tax, Bonus, and START landing behavior;
- Island turn status and double-to-exit rule.
- 20 original data-driven Fortune Cards with every requested metadata field;
- seeded draw-without-replacement `FortuneDeck` and centralized `CardEffectResolver`;
- active money, movement, Island/release, rent discount, takeover, property shield, free upgrade, economic attack, position swap, and free World Travel ticket effects;
- Fortune Card reveal overlay, rarity treatment, delayed effect application, CardFocus camera state, and persistent-effect counters in the HUD;
- takeover ownership/marker updates, Landmark immunity, and consumable property protection charges.
- World Travel pending-decision flow with 21 valid property destinations and board highlights;
- six-destination paged picker, camera follow, direct travel animation, and normal destination landing resolution;
- CP 150,000 paid travel plus atomic consumption of free World Travel tickets from Fortune Cards;
- bot destination scoring for affordable open property, own-property upgrades, and opponent rent exposure.
- Olympic city selection for owned properties with board highlights and camera focus;
- bounded `+0.5x` rent upgrades through `OlympicService`, capped at `3x` per property;
- projected-rent picker, bot highest-rent policy, persistent Olympic board marker, and immediate rent-calculator integration.
- modular Game Center contract with injectable mini-game implementations;
- active Signal Match game with three hidden-target options, authoritative seeded resolution, and CP 240,000 jackpot;
- responsive player picker, bot participation, result reveal overlay, invalid-choice protection, and zero-loss miss rule.
- rent Payment Popup for every opponent-city landing, including paid amount, owner, property value, and remaining balance;
- paid takeover quote at `2x` invested property value with atomic money/ownership transfer;
- Landmark, Property Shield, bankruptcy, and insufficient-funds guards plus value-aware bot takeover policy.
- deterministic final ranking through `MatchResultService`, based on cash plus invested property/building value;
- explicit round-limit and last-player-standing end reasons with bankrupt players ranked after solvent players;
- responsive match-result overlay with winner, four-player statistics, net-worth explanation, and PLAY AGAIN restart.
- five-step first-run tutorial covering victory, dice/movement, property economy, special tiles, and timer/guide behavior;
- modal NEXT, START MATCH, and SKIP flow that pauses turn timing and blocks roll input without mutating match state;
- GUIDE reopen action restricted to idle human turns, plus locally persisted and schema-normalized player settings.
- idle-turn PAUSE modal that freezes the turn timer and blocks roll input while keeping UI controls responsive;
- bounded 10% Music/SFX controls, automatic local persistence, and shared-cache protection for tutorial progress;
- live Reduce Camera Motion toggle with immediate camera-controller updates and persisted restart behavior.
- categorized `AudioManager` channels for Music, UI, Dice, Movement, Property, Card, Celebration, and Ambience;
- 13 validated, data-mapped cues covering session start, UI, dice, per-tile movement, property actions, cards, travel, Game Center, and match victory;
- live category-gain propagation from persisted Music/SFX settings, per-cue cooldowns, overlapping Cocos one-shots, and disposable loop channels;
- optional name-based `AudioClip` assignment plus original procedural Web tones as safe placeholders when authored audio is unavailable.
- typed 10-cue VFX catalog for dice roll/power, movement, landing, purchase, upgrade, card reveal, travel, Olympic upgrades, and celebration;
- bounded per-cue object pools with 15 prewarmed low-poly nodes, aggregate capacity 36, exhaustion accounting, and deterministic acquire/release cleanup;
- shared disc/pillar/spark meshes and unlit materials, short tween-driven effects, and no particle-system dependency for mid-range Android suitability;
- event-bus integration across human/bot gameplay plus restart/onDestroy disposal that removes listeners, stops active tweens, and destroys pooled resources.
- versioned atomic local-save bundle with revision/timestamp metadata, independent normalized player/match settings, and injectable storage for deterministic tests;
- `MatchSettingsData` for 2-4 players, 10-90 second turns, and timeout auto-roll, with saved values applied at restart and Inspector defaults preserved when no match setup exists;
- one-time migration from `comeplayers.player-settings.v1`, safe corrupt-data recovery, session fallback on blocked writes, plus guarded export/import/reset operations.

Milestone 2 exit gate passed on 2026-07-17. Final authored audio, presentation VFX, Alexia art/animation, emotes, board themes, and device profiling now belong to Milestone 3; active-match resume is intentionally not part of the local settings bundle.

Current-slice verification:

- strict TypeScript: pass;
- Cocos Browser Preview: purchase service and Island turn status exercised at the Asus ROG Phone 6 landscape preset;
- isolated Cocos Creator 3.8.8 Web Desktop build: pass in 7 seconds, all 27 scripts included, complete output bundle generated;
- Fortune smoke suite: pass for 20-card schema/uniqueness, seeded order, all 12 effect families, takeover protection, free upgrade consumption, and pending-card match flow.
- isolated browser runtime: pass for seeded `1 + 1` landing on Fortune, Epic reveal overlay, delayed effect application, persistent HUD charge, double extra turn continuation, and zero browser warnings/errors.
- World Travel smoke suite: pass for 21 valid destinations, paid/free travel, invalid-target rejection, ticket consumption, bot selection, and continuation into destination property landing.
- isolated Cocos Creator 3.8.8 World Travel build: pass in 8 seconds with all 28 scripts and a complete output bundle.
- isolated World Travel browser runtime: pass for 4-page destination picker, page navigation, valid-tile highlights, CP 150,000 deduction, camera/direct movement to Vesper, follow-up purchase decision, and zero browser warnings/errors.
- Olympic smoke suite: pass for valid owned-property filtering, `+0.5x` progression, `3x` cap, invalid-target rejection, bot selection, projected rent, and boosted rent transfer between players.
- isolated Cocos Creator 3.8.8 Olympic build: pass in 12 seconds with all 29 scripts and a complete output bundle.
- isolated Olympic browser runtime: pass for owned-city filtering, projected CP 19,000 -> CP 28,500 rent, `x1.5` confirmation, camera focus, persistent board marker, and zero browser warnings/errors.
- runtime build verification caught and fixed the Cocos iterator-transpile edge case by exposing property snapshots through `Array.from`.
- Game Center smoke suite: pass for option schema, win/miss rewards, invalid choices, invalid authority output, bot choice, and pending-decision match flow.
- isolated Cocos Creator 3.8.8 Game Center build: pass in 12 seconds with all 30 scripts and a complete output bundle.
- isolated Game Center browser runtime: pass for deterministic `1 + 4` landing, responsive three-option picker, post-choice target reveal, CP 240,000 jackpot payout, automatic bot continuation, and zero browser warnings/errors.
- paid takeover smoke suite: pass for base/upgraded valuation, rent popup state, accept/decline flow, atomic balances and ownership lists, Landmark/shield/insufficient-funds guards, and bot policy.
- isolated Cocos Creator 3.8.8 paid takeover build: pass in 14 seconds with all 31 scripts and a complete output bundle.
- isolated paid takeover browser runtime: pass for deterministic `1 + 2` opponent-city landing, CP 30,000 rent payment, CP 130,000 valuation, CP 260,000 takeover, atomic player balances/ownership/board marker, and zero browser warnings/errors.
- match-result smoke suite: pass for net-worth/property-value accounting, deterministic ties, bankrupt-player ordering, both end reasons, completed-round clamping, and `MatchModel` winner integration.
- isolated Cocos Creator 3.8.8 match-result build: pass in 50 seconds with a complete 43-file Web Desktop bundle.
- isolated match-result browser runtime: pass for round-limit reason, four-player ranking/statistics, hidden gameplay controls while finished, PLAY AGAIN clean restart, and zero browser warnings/errors.
- tutorial/settings smoke suite: pass for five unique steps, ordered NEXT completion, single persistence write, returning-player suppression, manual reopen/SKIP, and settings sanitization/clamping.
- isolated Cocos Creator 3.8.8 tutorial build: pass in 58 seconds with a complete 43-file Web Desktop bundle.
- isolated tutorial browser runtime: pass for first-run layout, five-step navigation, blocked ROLL, paused/resumed timer, persisted completion after reload, idle-only GUIDE reopen, SKIP, and zero browser warnings/errors.
- pause/settings smoke suite: pass for inactive-mutation guards, 0-100% volume clamping, reduced-motion persistence, returning-session values, and preservation of tutorial completion.
- isolated Cocos Creator 3.8.8 pause/settings build: pass in 60 seconds with a complete 43-file Web Desktop bundle.
- isolated pause/settings browser runtime: pass for paused/resumed countdown, Music/SFX persistence and clamping, live/persisted reduced motion, pending-decision lockout, and zero browser warnings/errors.
- audio smoke suite: pass for eight unique categories, 13 cue definitions, invalid-payload rejection, movement cooldowns, live Music/SFX gain routing, background cleanup, and clip-name normalization.
- isolated Cocos Creator 3.8.8 audio build: pass in 11 seconds with a complete 43-file Web Desktop bundle and the audio modules present in the compiled main bundle.
- isolated audio browser runtime: pass for procedural-placeholder initialization, tutorial/UI cues, dice plus seven movement steps, property purchase, Music 80% -> 100%, SFX 90% -> 70%, persisted reload values, and zero browser warnings/errors.
- VFX smoke suite: pass for 10 unique cue definitions, 15-node prewarm, capacity 36, bounded exhaustion, instance reuse, release-all cleanup, and invalid-payload rejection.
- isolated Cocos Creator 3.8.8 VFX build: pass in 13 seconds with a complete 43-file Web Desktop bundle and the pooling/VFX modules present in the compiled main bundle.
- isolated VFX browser runtime: pass for 10-cue/15-node initialization, dice roll and property-purchase flow, clean restart reinitialization, and zero browser warnings/errors.
- expanded-save smoke suite: pass for schema bounds, revision/timestamp updates, player/match isolation, legacy migration, corrupt JSON recovery, guarded import/export/reset, and read/write failure fallbacks.
- isolated Cocos Creator 3.8.8 expanded-save build: pass in 11 seconds with all 44 scripts, a complete Web Desktop bundle, and zero error-like build-log lines.
- isolated expanded-save browser runtime: pass for one-time legacy migration, revision 1 -> 2 settings write, persisted Music 90% after reload, Inspector match-default fallback, and zero browser warnings/errors.

## Milestone 3 - Presentation

Status: in progress, five bounded slices.

Implemented in the current slices:

- typed animation catalog for Idle, Ready, RollDice, Run, Walk, Jump, Land, Celebrate, Sad, Hit, Teleport, and IslandIdle;
- `AlexiaAnimationController` with clip-name resolution, bounded cross-fades, looping/one-shot configuration, cleanup, and twelve lightweight procedural placeholder motions;
- separated `PlayerRig` movement root and `VisualRoot` animation target so movement and presentation tweens cannot cancel each other;
- optional Alexia Prefab, AnimationClip list, and scale fields exposed on `GameBootstrap` for final model replacement through Inspector;
- gameplay state wiring for turn readiness, dice anticipation, walk/run, landing, Bonus jump, Tax/rent hit, World Travel teleport, Island idle, property/Game Center celebration, and final winner/loser poses;
- procedural bot presentation uses the same state contract while authored Alexia clips can replace only the local-player visual without changing gameplay;
- typed camera catalog for the seven required states plus seven bounded impact cues for dice, landing, property, card, travel, hit, and celebration moments;
- `CameraSequenceController` with cancellable single/two-stage pose transitions, final-pose reduced-motion behavior, and deterministic tween cleanup;
- `CameraShakeController` with short decaying positional/rotational impact patterns and no particle, physics, or per-frame allocation dependency;
- separate `RuntimeCameraPresentationRig` and local camera impact transform so follow/focus transitions cannot cancel shake offsets;
- property settle, card reveal, World Travel, payment hit/takeover, Game Center win, and match-result camera cues wired through `GameBootstrap` without changing model rules;
- restart/onDestroy restores an existing scene camera to its original parent before the runtime presentation rig is destroyed.
- data-only definitions for all six standard pip layouts, opposite faces summing to seven, and the existing authority-to-top-face rotations;
- two readable procedural dice with 21 inset spherical pips each, created once from one shared body mesh, one shared pip mesh, and two shared unlit materials;
- three original palette presets - ComePlayers Gold, Neon Circuit, and Marble Pearl - with an Inspector dropdown and runtime skin replacement that never changes authority results;
- landing tween now settles directly toward the authoritative face, while timeout still cancels motion and applies the same final orientation;
- explicit, idempotent cleanup for both runtime dice nodes, active tweens, shared meshes, and shared materials.
- original mobile-first Main Menu/Lobby with guest profile, currency, equipped-character presentation, primary Local Play action, online-coming-soon state, mission summary, and persistent meta navigation;
- Local Room with map/mode summary, 2-4 stable player slots, host/ready/bot states, bounded player count and turn duration, auto-roll toggle, saved match setup, and dominant Start action;
- navigable Shop, Character Card, Dice, Inventory, and Missions presentation previews plus functional persisted Settings, preserving the reference information hierarchy without reusing its names, art, audio, icons, or pixel layout;
- mutually exclusive front-end/match runtime Canvases, Lobby return actions from Pause and Result, and clean Local Room -> Match -> Lobby lifecycle disposal.
- original local character catalog with stable card instances, rarity, stars, power, passive text, equipped-card state, CP balance, upgrade points, and a 48-card collection limit;
- deterministic CP 25,000 character packs, fixed-threshold upgrade-point redemption, and a persisted Shop confirmation/reveal flow with no real-money integration;
- two-material combine with detailed material identity, order-independent output, strictly stronger-power validation, automatic equipped-card replacement when consumed, and one upgrade point per successful result;
- live Lobby, Shop, Character, and Inventory summaries backed by `LocalSaveData` v2, guarded legacy migration/import, storage-failure rollback, fullscreen modal input locking, and state-aware action colors;
- complete English player-facing text pass across the front end, tutorial, Fortune Cards, board events, property/payment flow, World Travel, Olympic, Game Center, pause/settings, and match results;
- read-only filename inventory of `NetmarbleModuMarble.zip` plus `modo1`-`modo3` flow analysis; no proprietary executable, DLL, sprite, bitmap, audio, data table, brand, or layout was imported.

Current-slice verification:

- strict TypeScript: pass, including Cocos Creator 3.8.8 declarations for Prefab, AnimationClip, SkeletalAnimation, and tween APIs;
- animation catalog smoke suite: pass for 12 unique states, 12 unique motion profiles, seven loop states, 12 clip aliases, and IslandIdle matching precedence;
- controller runtime-contract suite: pass for procedural/authored routing, 24 state switches, wrap modes, cross-fade clamping/fallback, visual replacement cleanup, and ignored unrelated clips;
- camera presentation runtime-contract suite: pass for seven unique states, seven bounded impact definitions, focus/property sequences, reduced-motion suppression, impact playback, and existing-camera parent restoration;
- strict TypeScript: pass after camera integration against the Cocos Creator 3.8.8 camera, node hierarchy, quaternion, and tween declarations;
- Cocos Creator 3.8.8 Web Desktop build: pass in 1 minute 59 seconds, with the camera presentation modules bundled into `build/web-desktop-001/assets/main/index.js` and the final build task marked successful;
- Cocos Browser runtime: pass at the Asus ROG Phone 6 landscape preset for clean startup, `BoardOverview`, visible `DiceFocus`, roll/landing continuation, and the live Reduce Camera Motion toggle, with zero browser warnings/errors.
- strict TypeScript: pass after the dice presentation integration against Cocos Creator 3.8.8 `Enum`, shared material, low-poly sphere, mesh, quaternion, and tween declarations;
- dice catalog smoke suite: pass for six unique faces, 21 correctly counted/unique pip positions, three opposite pairs, preserved settle rotations, three distinct skins, and safe invalid-value fallbacks;
- dice runtime-contract suite: pass for two dice, 42 pip nodes, exactly two shared meshes/two shared materials, authoritative 2/5 final faces, skin fallback, tween cancellation, and idempotent GPU-resource cleanup;
- Cocos Creator 3.8.8 Web Desktop rebuild: pass in 17 seconds, with `DicePresentationTypes`, `DiceVisualFactory`, the Inspector enum, and the presentation initialization log present in `build/web-desktop-001/assets/main/index.js`;
- Cocos Browser runtime: pass at the Asus ROG Phone 6 landscape preset for visible gold dice/pips during `DiceFocus`, multiple completed authority results and landings, `2 dice / 42 pips / ComePlayers Gold` initialization, restart cleanup, and zero browser warnings/errors.
- front-end catalog smoke suite: pass for six unique meta destinations, three content cards per route, bounded 2-4 player and 10-90 second room settings, auto-roll toggle, and four stable host/bot slots;
- strict TypeScript: pass after front-end integration against Cocos Creator 3.8.8 Canvas, SafeArea, Graphics, input blocking, label alignment, SettingsService, and LocalSaveService declarations;
- Cocos Browser runtime: pass at the Asus ROG Phone 6 landscape preset for Lobby, three-player Local Room, Settings, Character Cards, Room -> Match settings application, Pause -> Lobby return, and zero browser warnings/errors;
- Cocos Creator 3.8.8 Web Desktop rebuild: pass in 15 seconds with `PlayerCatalog`, `FrontEndCatalog`, and `FrontEndShell` bundled into `build/web-desktop-001/assets/main/index.js`, no missing-class diagnostics, and the final build task marked successful.
- character-progression smoke suite: pass for purchase, insufficient funds, equip, combine, stronger-power invariant, input-order invariance, reward redemption, unique IDs, normalization, and storage-failure rollback;
- expanded-save v2 smoke suite: pass for player/match/progression isolation, legacy v1 preservation, invalid current/legacy fallback, invalid/future import rejection, migration revision continuity, corrupt JSON recovery, and failed-write session behavior;
- eleven relevant smoke suites pass after the English conversion: Fortune, tutorial, settings, result, Game Center, Olympic, World Travel, takeover, front-end catalog, save v2, and character progression;
- Cocos Browser runtime: pass for English Lobby/Shop/Character/Inventory, fullscreen modal navigation lock, Nova + Lux combine into Lux SR/2-star power 83, collection `4 -> 3`, upgrade points `0 -> 1`, persistence after reload, and zero browser warnings/errors;
- Cocos Creator 3.8.8 Web Desktop rebuild: pass in 29 seconds with all 52 script modules, character progression, English UI strings, and the final build task marked successful.

## Creator test checklist

1. Open the repository in Cocos Creator 3.8.8 and wait for asset import.
2. Open `assets/scenes/Match.scene`.
3. Confirm Main Camera has `GameBootstrap`. Current scene uses 4 players, Bot Think Delay 0.8, Step Duration 0.18, and defaults to the ComePlayers Gold dice skin.
4. Optionally assign an Alexia Prefab and clips named `Alexia_Idle`, `Alexia_Ready`, `Alexia_RollDice`, `Alexia_Run`, `Alexia_Walk`, `Alexia_Jump`, `Alexia_Land`, `Alexia_Celebrate`, `Alexia_Sad`, `Alexia_Hit`, `Alexia_Teleport`, and `Alexia_IslandIdle`; leave them empty to verify procedural fallbacks.
5. Preview in Browser at 1920 x 1080, then at an Android-like 16:9 resolution.
6. On a fresh browser profile, verify QUICK GUIDE opens; navigate all five steps or SKIP, then reopen it with GUIDE during an idle human turn.
7. Open PAUSE during an idle human turn; verify the timer freezes, Music/SFX immediately change their audio categories and persist, then toggle Reduce Camera Motion and RESUME.
8. Reload after changing a setting; verify QUICK GUIDE completion and volume/motion values persist without a migration warning repeating. With reduced motion enabled, camera poses should snap to their final position and all impact shake should remain suppressed.
9. Press ROLL repeatedly; verify each total is 2-12, the upward pip count on both dice matches the HUD values, movement advances exactly that many adjacent tiles, the visual changes Ready -> RollDice -> Walk/Run -> Land, camera changes DiceFocus -> PlayerFollow -> TileFocus, and dice/step audio plus pooled VFX remain synchronized.
10. Land on an empty city; test BUY and SKIP. Verify balance, tile color, the short purchase pillar effect, PropertyFocus settle/impact, and Celebrate pose after BUY.
11. Land on an opponent city; verify the Payment Popup, rent transfer, CONTINUE, TAKEOVER ownership/balance updates, PropertyFocus, and Hit/Celebrate response.
12. Confirm three bot turns run automatically and control returns to YOU.
13. Cross START and verify CP 200,000 salary.
14. Land on Game Center, select a signal, and verify the target reveal, jackpot/no-loss result, and a short celebration impact only on a win.
15. Press RESTART during and after a turn; verify one clean board/HUD remains.
16. Continue through round 12 or bankruptcy; verify ResultFocus settles once, the reason/ranked statistics appear, the winner uses Celebrate, and losers use Sad poses.
17. Press PLAY AGAIN and verify one clean board/HUD starts at round 1.
18. Inspect Console: expected messages begin with `[ComePlayers]`; no repeating errors should occur.

## Known limitations

- Alexia still uses a capsule because no final mesh/clips are assigned; the animation controller and Inspector replacement path are ready.
- Camera poses, settles, and impacts use original runtime profiles; authored cinematic curves and device-specific tuning are still pending.
- Dice now have authority-synchronized procedural pips and three original palette skins; rounded authored production meshes, inventory persistence, rigid-body simulation, sleep detection, and device tuning remain pending.
- Profile rank, match history, mission progress, dice selection, and cosmetic inventory remain local previews. Character currency, collection, equipped card, packs, combine results, upgrade points, Room setup, and audio/motion Settings now persist locally.
- Lobby and Room currently use one mutually exclusive runtime shell in `Match.scene`; dedicated Boot/Lobby/Room scenes remain a later lifecycle split for online loading and hosted services.
- Fortune, World Travel, Olympic, Game Center, Island, Tax, Bonus, and START behaviors are active.
- Active-match resume, liquidation, final authored presentation assets, and online play remain deferred.


## Milestone 3 - V49 classic presentation merge

Status: implemented in source; requires final Cocos Creator 3.8.8 visual preview/build on the target Windows machine.

- Supplied video, PDF, and image references merged into a clearly isolated `references/` library.
- Classic channel/room browser and four-slot waiting-room hierarchy recreated with original ComePlayers visuals.
- Board frame, tile groups, buildings, landmarks, special monuments, player pieces, and match HUD presentation upgraded.
- Alexia lobby art added through the Cocos `resources` pipeline with a procedural fallback.
- Character progression expanded with a saved one-point star-upgrade action.
- TypeScript syntax transpilation and pure logic smoke checks are required before packaging; Editor Preview remains the authoritative visual verification.

## Milestone 3 - V50 career and match presentation

Status: implemented in source; final Cocos Creator 3.8.8 visual preview/build remains required on the target Windows machine.

- Added a full-screen match countdown before turn timing begins.
- Added player-colored turn and double-extra-turn banners.
- Added additive career data to the existing version-2 local save bundle without invalidating V49 saves.
- Added saved level, experience, rank title, match count, wins, podiums, win streaks, activity totals, and eight-entry match history.
- Added deterministic local match reward calculation and one-time career mission rewards.
- Added safe CP grant through the existing character progression store after career persistence succeeds.
- Replaced Lobby/Missions preview values with live saved career data.
- Expanded result presentation with CP, XP, level-up, and mission completion details.


## V51 - Cinematic Polish

- Authoritative dice presentation with multi-stage bounce.
- Direction-aware hopping player movement.
- Animated city ownership and skyline construction.
- Bounded burst VFX, semantic audio, and animated HUD result cards.

## V52 — Loadout, Pendants, Boosters, and Active Skills

- Permanent pendant ownership and one equipped pendant.
- Consumable booster inventory with one selected pre-match booster.
- Original local item shop using earned CP only.
- Match-start loadout application and atomic booster consumption.
- Six original character active skills with one use per match.
- Save bundle V3 migration from V1/V2.
- Lobby, waiting room, inventory, shop, and in-match HUD integration.

## V53 — Smart AI and World Events

- Added saved Casual, Smart, and Expert local AI profiles.
- Added difficulty-aware purchase, upgrade, takeover, World Travel, and Game Center decisions.
- Added deterministic World Events every two rounds with six original event types.
- Added Local Room controls for AI difficulty and World Event enable/disable.
- Added event presentation, event history, and HUD round status.
- Upgraded room settings to version 2 while preserving the version-3 local save bundle.

## V54 Team Clash

- Added local Solo and Team match modes.
- Added alternating Blue/Gold 2v2 assignments.
- Added ally rent waiver, team victory checks, aggregate team score, cooperative AI context, and team-aware career rewards.

## V55 Ranked Season

- Added a separate local ranked progression model with monthly season rollover.
- Added five placement matches and six RP tiers from Bronze through Master.
- Added rating-aware AI matchmaking and fixed ranked match settings.
- Added Solo placement and Team victory rating changes.
- Added a simulated local leaderboard and recent ranked match history.
- Added a five-match weekly CP reward with Monday rollover.
- Added Ranked Arena lobby, navigation, result RP, promotion presentation, and save migration.
- Upgraded the local save bundle to version 4 while preserving V54 data.

## V56 Online Foundation and Replay Library

- Added persistent online-ready identity, friend-room resume state, spectator slots, cloud manifest contracts, and bounded replay records.
- Kept all transport behavior simulated/local while defining safe migration and rollback boundaries.

## V57 Supabase Realtime Rooms

- Added optional Supabase anonymous authentication and exact pinned client dependency.
- Added secure room create/join RPCs, private Broadcast, Presence, ready sync, reconnect state, and latency checks.
- Added membership-scoped RLS for room tables and `realtime.messages` topics.
- Added save-bundle v6 and online-profile v2 migration.
- Kept local gameplay as fallback and explicitly deferred server-authoritative board turns to the next network milestone.

## V58 — Server-Authoritative Turns

- Revisioned Supabase RPC command protocol.
- Server-generated dice and turn validation.
- Idempotency and append-only event history.
- Private match event Broadcast.
- Authority Console and reconnectable snapshots.


## V59 — Server-Authoritative Economy

- Added authoritative city ownership and building state.
- Added server purchase, upgrade, Landmark, rent, takeover, tax, and bonus reducers.
- Added deterministic liquidation, bankruptcy, and bank asset return.
- Added Solo/Team last-standing and round-limit net-worth victory.
- Expanded private event history and Online Center economy controls.

## V60 — Authoritative Special Tiles and Live Board

- Added a 32-tile Cocos Live Board rendered entirely from the Supabase authoritative snapshot.
- Added server Fortune, Game Center, Olympic, World Travel, Island, and Rent Shield reducers.
- Added bounded server option allow-lists for all player selections.
- Added remote player/property synchronization hooks for the local model.
- Preserved private Realtime, revision, idempotency, append-only events, authoritative economy, and reconnect behavior.
- Deferred full cinematic 3D event playback, character skills, and remaining loadout/world-event authority.

## V61 — Cinematic Multiplayer Authority

- Added a bounded authoritative event presentation queue with sequence deduplication for reconnect-safe playback.
- Connected server dice, movement, purchase, upgrade, takeover, special-tile, World Event, and victory events to the Cocos live-board presentation layer.
- Added server-configured character, pendant, and booster loadouts before authoritative match start.
- Added one-use server-authoritative character skills for Alexia, Nova, Lux, Onyx, Mira, and Volt.
- Added server-authoritative World Events every two rounds when enabled by room settings.
- Preserved snapshots as the sole source of truth; presentation effects never calculate gameplay outcomes.

## V62 — 3D Server Authority

- Added a dedicated Cocos 3D presenter for authoritative multiplayer snapshots and events.
- Added remote player rigs, server dice playback, wrapped board movement, camera tracking, property reconstruction, and reconnect reconciliation.
- Fixed movement payload compatibility for both `from`/`to` and `fromPosition`/`toPosition` event formats.

## V63 — Spectator and Server Replay

- Added player/spectator join roles with spectator-safe action restrictions.
- Added overview, next-player, and automatic spectator camera modes.
- Added bounded authoritative replay loading with pause, speed control, skip-to-end, and live-state buffering.
- Added membership-protected replay RPC access without exposing the original room to non-members.

## V64 — Replay Studio

- Added checkpoint-based replay seeking, timeline scrubbing, event stepping, pagination, and duplicate removal.
- Added permanent Supabase replay archives with Private, Unlisted, and Public visibility.
- Added eight-character share codes, replay ownership controls, public replay discovery, and server-side deletion.

## V65 — Competitive Circuit

- Added a server-ranked Solo and Team queue with expanding rating windows and private reserved rooms.
- Added persistent competitive profiles, global leaderboard summaries, idempotent result finalization, and lifetime competitive statistics.
- Added host-created 4/8-player Solo elimination tournaments with automatic seeding, authoritative room reservations, bracket progression, and champion rewards.
- Added the COMPETE lobby page for queue controls, tournament creation/joining, leaderboard viewing, and direct connection to assigned rooms.

## V66 — Realtime Seasons and Team Cups

- Replaced manual ranked polling with authenticated private Realtime queue notifications.
- Added monthly UTC server seasons, lifetime stat archival, optional Supabase Cron scheduling, and lazy rollover fallback.
- Added native Cocos EditBox input for competitive creation and join workflows.
- Added Team Clash 2v2 elimination cups for four or eight players with deterministic seeding and authoritative TEAM rooms.
- Added cross-mode tournament membership guards, cross-table code collision protection, and backward-compatible Solo tournament routing.

## V90 — Bankruptcy Rescue & Liquidation

- Added automatic strategic liquidation for unpaid rent.
- Added 70% building recovery and 60% land recovery.
- Added asset-preservation scoring for Monopoly, Tourism, Landmarks, protection, and rent value.
- Added liquidation HUD and 3D board presentation.
- Corrected bankruptcy to require an actual unpaid balance.

## V95 — Journey Prestige & Perfect Streaks

- Added ten Prestige levels beyond the twenty base World Journey tiers.
- Added duplicate-safe Perfect Day and Perfect Week rewards.
- Added consecutive UTC activity streaks and a bounded first-match daily Journey XP bonus.
- Added Prestige and Perfect Cycle result presentation plus a 3D Prestige crown.
- Upgraded Career progression to version 4 and local saves to version 8 with V94 migration.

## V96 — Season Archive & Rival Board

- Archives completed monthly World Journey seasons without deleting lifetime progression.
- Tracks lifetime Journey XP, best season, season reward totals, and twelve recent season records.
- Adds an explicitly local six-player Rival Board with deterministic season-based rivals.
- Adds season-rollover result messaging and a 3D archive-ring presentation.
- Migrates Career progression to version 5 and local save data to version 9.


## V97 — Rival Contracts & Highlight Reel

- Replaced player-relative rival offsets with deterministic season Rival Ratings.
- Added rating changes based on placement, performance, awards, and classic victories.
- Added four duplicate-safe seasonal Rival Contracts with CP and Journey XP rewards.
- Added lifetime Rival wins, best ranks, and archived season Rival results.
- Added a Career Highlight Reel and V97 result/3D Rival Champion presentation.
- Migrated Career progression to version 6 and local save data to version 10.

## V98 — Rival Gauntlet & Tactical Replays

- Added seasonal Rival Gauntlet score and six duplicate-safe circuit rewards.
- Added current and best podium streak tracking.
- Added Gauntlet score, streak, and circuit completion to monthly season archives.
- Added tactical tags and replay-priority scoring to Career highlights and Replay Studio.
- Added V98 Career, result HUD, Final Honors, and 3D Gauntlet presentation.
- Migrated Career progression to version 7 and local save data to version 11.

## V99 — Replay Coach & Decision Review

- Added automatic coaching analysis to local replay records.
- Added coaching grade and score with tempo, economy, control, and resilience metrics.
- Added strengths, improvement focus, and key decision moments.
- Migrated Replay Library data from version 1 to version 2 without deleting V98 records.
- Updated Replay Studio with Decision Review presentation.
- Fixed duplicate initialization when opening a server replay archive.

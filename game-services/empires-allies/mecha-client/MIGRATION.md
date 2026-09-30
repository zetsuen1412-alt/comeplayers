# Full conversion plan: keep mechanics, replace presentation

## Verified starting point

Repository: `zetsuen1412-alt/comeplayers`.
Base commit inspected: `9f6263d5e09b51bec725884263e5fcdc49664879`.
Project: `game-services/empires-allies`.

`comeplayers_server.py` integrates the Raise the Empires Python server with ComePlayers accounts, authenticated launch tickets, and server-side saves. It serves the existing client through `templates/comeplayers_play.html` and Ruffle. The AMF action gateway is exposed at `/flashservices/gateway.php` and `/comeplayers/flashservices/gateway.php`. The repository includes `assets/ZGame.109338_tracer2.swf`.

The integration notice distinguishes the preservation server's GPL-3.0 license from historical game artwork, SWF, audio, and branding. Retain that notice and the existing LICENSE. Replacing artwork alone does not establish permission to redistribute every remaining dependency.

## Scope of this change

Only a standalone `mecha-client/` preview is added. It is deliberately not wired into `comeplayers_play.html`, launch redirects, the AMF gateway, authentication, player saves, or deployment. No legacy file is deleted or silently replaced. Main-branch gameplay remains untouched until a reviewed integration is ready.

The initial designs are concepts, not an assertion that the entire original visual inventory has been replaced. `bindVisual` is a small presentation wrapper, not an operational adapter.

## Target architecture

1. **Inventory before mapping.** Inventory every client-loaded visual, animation, font, sound, map layout, portrait, and script dependency. Identify its source and license. Determine which behavior lives in the SWF versus the Python server. Do not treat GPL server code as permission to ship unrelated historical assets.
2. **Extract a gameplay contract.** Record actual unit/building IDs, commands, state shapes, timing semantics, counter relationships, combat resolution, campaign progress, and save versions from authorized source/tests. Do not invent production IDs from preview names.
3. **Build an original client.** Implement an independently authored HTML5 presentation layer instead of assuming a CSS skin replaces graphics embedded inside the SWF. Reuse appropriately licensed server code with its notices and obligations preserved. Map verified game definitions to original mecha/building/pilot visuals in a separate manifest.
4. **Preserve authoritative rules.** Keep damage, costs, rewards, training/build durations, energy, target restrictions, counters, capacity, progression, and alliance rules authoritative on the server. Client animations only display verified outcomes. Add authenticated, validated action adapters; never let a browser submit arbitrary save objects or use legacy editor/cheat endpoints.
5. **Treat maps as data, not just paint.** The three preview islands are decorative concepts. They are not imported player worlds. First preserve live object IDs, positions, occupancy, terrain restrictions, expansions, and pathing. New buildable layouts require versioned migrations and separate save backups; do not automatically move existing buildings onto decorative tiles.
6. **Finish the asset set.** Replace every unit tier, enemy, building state, environment, UI icon, portrait, attack/idle/move/hit animation, loading screen, and relevant audio. Use consistent scale, anchors, collision footprints, and directional views. Keep recognizable designs, names, and marks from other franchises out of the proposed original identity.
7. **Integrate and release behind a feature flag.** Use staging/test accounts, back up saves, validate the authenticated launch flow, and compare gameplay outcomes before making the new client the default. Keep a rollback path. Do not claim a complete conversion while the new client still loads unidentified historical resources.

## Gameplay-preservation acceptance tests

- Same authorized inputs and controlled random seeds produce the same combat outcomes, costs, rewards, counters, and progression, allowing only deliberately approved changes.
- Construction/training queues behave identically across refresh, reconnect, and multiple sessions.
- Unit selection, legal targets, battle completion, and invalid-action rejection are validated server-side.
- Existing saves round-trip without loss of object IDs, inventory, coordinates, friends, or campaign state.
- Map migration handles blocked tiles and expansions without silently destroying or overlapping objects.
- Authentication, launch expiry, account isolation, and ownership checks remain effective. Failed visual loads must not corrupt a save.
- Load-time/network inspection confirms the new release does not secretly require the original SWF or unreviewed historical artwork/audio.
- Mobile performance, keyboard controls, reduced motion, and readable unit silhouettes are tested on actual target devices.

None of the above live-game acceptance gates has passed merely because the standalone visual-preview tests pass.

## Proposed initial art direction

Anime-inspired, readable, colorful science fiction. Pilot portraits remain human anime characters; battlefield units use original compact mecha silhouettes. Aster Bay combines teal water and sakura accents; Solara Reach uses terracotta and mineral formations; Luma Shelf uses snow and aurora-coast colors. The map shapes and names are concepts, not a compatibility migration.

The six initial mecha provide a visual vocabulary rather than a replacement for all existing unit IDs. Additional tiers and variants need a verified inventory before production mapping.

# CP Mecha Frontier — anime-mecha visual preview

**Stage 1: presentation prototype, not a replacement game client.**

This folder starts the requested full visual conversion of CP Empires & Allies to original anime pilots, new island environments, and original land/sea/air mecha. `CP Mecha Frontier` and all character/unit names are working names, not a release or trademark-clearance decision.

The existing Flash/Ruffle client, Python game rules, authentication, account saves, deployment, and third-party notices are unchanged. This preview does not load the original SWF or connect to the live game. It must not be presented as a completed conversion or as gameplay-equivalent to the original.

## Open the preview

Open `index.html` in a modern browser. Everything needed for the preview is embedded in this file; no package installation, external image host, login, or database is required.

When local HTML files are blocked by device policy, serve this directory on localhost instead:

```sh
python -m http.server 8080 --bind 127.0.0.1 --directory game-services/empires-allies/mecha-client
```

Then open `http://127.0.0.1:8080`. The command above is run from the repository root. Do not expose this development server to the public internet.

## Included

- Six procedural SVG mecha concepts: Kestrel, Basalt, Vesper, Neris, Cirrus, Lyra.
- Three procedural SVG anime pilot concepts: Kaia Aster, Ren Solis, Mika Lune.
- Three concept maps with distinct coastline masks and palettes: Aster Bay, Solara Reach, Luma Shelf.
- Eight original procedural buildings: command center, frame workshop, pilot habitat, reactor, hydroponic garden, air hangar, mecha dock, relay tower.
- Isometric Canvas environment; pan, zoom, reset camera, building inspection, atlas, unit gallery, pilot selection, formation view, and a visual-only attack effect.
- Indonesian interface, keyboard access, reduced-motion support, animation pause, responsive desktop/mobile layout, and explicit prototype notices.

These are initial vector/procedural designs, not final painted illustrations, production sprite sheets, rigged 3D models, or a complete replacement asset inventory. The attack preview does not calculate or apply damage. There is no economy, construction queue, campaign, multiplayer, audio, or save system in this preview.

## Tests

From the repository root, with Node.js installed:

```sh
node --test game-services/empires-allies/mecha-client/test-preview.cjs
```

The eight tests cover catalog uniqueness, self-contained SVGs, map differences, building placement, presentation isolation, and the small `bindVisual` utility. That utility preserves a supplied definition by reference; it is not connected to actual legacy unit IDs and is not proof of gameplay parity.

Browser verification used headless system Chromium through Playwright, rendering the HTML with `page.set_content`: desktop 1440 × 1100 and mobile 390 × 844. Unit/map/pilot selection, modals, formation/effect controls, reduced motion, and mobile overflow checks passed with no JavaScript or SVG console errors. Direct `file://` navigation was blocked by the test environment, so opening the file directly was not independently verified. No live server, account, save, or legacy gameplay was tested.

## Export the original vector concepts

```sh
node game-services/empires-allies/mecha-client/export-assets.cjs
```

The script writes six mecha SVGs and three pilot SVGs to `mecha-client/exports/`. It does not overwrite existing files; use a different output directory when exporting again:

```sh
node game-services/empires-allies/mecha-client/export-assets.cjs ./mecha-assets-v2
```

## Next integration work

See `MIGRATION.md` for the current architecture, compatibility requirements, and release gates. `asset-provenance.json` describes the newly authored procedural artwork. The existing repository licenses and third-party notices remain in force; this folder does not relicense third-party code or historical assets.

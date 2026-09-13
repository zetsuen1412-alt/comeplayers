# ComePlayers Marble - Reference Analysis

These references are used only for gameplay and information hierarchy analysis. Names, logos, characters, textures, audio, icons, and layouts must not be copied.

## Sources reviewed

- `references/docs/Panduan-Lengkap-Modoo-Marble-PC-Indonesia.pdf`: 28 pages; full text was extracted with `pdfplumber`, all pages were rendered as a contact sheet with `pypdfium2`, and representative pages were visually inspected.
- `references/images/Modoo-Marble-Referensi-Gambar.zip`: 36 entries containing 33 images, including 9 contact sheets. The complete sheet, gameplay/HUD sheet, and annotated lobby were visually inspected.
- `references/videos/monopoli1.mp4`: 25:35.07, 638 x 360, 29.97 fps, AVC/H.264.
- `references/videos/monopoli 2.mp4`: 01:36.68, 640 x 360, 25 fps, AVC/H.264.
- `references/videos/monopoli3.mp4`: 10:00.10, 482 x 360, 30 fps, AVC/H.264.
- `references/videos/reference-card-and-gameplay-flow.mp4`: 01:36.69, 640 x 360; lobby, profile, Shop, card combine, start-benefit, Game Center, and Olympic presentation flow.
- `references/videos/reference-character-upgrade-flow.mp4`: 00:38.22, 640 x 360, 25 fps; card upgrade, material consumption, result reveal, upgrade-point gain, and point redemption.
- `references/videos/reference-pack-opening-flow.mp4`: 00:45.05, 640 x 360, 25 fps; pack purchase, pack opening, and sequential card reveal.
- `C:/Netmarble/NetmarbleModuMarble.zip`: 297.14 MB and 1,858 archive entries. It was inventoried by filename only and was not extracted into the project.

All three short videos were played and sampled directly. They are used only to study flow, pacing, camera timing, and information hierarchy; their audio and copyrighted visual assets are not reused. Original contact sheets are stored under `references/contact-sheets/` for fast internal review.

The additional `modo1`-`modo3` videos received the same reference-only treatment. The Netmarble archive contains 660 proprietary sprite containers, 403 bitmaps, 677 proprietary audio containers, 35 data files, executables, and DLLs. None of those files, balance tables, brands, layouts, or assets are copied, decoded, redistributed, or linked by the ComePlayers runtime.

## Video flow observations

- Video 1 shows the waiting-room hierarchy near the opening: four card-like player slots, solo/team grouping, host ownership, ready states, a map/options panel, and one dominant ready/start decision.
- Video 2 moves from a room-list lobby to category-first Shop and Character Card combine screens, then into the match tutorial. Profile/currency remain visible while meta destinations are separated from matchmaking.
- Video 3 begins with channel selection, continues to a two-column room list, opens a room-option panel with map, teams, four slots, player details, kick/friend actions, and ready state, then transitions into the board match.
- `modo1` confirms the value of persistent profile/currency context across Lobby, Shop, Character, and match-entry panels, plus short high-contrast reveals for Game Center and Olympic events.
- `modo2` exposes a clear progression loop: choose materials, confirm consumption, reveal a stronger card, earn upgrade points, then redeem a fixed point threshold for another card.
- `modo3` shows a purchase-confirm-reveal rhythm for packs. ComePlayers translates this into a deterministic local pack with one committed reward and an original reveal modal.

## Netmarble archive feature map

Filename hierarchy suggests the original product flow `Channel -> Lobby/Room -> Ready/Team/Map -> Match -> Result -> Lobby`, with separate systems for multiple maps, property economy, Golden Key/chance events, Olympic and World Tour spaces, character cards, enchant/mix/deck bonuses, accessories, dice inventory, missions, events, gifts, friends, guilds, chat, invites, and observation.

ComePlayers already covers the highest-value single-map core: rent, upgrades, Landmarks, takeover, bankruptcy/result ranking, Fortune, Olympic, World Travel, Island, Tax, Bonus, Game Center, a local room, and local card pack/equip/combine progression. The next original-system priorities are:

1. Liquidation choices and additional victory conditions.
2. Data-driven maps and Solo/Team modes.
3. Original loadouts, card enhancement, accessories, abilities, and persistent dice equipment.
4. Active mission progress, claimable rewards, player XP, and a reward inbox.
5. Channel/room browser foundations, followed by friends, chat, invites, spectating, and guilds when hosted services exist.

## Observed interaction patterns

- The board is a square perimeter with a readable empty center, four corner landmarks, raised property/building silhouettes, and an isometric camera.
- Four-player status is anchored around screen edges/corners, keeping the board center visible. Active turn and dice are emphasized near the play space.
- The lobby prioritizes room list, channel/filter controls, profile/currency, and promotional/meta-game navigation.
- The waiting room makes player slots, ready state, team/color, and a dominant start action immediately visible.
- Meta destinations are grouped separately from Play: Shop, Character Card, Dice, Inventory, Missions, and Settings stay reachable without competing with the main match action.
- Create-room setup is short and focused: local/online mode, player count, map/mode preview, turn options, confirm, and cancel/back.
- Shop is category-first, while Character Card screens place portrait, rarity, compact stats, passive information, and upgrade/combine actions around one selected item.
- Property ownership is communicated directly on board tiles; important choices use a centered modal while the board remains visible behind it.
- Turn order/card choice, dice result, and match result each receive a short, high-contrast presentation layer.
- Result screens show win/lose hierarchy, player comparison, rewards, and a clear continuation action.
- Character cards combine portrait, rarity/frame treatment, and compact stats.

## ComePlayers translation

- Keep the square-perimeter readability and short camera beats, but use charcoal/black surfaces, silver text, gold decisions, and neon-blue active states.
- Use original location names and original Alexia placeholder/final art. Do not reuse visual assets from the reference archive.
- Prefer mobile-safe corner panels, large touch targets, and fewer simultaneous labels than the dense PC reference.
- Keep systems modular: board data drives visuals; decision popups emit actions; camera states are independent of game rules.
- Recreate only the archive's high-level system intent. All ComePlayers names, rules, balance, UI geometry, artwork, animation, audio, icons, and implementation must remain original.
- Use the original flow `Main Menu/Lobby -> Local or Online -> Room -> Match -> Result`, with Local Match fully usable before hosted services are introduced.
- Keep online matchmaking, real-money payment, and copyrighted reference content out of the first front-end slice.

## Follow-up reference work

PDF diagrams/layout and all supplied videos have received a visual pass. Contact sheets now cover the guide, card/gameplay flow, character upgrade flow, and pack-opening flow. Any future timing analysis must remain reference-only, and implementation must continue using original ComePlayers names, artwork, audio, icons, balance, and layout geometry.

## V74 master reference convergence

The six supplied videos were confirmed byte-for-byte identical to the six reference videos previously inventoried in the source project. They have now been consolidated with the 28-page guide and the PC image library into a separate master reference pack. The implementation checklist is stored in `docs/MODOO_MASTER_REFERENCE_V74.md`.

V74 applies the first presentation convergence pass: tighter isometric framing, a clear center dice arena, compact four-corner player panels, central circular roll action, live rank/asset display, larger total reveal, and lower pawn hops. Proprietary names, logos, characters, textures, icons, audio, and source assets remain excluded from the runtime.

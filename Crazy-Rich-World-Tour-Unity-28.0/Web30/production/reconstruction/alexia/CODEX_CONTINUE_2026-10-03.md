# Titik lanjut diperbarui — 2026-10-04

File ini sekarang riwayat percobaan V8. Untuk status terbaru seluruh proyek, mulai dari [CHECKPOINT_LATEST_ID.md](../../../CHECKPOINT_LATEST_ID.md) dan [CHARACTER-PROGRESS_ID.md](../../CHARACTER-PROGRESS_ID.md).

Sepuluh GLB roster tersimpan di `Web30/client/assets/characters/sculpt-v1/models/`. Alexia V11 sudah dihasilkan dan dipreservasi; V12 gagal tanpa tekstur/mesh; V13 berhenti di preflight. Jangan mengulang V8 sebagai titik lanjut default. Referensi aktif tetap Alexia V2 bermata biru. Roster lama dan kandidat Jutsu eksternal dicatat pada checkpoint lengkap.

---

# CODEX CONTINUE — Alexia reconstruction — 2026-10-03

## CONTINUATION UPDATE — 2026-10-03

User approved continuation from the displayed body-only draft and requested detailed game characters using available resources, especially free services and Gemini Nano Banana.

- Active Alexia remains BLUE-eyed V2. Four body-only individual images are saved in `production/reconstruction/alexia/v8-body-only/inputs/`; not a replacement master.
- Hunyuan3D-2mv V8 actually generated: seed 1412, steps 10, guidance 5, octree 256, rembg true. Raw GLB SHA-256 `e5da53c13dbe73e7604bd785342594107a6c24d513721526c432938166534837`; 333268 vertices/979960 faces. Seven real-mesh views are saved in `v8-body-only/geometry-contact-sheet.png`.
- Geometry verdict REBUILD BEFORE TEXTURE: prop/floor fusion resolved, but noisy fragmented hair, floaters and soft jacket/hand/shoe details remain. Trial deduplication/island cleanup + light smoothing did not pass. No rig, accepted texture, game replacement, or user mesh approval.
- Raw/cleanup GLB and real orbit GIF are saved in this Codex chat's outputs; rejected binary meshes are not installed in the game.
- TRELLIS multiview and Microsoft TRELLIS.2 single-image comparisons failed with hidden upstream errors. No GLB returned; cause is unconfirmed. Microsoft connection retry only recovered upload then encountered the same hidden application error. Do not state quota exhaustion without evidence.
- Gemini `gemini-3.5-flash-lite` actually returned a textual mesh/material/rig specification, saved as `v8-body-only/gemini-3d-spec.txt`. That call did not include images and is not visual approval.
- Connector v0.2 accepts direct inline PNG/JPEG/WebP references up to 3 MiB, so local image reviews need no public image hosting. 16 mocked offline tests passed; deployment build must be checked separately.
- Nano Banana 2 `gemini-3.1-flash-image` image API has no free tier under current published pricing. No paid image call, billing change or credit purchase was made. Gemini app is open signed out; user login is pending for app image quota. Never request passwords/API keys in chat.
- Inventory of all ten designs saved in `production/character-design-inventory-2026-10-03.json`. Eight unlabeled lineup identities are inferred by roster order and require confirmation before final asset assignments. Mochi requires kitten rig; Pip mechanical suitcase rig. Hidden sides/Skill choreography remain unspecified.

Next: use Nano Banana app after user login to clean/normalize coherent hair views while preserving V2; inspect before changed reconstruction. Do not repeat failed Hunyuan V8 unchanged or texture/rig/install this rejected mesh. Continue all ten only after one fidelity-validated method passes. Preserve same reviewed/in-game GLB hash and full Idle/Walk/Jump/Skill/Win/Lose + board evidence gates.

# Pip — native casing refinement, 5 October 2026

`trial-02` is the review candidate. Approval, choreography acceptance, and game integration remain **false**. Original source, V8, published checkpoints, and output files were not overwritten.

The new geometry changes the suitcase casing and companion casing from beveled slabs to rounded depth lofts, adds continuous crowned front/rear panels, makes the screen surrounds actual annular flanges around recessed black glass, seats thin travel patches above the curved face, deepens the raised globe badge, and smooths the cyan corner strap. Both unsupported dark lower V seams are omitted. The same plain rear design remains an interpretation of the unseen back; no new rear symbols or screen were added.

Two locally rendered trials were compared with the canonical crop and V8. Trial 01 exposed a shell/rear-lid intersection and partly buried patch glyphs. Trial 02 corrects those intersections by seating the whole lid beyond the rear cap and positioning each patch/icon from the crowned-face surface. The earlier trial is retained for evidence, not selected for handoff.

## Selected actual assets

| File relative to this directory | Bytes | SHA256 |
|---|---:|---|
| `trial-02/pip-reference-guided-candidate.glb` | 5,690,144 | `c25e835508cdd2401c57b9d478585f2bcf973b3943b2de64a695f0129f0f7d9f` |
| `trial-02/pip-reference-guided-candidate.blend` | 72,088,196 | `a985e301590403a548f46d748123f0448f859f4be80ac8dc70d43ae83872d367` |

The editable blend opens in `Pip Reference Review Candidate`. Original roster objects/actions remain in the original scene/datablocks. A fresh read-only reopen confirmed all 28 original object fingerprints and all 60 original action names. All 10 file images remain packed, so the saved blend does not depend on the historical image paths for those images.

The GLB contains actual volume geometry, 194 mesh parts and 97,580 triangles. V8 had 196 parts and 87,968 triangles: delta −2 parts, +9,612 triangles, +164,456 GLB bytes. All 13 joint rest transforms, inverse bind matrices, and all actual animation samples in `Idle`, `Walk`, `Jump`, `Skill`, `Win`, and `Lose` are identical to V8. There are no humanoid limbs or reference-image billboards.

The per-part audit identifies exactly 44 intended changed parts and two removed lower V seams. The other 150 parts preserve exact exported position, normal, skin, transform and material values and the same oriented triangles. Re-exporting procedural UVs creates a maximum `5.960464477539063e-8` difference; these flat-color materials do not use texture maps. Palette/material definitions are identical to V8.

## Actual render evidence

`trial-02/actual-mesh-renders-final/` contains seven 640px rest-pose views plus 24 actual-mesh orbit frames at 320px. Start with `front.png`, `left.png`, `back.png`, `three-quarter.png`, and `orbit/frame-030.png`. `frame-030` shows the reference-facing side. Images were rendered from the exported GLB in Blender 5.2.2, Cycles CPU, 32 samples, using the same review renderer as V8.

Reference: `work/model-rebuild/inputs/pip-canonical-crop.png`, cropped from the frozen canonical lineup. V8 before views: `work/model-rebuild/Pip/trial-v8/actual-mesh-renders/`. These workspace paths are provenance/comparison inputs, not links required to open the GLB or packed blend.

The casing shoulders and rear transitions are visibly softer than V8; front patches remain legible and the inset screen and badge have real depth. This pass does **not** establish perfect fidelity. The lower yellow plate still differs from the reference's patch/motif treatment, the cyan face does not reproduce the reference's soft glow under the shared studio renderer, fine armor/graphic detail remains approximate, and the back remains inferred. The companion pose and the original mechanical layout are retained rather than inventing a new pose.

## Proof and reproducibility

Proof files are in `trial-02/`:

- `pip-reference-guided-candidate.manifest.json`: source identity, editable/GLB hashes, native parts, original-object preservation, exact rig comparison and geometry operations.
- `rounded-case-refinement.proof.json`: frozen source/reference/V8 identities and exact actual joint/clip comparison.
- `actual-glb-preservation.proof.json`: independent stdlib accessor/part audit, skin/index validity and before/after counts.
- `saved-editable-blend.proof.json`: actual saved-blend reopen, original preservation and packed-image confirmation.
- `actual-mesh-renders-final/render-evidence.json`: actual imported mesh counts, bounds, render settings and input GLB hash.

`refine_pip_case.py` imports the local byte-frozen `pip_v8_frozen_builder.py`; that copy has SHA256 `86a073f23cbe9af9f7fc8d690bef458b7338b915a1d07d33bb7f9e5ca5a33be2`. It verifies all source/reference/baseline hashes, requires a fresh empty output directory inside this pass, preserves original objects, and rejects any changed joint/clip data. Existing trials cannot be overwritten. Execute from the restored project root, with Blender available:

```powershell
& 'work/tools/blender/blender-5.2.2-windows-x64/blender.exe' --background --factory-startup --disable-autoexec --python-exit-code 3 --python 'work/model-refinement-2026-10-05/pip/refine_pip_case.py' -- --source 'work/characters-recovered/source.blend' --reference 'work/project/Crazy-Rich-World-Tour-Unity-28.0/Web30/production/references/chibi_travel_adventurers_collectible_lineup.png' --baseline 'work/model-rebuild/Pip/trial-v8/pip-reference-guided-candidate.glb' --output-dir 'work/model-refinement-2026-10-05/pip/rebuild-review' --confirm-rounded-case-refinement
```

Source/reference/baseline paths may point to restored copies, provided hashes match. The baseline pin is V8 `abef291c518c0ea34625678644910270fc9594e1d107ca80988db2059609fb32`; source pin is `c2ceab85a941585bf5d6189b250646a7647893e1fe3063d80fa7faa649c4dea4`; master-reference pin is `d3559fe6948cc5a1befffba7f779d46138517394dcb53f2deb0ce0be113c719e`.

Read-only exported-geometry verification, using Python 3.11+ and a fresh proof filename:

```powershell
python 'work/model-refinement-2026-10-05/pip/audit_pip_refinement.py' --baseline 'work/model-rebuild/Pip/trial-v8/pip-reference-guided-candidate.glb' --candidate 'work/model-refinement-2026-10-05/pip/trial-02/pip-reference-guided-candidate.glb' --expected-candidate-sha256 c25e835508cdd2401c57b9d478585f2bcf973b3943b2de64a695f0129f0f7d9f --output 'work/model-refinement-2026-10-05/pip/verification-new.json'
```

The blend SHA includes Blender save metadata; preserved source fingerprints and exported animation samples are checked separately. The GLB pin above identifies this reviewed binary. User visual approval is still required before treating any candidate as final.

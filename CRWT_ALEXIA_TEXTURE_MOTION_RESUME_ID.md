# Crazy Rich World Tour - Alexia texture and manual motion

Resume branch: `checkpoint/crazy-rich-world-tour-2026-10-06-alexia-texture-motion-portable`.
Review Git prefix: `Crazy-Rich-World-Tour-Unity-28.0/Web30/production/reconstruction/roster-texture-motion-2026-10-06`. Previous baseline: `Crazy-Rich-World-Tour-Unity-28.0/Web30/production/reconstruction/roster-side-colors-2026-10-06`.
Selected Alexia SHA256: `6502a072d375d6a63fe52a3974027f4d9aa5263709579583775fd85a98a4deb9`.

This checkpoint combines bounded hair/cup/jacket/cuff vertex-color cleanup and
a manual weighted 19-joint skeleton with actual IdleBreath and Walk channels.
The original geometry, normals, UV, indices, material/image data remain exact.
Head/cups/rear locks move together; the suitcase is a rigid right-hand accessory.
The manual in-place gait has no production foot IK/contact/collision guarantee.
Detailed remaining texture and motion limits are in the manifest and proofs.
Nine other GLBs, references and 45 actual PNGs remain the latest baseline bytes.
Pip retains its 13 joints and six clips. Alexia has five actual new neutral views.

Source Git stores the selected model in `viewer/models/alexia.glb.gz` with both
compressed and raw SHA/size pins. The raw GLB is explicitly derived and excluded
from the canonical source inventory. Exact-HEAD materialization creates it only
inside a fresh external tree. This preserves the original model bytes while
keeping the Git API upload bounded. The model-review ZIP contains raw GLBs.

Logical OFFLINE-GALLERY.zip is stored in ordered parts at most 22 MB each. The
restore helper validates the concatenated ZIP SHA, one-entry CRC and HTML SHA
in memory and writes only a fresh HTML:

```sh
python tools/restore_offline_gallery.py --archive OFFLINE-GALLERY.zip --pins source-pins.json --out ../CRWT-gallery-restored/BUKA-REVIEW-MODEL.html
```

From the root of an exact Git checkout, materialize and verify all source bytes
(PowerShell; the output directories and receipts must be new):

```sh
$checkpointHead = git rev-parse HEAD
python Crazy-Rich-World-Tour-Unity-28.0/Web30/production/reconstruction/roster-texture-motion-2026-10-06/tools/materialize_texture_motion_source.py --repo-root . --out-dir ../CRWT-texture-motion-raw --expected-commit $checkpointHead --receipt ../CRWT-texture-motion-materialization.json
python ../CRWT-texture-motion-raw/Crazy-Rich-World-Tour-Unity-28.0/Web30/production/reconstruction/roster-texture-motion-2026-10-06/tools/verify_texture_motion_source.py --roster ../CRWT-texture-motion-raw/Crazy-Rich-World-Tour-Unity-28.0/Web30/production/reconstruction/roster-texture-motion-2026-10-06 --baseline-roster ../CRWT-texture-motion-raw/Crazy-Rich-World-Tour-Unity-28.0/Web30/production/reconstruction/roster-side-colors-2026-10-06 --inventory ../CRWT-texture-motion-raw/Crazy-Rich-World-Tour-Unity-28.0/Web30/production/reconstruction/roster-texture-motion-2026-10-06/source-inventory.json --pins ../CRWT-texture-motion-raw/Crazy-Rich-World-Tour-Unity-28.0/Web30/production/reconstruction/roster-texture-motion-2026-10-06/source-pins.json --receipt ../CRWT-texture-motion-source-check.json
python ../CRWT-texture-motion-raw/Crazy-Rich-World-Tour-Unity-28.0/Web30/production/reconstruction/roster-texture-motion-2026-10-06/tools/rebuild_texture_motion_gallery.py --roster ../CRWT-texture-motion-raw/Crazy-Rich-World-Tour-Unity-28.0/Web30/production/reconstruction/roster-texture-motion-2026-10-06 --build-dir ../CRWT-texture-motion-gallery-build --receipt ../CRWT-texture-motion-gallery-check.json
```

The materialization output contains the new prefix plus pinned baseline comparison
files. Run its delivered source verifier with that new prefix and baseline prefix,
then rebuild gallery to another fresh external directory. CI performs these same
standard-library checks; no Blender/GPU generation occurs in CI.

For native editing, open `editable/Alexia-texture-motion-review.blend` (Alexia
only). Actual mesh/color/material/weight/bone/action/NLA fingerprints are checked
across local save and read-only reopen. Native representation follows Blender's
importer; the packaged GLB remains byte-exact.

Reproduce texture and motion from the model-review root with Python3, NumPy and
Pillow. Both standalone recipes are packaged; use fresh output outside review:

```sh
python evidence/selected-alexia/recipes/build_semantic_palette_soft_volume.py --source evidence/selected-alexia/source/alexia-baseline.glb --reference references/alexia-blue-v2-turnaround.png --output-parent ../CRWT-Alexia-texture-motion-rebuilt --variant soft-volume-protected
python evidence/selected-alexia/recipes/build_alexia_motion.py --source ../CRWT-Alexia-texture-motion-rebuilt/soft-volume-protected/alexia.glb --semantic-mask ../CRWT-Alexia-texture-motion-rebuilt/soft-volume-protected/semantic-masks.npz --output-parent ../CRWT-Alexia-texture-motion-rebuilt --name alexia-texture-motion
```

The ASCII source inventory excludes itself, derived raw GLB/HTML and the later
local publication receipt. Parent publisher preserves 4,536 previous repository
blobs and eight earlier checkpoints. Local ZIP scope is model review; full game
source and Git history are on the recorded Git branch. All models remain
approved:false and gameIntegrated:false. Final publication requires five distinct
completed successful CI runs on the exact new commit.

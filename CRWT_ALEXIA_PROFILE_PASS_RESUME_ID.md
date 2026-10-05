# Crazy Rich World Tour — Alexia profile pass

Continue from `checkpoint/crazy-rich-world-tour-2026-10-05-alexia-profile-portable`.
This adds a new review folder while preserving the prior project, models and checkpoint branches.

The current review folder is:
`Crazy-Rich-World-Tour-Unity-28.0/Web30/production/reconstruction/roster-profile-pass-2026-10-05`.

Extract its `OFFLINE-GALLERY.zip`, then open `BUKA-REVIEW-MODEL.html` for an offline ten-character comparison. This one-file archive preserves the exact gallery bytes while keeping the GitHub transfer within its size limit. The separate local model checkpoint ZIP already contains the HTML directly. Only Alexia changes in this pass. The nine other GLBs and their references match the preceding reference-fidelity checkpoint exactly.

For a verified command-line extraction from the new review folder, run `python tools/restore_offline_gallery.py --archive OFFLINE-GALLERY.zip --out BUKA-REVIEW-MODEL.html`. The helper refuses to overwrite an existing file and checks CRC and the pinned gallery SHA.

Alexia has a bounded Z-only rear-hair contour adjustment (3,396 original positions changed within the existing 3,695-vertex ROI; maximum displacement about 0.028 world units) and conservative side-reference colors on 33,907 surface vertices. Five new actual renders are included; the other 45 renders are explicitly reused from unchanged models.

For editing, open `editable/Alexia-profile-review.blend`. This native scene contains Alexia only. To reopen and compare it against the packaged GLB without changing either input, run Blender with the included `tools/reopen_alexia_portable.py`, passing `--blend editable/Alexia-profile-review.blend --manifest alexia-editable-manifest.json --out FRESH-REPORT.json` after `--`.
The original GLB float colors are preserved; native colors use Blender's imported BYTE_COLOR representation. There are no active FILE images in this Alexia scene; the two unused embedded source images remain intact in its GLB.

The previous full-roster editable native remains in the reference-fidelity checkpoint. See that folder's `READ-ME-FIRST-GIT.txt` for exact reassembly of its two native archive parts. The full Unity/Web30/game/backend project remains in this Git snapshot. The separate local model ZIP contains review assets and one native Alexia, not the full game or Git history.

For a fresh source checkout with unchanged text bytes:
```sh
git -c core.autocrlf=false clone --branch checkpoint/crazy-rich-world-tour-2026-10-05-alexia-profile-portable https://github.com/zetsuen1412-alt/comeplayers.git
```
Use the new folder's source inventory verifier for exact source files; a source archive also preserves those bytes. The final local ZIP has its own `verify_profile_checkpoint.py` and `checkpoint-manifest.json` for checking an extracted model package.

This remains a static review candidate. The profile contour is modestly improved; the lower hair is still a merged mass with pale patches, and separate curled locks, anatomy, optimization, rigging and game integration remain outstanding. No perfect 360-degree match, production approval or precision percentage is claimed. The older checkpoints remain available.

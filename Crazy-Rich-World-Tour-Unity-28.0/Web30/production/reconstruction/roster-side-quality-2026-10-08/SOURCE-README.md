# Alexia side-quality source checkpoint, 08 October 2026

This additive source prefix restores the selected ten-character review exactly.
Alexia has six shallow closed side-hair volumes and bounded hair/upper-jacket
color cleanup. Original mesh geometry, faces/hands/cups, weights, skeleton and
IdleBreath/Walk remain preserved under the selected source gate. The other nine
models, references and45 prior views are byte-identical to the previous review.

Selected Alexia SHA256: `e18cc26d9662d5ec615fa636150b5f4eddaab9c8ca4c2b3b1ea702bf1d50efca`.
Animated baseline SHA256: `6502a072d375d6a63fe52a3974027f4d9aa5263709579583775fd85a98a4deb9`.

From this source prefix, choose a fresh external directory:

```text
python -B tools/restore_side_quality.py --out-dir /path/to/fresh-review --receipt /path/to/fresh-restore-proof.json
```

Restore uses only Python's standard library. Every source file is pinned by
bytes/SHA256/Git blob SHA1 in `source-inventory.json`; the inventory excludes its
own hash. `source-layout.json` maps every restored review file. Large selected
GLB, compressed native and one-entry gallery ZIP use bounded parts. The portable
6502 baseline uses the exact previously published gzip blob. Every decompressed
GLB/native/HTML must match its raw SHA256; gallery CRC is checked. A generated
`checkpoint-files.json` supplies the delivered local payload verifier.

For the actual all-ten and selected change gates, install NumPy2.3.5 and add:

```text
python -B tools/restore_side_quality.py --out-dir /path/to/another-fresh-review --receipt /path/to/another-proof.json --verify-models --verify-source-gate
```

The actual Blender build/reopen fingerprints, browser review, five neutral
renders, four motion frames and selected portable-reproduction evidence are
included. This source verifier does not download Blender or repeat those views.
In the gallery, choose `Pose statis` to stop motion before inspecting a profile.
Rebuild instructions and both standalone recipes are restored at
`evidence/selected-alexia/README-portable-rebuild.md`. Generated rebuild outputs
must stay outside the restored review. No rejected hair/headphone trial or old
CI receipt is included. The retained local review flags describe the reviewed
payload; a separate publication receipt records the new Git/CI outcome.

Remaining limits include the inherited coarse core hair, mottled headphone
band, lower garment/shoe/case artifacts and a manual in-place gait without foot
IK or hair simulation. Approval, game integration and production readiness are
not claimed.

# Portable HIGH review source

This checkpoint restores the exact selected ten-character review. Nine models,
original references and their earlier renders are reused from the pinned sibling
`roster-side-quality-2026-10-08`; retain that source directory beside this one.
New model/native bytes use gzip parts of at most 22,000,000 bytes. The delivered
offline HTML and its receipt are regenerated and checked byte for byte.

From this source directory, restore to a fresh external directory:

```text
python -B tools/source_checkpoint/restore_high_visual.py --source . --out-dir ../CRWT-HIGH-restored --receipt ../CRWT-HIGH-restore-proof.json --verify-models --verify-high-gate
```

Then rebuild the selected model from the complete pinned authoring and cleanup recipes:

```text
python -B tools/source_checkpoint/rebuild_high_visual.py --source . --payload ../CRWT-HIGH-restored --out-dir ../CRWT-HIGH-rebuilt --receipt ../CRWT-HIGH-rebuild-proof.json
```

Restoration uses only the Python standard library; source-gate and model
rebuilding require NumPy. Blender/PNG/browser regeneration is not required:
the exact reviewed native file, PNGs and evidence are restored. IdleBreath/Walk
remain manual prototype clips; no production IK, simulation or game integration
is claimed. No command writes to the review inputs or runs Git.
The delivered actual checkpoint verifier also checks existing native build/reopen
evidence; a new Blender process is not required by this source-only check.

For the complete CI-style check, use a fresh external directory:

```text
python -B tools/source_checkpoint/run_high_visual_source_checks.py --source . --work ../CRWT-HIGH-checked --receipt ../CRWT-HIGH-source-check.json
```

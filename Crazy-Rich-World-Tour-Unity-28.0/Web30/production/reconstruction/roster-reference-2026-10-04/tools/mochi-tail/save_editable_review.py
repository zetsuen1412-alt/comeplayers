"""Import the frozen actual Mochi candidate into an editable, packed Blender file."""
import argparse
import hashlib
import json
import sys
from pathlib import Path
import bpy

ap = argparse.ArgumentParser(description=__doc__)
ap.add_argument("--glb", type=Path, required=True)
ap.add_argument("--expected-sha256", required=True)
ap.add_argument("--output", type=Path, required=True)
a = ap.parse_args(sys.argv[sys.argv.index("--") + 1:])
a.glb = a.glb.resolve(strict=True)
a.output = a.output.resolve()
if a.output == a.glb or a.output.exists():
    raise ValueError("Editable review output must be fresh")
raw = a.glb.read_bytes()
if hashlib.sha256(raw).hexdigest() != a.expected_sha256:
    raise ValueError("Actual candidate identity mismatch")
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(a.glb))
bpy.context.scene.name = "Mochi inferred tail connector candidate"
bpy.context.scene["visual_final_approved"] = False
bpy.context.scene["glb_sha256"] = a.expected_sha256
bpy.context.scene["hidden_connector_inferred"] = True
for obj in bpy.context.scene.objects:
    obj["character_id"] = "mochi"
    obj["review_status"] = "CANDIDATE_NOT_APPROVED"
for image in bpy.data.images:
    if image.has_data and not image.packed_file:
        image.pack()
a.output.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(a.output))
if a.glb.read_bytes() != raw:
    raise ValueError("GLB changed during editable import")
print(json.dumps({"output": str(a.output), "sha256": hashlib.sha256(a.output.read_bytes()).hexdigest(),
    "bytes": a.output.stat().st_size, "actual_glb_preserved": True, "visual_final_approved": False}))

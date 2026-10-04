"""Pin combined tail topology and PBR review outputs, without claiming visual approval."""
import argparse
import hashlib
import json
from pathlib import Path
from inspect_components import SOURCE_SHA, inspect, read_glb


def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--trial", type=Path, required=True)
    ap.add_argument("--expected-refined-sha256", required=True)
    a = ap.parse_args()
    trial = a.trial.resolve(strict=True)
    refined = trial / "refined"
    geometry = trial / "mochi-tail-attached-candidate.glb"
    model = refined / "mochi-tail-attached-surface-candidate.glb"
    blend = model.with_suffix(".blend")
    receipt = refined / "MOCHI-HANDOFF.json"
    guide = refined / "MULAI-DI-SINI-MOCHI.md"
    if receipt.exists() or guide.exists(): raise SystemExit("Frozen handoff already exists")
    topology_path = trial / "mochi-tail-attachment.proof.json"
    material_path = model.with_suffix(".material-refinement.json")
    topology = json.loads(topology_path.read_text())
    material = json.loads(material_path.read_text())
    renders = refined / "actual-mesh-renders"
    render_path = renders / "render-evidence.json"
    render = json.loads(render_path.read_text())
    source = Path(topology["source"]["path"])
    if sha(source) != SOURCE_SHA or sha(geometry) != topology["output"]["sha256"]:
        raise SystemExit("Source/topology identity mismatch")
    if sha(model) != a.expected_refined_sha256 or material["output_sha256"] != a.expected_refined_sha256 or render["input_sha256"] != a.expected_refined_sha256:
        raise SystemExit("Combined GLB/PBR/render identity mismatch")
    _, geometry_doc, geometry_bin = read_glb(geometry)
    _, doc, binary = read_glb(model)
    if binary != geometry_bin or any(doc.get(k) != geometry_doc.get(k) for k in geometry_doc if k != "materials"):
        raise SystemExit("Material refinement changed geometry or texture bytes")
    if any(m.get("normalTexture", {}).get("scale") != 0 or m["pbrMetallicRoughness"]["roughnessFactor"] != .55 for m in doc["materials"]):
        raise SystemExit("Expected exact normal-scale0/roughness.55 settings")
    positions, faces, components = inspect(doc, binary)
    if len(components) != 1 or len(faces) != 23260:
        raise SystemExit("Actual final geometry mismatch")
    views = sorted(renders.glob("*.png"))
    orbit = sorted((renders / "orbit").glob("*.png"))
    if len(views) != 7 or len(orbit) != 24: raise SystemExit("Actual render set incomplete")
    used = {i for face in faces for i in face}
    unused = [i for i in range(len(positions)) if i not in used]
    if unused != [3496, 4339, 4340, 4341, 4343, 13994]: raise SystemExit("Unexpected unused source attributes")
    files = [model, blend, material_path, render_path] + views + orbit
    proof = {"schema": "crwt.mochi-candidate-handoff.v1", "status": "reference_guided_tail_attachment_and_pbr_candidate",
        "visual_final_approved": False, "game_assets_replaced": False,
        "source_sha256": SOURCE_SHA, "source_input_unchanged": True,
        "geometry_candidate_sha256": sha(geometry), "combined_glb_sha256": sha(model), "combined_glb_bytes": model.stat().st_size,
        "geometry": {"meshes": len(doc["meshes"]), "accessor_vertices": len(positions), "loaded_render_vertices": render["vertices"],
            "triangles": len(faces), "connected_components": len(components), "unused_original_fan_center_indices": unused,
            "all_welded_edges_two_faces": topology["geometry"]["all_welded_edges_two_faces"],
            "surface_winding_consistent": topology["geometry"]["surface_winding_consistent"],
            "original_visible_vertex_positions_preserved": True, "skins": len(doc.get("skins", [])), "animations": len(doc.get("animations", []))},
        "materials": {"normal_scale": 0, "roughness_factor": .55, "embedded_texture_bytes_unchanged": True},
        "selection": topology["selection"],
        "actual_review": {"views": 7, "orbit_frames": 24, "bounds_blender_z_up": render["bounds_blender_z_up"],
            "observed": "Cat identity, visible body and cream tuft retained; one short curved posterior connector closes the disconnected component.",
            "limits": ["Hidden connector anatomy is inferred from a single front view; user approval remains pending.",
                "Only twelve hidden fan faces are replaced; the cream tuft retains 434 of its 440 source faces and every original vertex attribute.",
                "Small front hip-gap pixels may change; pixel-identical silhouettes are not claimed.",
                "Source rear shape and blurry microdetail remain; source generated textures were not repainted.",
                "No extra fluffy tip, rig, animation or board integration was added."]},
        "dependency_proofs": [{"path": "../" + topology_path.name, "sha256": sha(topology_path)},
            {"path": "../frozen-face-selection.json", "sha256": sha(trial / "frozen-face-selection.json")}],
        "files": [{"path": p.relative_to(refined).as_posix(), "sha256": sha(p), "bytes": p.stat().st_size} for p in files]}
    receipt.write_text(json.dumps(proof, indent=2) + "\n", encoding="utf-8")
    guide.write_text(
        "# Mochi — kandidat attachment tip + material review\n\n"
        "Buka `mochi-tail-attached-surface-candidate.glb`. Ini mesh 3D aktual dengan texture asli yang tetap embedded. "
        "Tip cream asli dipertahankan; hanya 12 triangle tersembunyi pada dua attachment port diganti dan satu connector melengkung ditambahkan di belakang bag/body. "
        "Hasil satu connected component dan closed welded manifold. Connector memakai orange texel atlas sumber; tidak ada texture baru.\n\n"
        "Material review menggunakan normal scale 0 dan roughness 0,55; raw BIN geometry/texture sama persis dengan kandidat attachment. "
        "File `.blend` menyediakan edit lokal dengan image packed. Model statis, belum punya rig atau clip animasi.\n\n"
        "Lihat 7 view PNG dan 24 PNG orbit pada `actual-mesh-renders/`. Proof topology dan frozen face IDs berada satu folder di atas. "
        "`MOCHI-HANDOFF.json` memuat hash semua file. Source normalized GLB tetap SHA `" + SOURCE_SHA + "`.\n\n"
        "Status kandidat, belum disetujui pengguna dan belum mengganti game assets. Connector tersembunyi ialah inference satu gambar; rear dan microdetail sumber tetap perlu kritik. "
        "Small hip-gap pixels berubah untuk menutup koneksi; tidak ada klaim front pixel-identical atau sempurna.\n\n"
        "Reproduksi: `../../attach_tail_candidate.py` membuka source yang dipin, output fresh; "
        "kemudian `../../../refine_candidate_material.py` memakai normal-scale 0 dan roughness 0.55. "
        "Render memakai `../../../render_review_blender.py`, Blender 5.2.2 LTS.\n\n"
        f"Combined GLB SHA-256: `{sha(model)}`.\n", encoding="utf-8")
    print(json.dumps({"model": str(model), "sha256": sha(model), "receipt_sha256": sha(receipt), "bytes": model.stat().st_size}))


if __name__ == "__main__": main()

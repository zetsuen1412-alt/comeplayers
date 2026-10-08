"""Build a new portable, editable Blender review workspace from GLB candidates.

Blender CLI:
  blender --background --factory-startup --disable-autoexec --python-exit-code 3 \
    --python build_roster_review_workspace.py -- --manifest roster.json --out roster.blend

Manifest may be [{"id": "Alexia", "path": "models/alexia.glb"}, ...] or an
object with that list under "characters". Relative paths resolve against the
manifest directory. Optional entry fields: sha256, status, label. The importer
does not normalize, remesh, unwrap, recolor or rig the assets. An optional grid
uses only parent translations for convenient review; original mesh/material/UV
data and imported object rotations/scales stay intact. Inputs and prior outputs
are never overwritten. New .blend saves pack images for offline portability.
"""
import argparse
import array
import hashlib
import json
import math
from pathlib import Path
import re
import struct
import sys

import bpy
from mathutils import Vector


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def parse_glb(raw):
    require(len(raw) >= 28 and struct.unpack_from("<4sII", raw) == (b"glTF", 2, len(raw)),
            "Expected complete GLB 2.0")
    document, binary, offset = None, None, 12
    while offset < len(raw):
        require(offset+8 <= len(raw), "Truncated GLB chunk")
        length, kind = struct.unpack_from("<II", raw, offset)
        offset += 8
        chunk = raw[offset:offset+length]
        require(len(chunk) == length, "Truncated GLB payload")
        if kind == 0x4E4F534A:
            require(document is None, "Duplicate JSON chunk")
            document = json.loads(chunk.rstrip(b" \0"))
        elif kind == 0x004E4942:
            require(binary is None, "Duplicate BIN chunk")
            binary = chunk
        else:
            raise ValueError("Unknown GLB chunk")
        offset += length
    require(document is not None and binary is not None, "Missing embedded JSON/BIN")
    require(len(document.get("buffers", [])) == 1 and "uri" not in document["buffers"][0],
            "Workspace requires one embedded GLB buffer")
    for image in document.get("images", []):
        require("bufferView" in image or str(image.get("uri", "")).startswith("data:"),
                "External image URI is not portable; provide a self-contained GLB")
    return document


def float_values(data, property_name, width):
    values = array.array("f", [0]) * (len(data)*width)
    data.foreach_get(property_name, values)
    return values.tobytes()


def mesh_fingerprint(mesh):
    loop_indices = array.array("i", [0]) * len(mesh.loops)
    mesh.loops.foreach_get("vertex_index", loop_indices)
    starts, sizes = array.array("i", [0])*len(mesh.polygons), array.array("i", [0])*len(mesh.polygons)
    mesh.polygons.foreach_get("loop_start", starts)
    mesh.polygons.foreach_get("loop_total", sizes)
    material_indices = array.array("i", [0])*len(mesh.polygons)
    mesh.polygons.foreach_get("material_index", material_indices)
    uv = [{"name": layer.name, "float32_uv_sha256": sha(float_values(layer.data, "uv", 2))}
          for layer in mesh.uv_layers]
    return {"vertices": len(mesh.vertices), "polygons": len(mesh.polygons), "loops": len(mesh.loops),
            "position_float32_sha256": sha(float_values(mesh.vertices, "co", 3)),
            "loop_vertex_indices_sha256": sha(loop_indices.tobytes()),
            "polygon_starts_sizes_sha256": sha(starts.tobytes()+sizes.tobytes()),
            "polygon_material_indices_sha256": sha(material_indices.tobytes()),
            "material_slot_names": [material.name if material else None for material in mesh.materials],
            "uv_layers": uv}


def material_fingerprint(material):
    nodes, links = [], []
    if material.node_tree:
        for node in material.node_tree.nodes:
            defaults = {}
            for socket in node.inputs:
                if not hasattr(socket, "default_value"):
                    continue
                value = socket.default_value
                if isinstance(value, (str, bool, int, float)):
                    defaults[socket.identifier] = value
                else:
                    try:
                        defaults[socket.identifier] = list(value)
                    except TypeError:
                        defaults[socket.identifier] = str(value)
            nodes.append({"name": node.name, "type": node.bl_idname, "defaults": defaults,
                          "image": node.image.name if hasattr(node, "image") and node.image else None})
        links = sorted((link.from_node.name, link.from_socket.identifier, link.to_node.name,
                        link.to_socket.identifier) for link in material.node_tree.links)
    data = {"name": material.name, "diffuse_color": list(material.diffuse_color),
            "metallic": material.metallic, "roughness": material.roughness,
            "nodes": nodes, "links": links}
    return sha(json.dumps(data, sort_keys=True, separators=(",", ":")).encode())


def bounds_of(objects):
    corners = [obj.matrix_world @ Vector(corner) for obj in objects if obj.type == "MESH" for corner in obj.bound_box]
    require(corners, "Candidate import contains no mesh")
    low = [min(c[i] for c in corners) for i in range(3)]
    high = [max(c[i] for c in corners) for i in range(3)]
    require(all(math.isfinite(value) for value in low+high), "Nonfinite imported bounds")
    return {"minimum": low, "maximum": high, "size": [b-a for a, b in zip(low, high)]}


def main():
    argv = sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--receipt", type=Path)
    parser.add_argument("--layout", choices=["grid", "none"], default="grid")
    parser.add_argument("--columns", type=int, default=4)
    parser.add_argument("--spacing", type=float, help="Optional positive grid spacing in Blender world units")
    args = parser.parse_args(argv)
    manifest_path, output = args.manifest.resolve(), args.out.resolve()
    receipt_path = args.receipt.resolve() if args.receipt else output.with_suffix(".workspace-proof.json")
    require(output.suffix.lower() == ".blend", "Output must be a new .blend")
    require(1 <= args.columns <= 20, "Grid columns must be 1..20")
    require(args.spacing is None or math.isfinite(args.spacing) and args.spacing > 0, "Invalid grid spacing")
    manifest_raw = manifest_path.read_bytes()
    manifest = json.loads(manifest_raw)
    entries = manifest if isinstance(manifest, list) else manifest.get("characters", manifest.get("models")) if isinstance(manifest, dict) else None
    require(isinstance(entries, list) and 1 <= len(entries) <= 100, "Expected a nonempty characters list, max100")
    records, ids, source_paths = [], set(), {manifest_path}
    for entry in entries:
        require(isinstance(entry, dict), "Character entry must be an object")
        character_id, source_value = entry.get("id"), entry.get("path")
        require(isinstance(character_id, str) and re.fullmatch(r"[A-Za-z][A-Za-z0-9_-]{0,63}", character_id),
                "Character id must be a simple unique identifier")
        require(character_id.casefold() not in ids, "Duplicate character id")
        ids.add(character_id.casefold())
        require(isinstance(source_value, str) and source_value, "Character path must be a string")
        path = Path(source_value)
        path = (manifest_path.parent / path).resolve() if not path.is_absolute() else path.resolve()
        require(path.suffix.lower() == ".glb" and path.is_file(), "Expected existing .glb: " + str(path))
        raw = path.read_bytes()
        expected = entry.get("sha256")
        require(expected is None or isinstance(expected, str) and sha(raw) == expected.lower(), "Input SHA mismatch: " + character_id)
        for key in ["status", "label"]:
            require(key not in entry or isinstance(entry[key], str), "Optional labels must be strings")
        records.append({"id": character_id, "path": path, "sha256": sha(raw), "document": parse_glb(raw), "entry": entry})
        source_paths.add(path)
    require(output not in source_paths and receipt_path not in source_paths and output != receipt_path,
            "Outputs must differ from all inputs and each other")
    require(not output.exists() and not receipt_path.exists(), "No output overwrite permitted")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = "CRWT editable candidate review — UNAPPROVED"
    scene["accepted"] = False
    scene["production_ready"] = False
    scene["manifest_sha256"] = sha(manifest_raw)
    roster = bpy.data.collections.new("CHARACTERS — editable candidates")
    scene.collection.children.link(roster)
    all_objects, imported_materials = [], {}
    for record in records:
        previous_objects = set(bpy.data.objects)
        previous_actions = set(bpy.data.actions)
        bpy.ops.import_scene.gltf(filepath=str(record["path"]), merge_vertices=False)
        objects = [obj for obj in bpy.data.objects if obj not in previous_objects]
        require(objects, "GLB import created no objects: " + record["id"])
        meshes = [obj for obj in objects if obj.type == "MESH"]
        record["mesh_baseline"] = {obj.data.name: mesh_fingerprint(obj.data) for obj in meshes}
        record["native_bounds"] = bounds_of(objects)
        record["objects"] = objects
        record["rotation_scale_baseline"] = {obj.name: (list(obj.rotation_euler), list(obj.scale)) for obj in objects}
        collection = bpy.data.collections.new(record["id"])
        roster.children.link(collection)
        collection["source_glb_sha256"] = record["sha256"]
        collection["source_glb_path"] = str(record["path"])
        collection["candidate_status"] = record["entry"].get("status", "UNAPPROVED_REVIEW_CANDIDATE")
        collection["accepted"] = False
        for obj in objects:
            for current in list(obj.users_collection):
                current.objects.unlink(obj)
            collection.objects.link(obj)
        placement = bpy.data.objects.new(record["id"] + " | review placement", None)
        placement.empty_display_type = "PLAIN_AXES"
        placement.empty_display_size = .1
        collection.objects.link(placement)
        placement["review_translation_only"] = True
        roots = [obj for obj in objects if obj.parent not in objects]
        for obj in roots:
            require(obj.parent is None, "Imported root unexpectedly references a different asset")
            obj.parent = placement
            # Placement starts at identity. Preserve transform channels directly,
            # avoiding float roundoff from decomposing an assigned world matrix.
            obj.matrix_parent_inverse.identity()
        armatures = [obj for obj in objects if obj.type == "ARMATURE"]
        record["placement"] = placement
        record["imported_armature_objects"] = len(armatures)
        record["imported_action_count"] = len(set(bpy.data.actions)-previous_actions)
        placement["rig_added_by_workspace_builder"] = False
        placement["source_contains_armature"] = bool(armatures)
        placement["rig_ready_approved"] = False
        for obj in meshes:
            for mat in obj.data.materials:
                if mat and mat not in imported_materials:
                    imported_materials[mat] = material_fingerprint(mat)
        original_doc = bpy.data.texts.new("CRWT | " + record["id"] + " | raw source glTF.json")
        original_doc.write(json.dumps({"id": record["id"], "source_path": str(record["path"]),
                                      "source_sha256": record["sha256"], "document": record["document"]}, indent=2))
        all_objects.extend(objects)
    spacing = args.spacing or max(1.8, max(max(r["native_bounds"]["size"][:2]) for r in records)*1.8+.25)
    rows = math.ceil(len(records)/args.columns)
    for index, record in enumerate(records):
        if args.layout == "grid":
            record["placement"].location.x = (index % args.columns-(min(args.columns, len(records))-1)/2)*spacing
            record["placement"].location.y = (index // args.columns-(rows-1)/2)*spacing
    bpy.context.view_layer.update()
    helpers = bpy.data.collections.new("REVIEW HELPERS — lights and camera")
    scene.collection.children.link(helpers)
    bounds = bounds_of(all_objects)
    center = Vector([(a+b)/2 for a, b in zip(bounds["minimum"], bounds["maximum"])])
    span = max(bounds["size"])
    camera_data = bpy.data.cameras.new("Review overview")
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = max(span*1.3, 2)
    camera = bpy.data.objects.new("Review overview", camera_data)
    helpers.objects.link(camera)
    camera.location = center+Vector((span*.5, -span*1.5, span*.85))
    camera.rotation_euler = (center-camera.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = camera
    for name, delta, energy in [("Review key", (1, -1, 2), 1000), ("Review fill", (-1, 1, 1.5), 700)]:
        light = bpy.data.lights.new(name, "AREA")
        light.energy, light.size = energy, max(span, 2)
        obj = bpy.data.objects.new(name, light)
        helpers.objects.link(obj)
        obj.location = center+Vector(delta)*max(span, 2)
        obj.rotation_euler = (center-obj.location).to_track_quat("-Z", "Y").to_euler()
    scene.world = bpy.data.worlds.new("Review neutral world")
    scene.world.color = (.06, .07, .09)
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x, scene.render.resolution_y = 1600, 1000
    bpy.ops.file.pack_all()
    evidence = []
    for record in records:
        after = {obj.data.name: mesh_fingerprint(obj.data) for obj in record["objects"] if obj.type == "MESH"}
        require(after == record["mesh_baseline"], "Imported mesh/UV/material slot data changed: " + record["id"])
        require(all((list(obj.rotation_euler), list(obj.scale)) == record["rotation_scale_baseline"][obj.name]
                    for obj in record["objects"]), "Imported rotation/scale changed")
        require(sha(record["path"].read_bytes()) == record["sha256"], "Input GLB changed")
        evidence.append({"id": record["id"], "source_path": str(record["path"]), "source_sha256": record["sha256"],
                         "status": record["entry"].get("status", "UNAPPROVED_REVIEW_CANDIDATE"),
                         "accepted": False, "native_imported_bounds": record["native_bounds"],
                         "review_translation": list(record["placement"].location),
                         "imported_objects": len(record["objects"]), "imported_armatures": record["imported_armature_objects"],
                         "imported_actions": record["imported_action_count"], "rig_added": False,
                         "native_imported_mesh_material_slot_uv_fingerprints": after})
    require(all(material_fingerprint(mat) == expected for mat, expected in imported_materials.items()),
            "Imported material node graph changed")
    require(manifest_path.read_bytes() == manifest_raw, "Manifest changed")
    unpacked = [image.name for image in bpy.data.images if image.source == "FILE" and not image.packed_file]
    require(not unpacked, "Unpacked texture images remain: " + str(unpacked))
    report = {"schema": "crwt.editable_roster_review_workspace.v1", "manifest_sha256": sha(manifest_raw),
              "blender_version": bpy.app.version_string, "layout": args.layout, "grid_spacing": spacing,
              "character_count": len(records), "characters": evidence, "accepted": False,
              "production_ready": False, "all_source_files_unchanged": True,
              "imported_material_graphs_unchanged": True, "all_file_images_packed": True,
              "geometry_uv_texture_or_rig_edits_performed": False,
              "limitation": "Blender imports glTF into its native representation; fidelity checks compare immediately imported data to the saved workspace, not byte identity of Blender's representation with GLB. Raw glTF JSON and input hashes are retained for provenance. Grid parents only place models for review. Visual/model approval remains pending."}
    provenance = bpy.data.texts.new("CRWT roster workspace provenance.json")
    provenance.write(json.dumps(report, indent=2))
    bpy.ops.object.select_all(action="DESELECT")
    for obj in all_objects:
        obj.select_set(obj.type == "MESH")
    first_mesh = next(obj for obj in all_objects if obj.type == "MESH")
    bpy.context.view_layer.objects.active = first_mesh
    require(not output.exists() and not receipt_path.exists(), "Output appeared during build; refuse overwrite")
    output.parent.mkdir(parents=True, exist_ok=True)
    receipt_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output), check_existing=False, compress=True)
    require(output.is_file(), "Workspace save did not create output")
    report.update({"output_blend_path": str(output), "output_blend_sha256": sha(output.read_bytes())})
    with receipt_path.open("x", encoding="utf-8") as handle:
        handle.write(json.dumps(report, indent=2)+"\n")
    print(json.dumps({"out": str(output), "sha256": report["output_blend_sha256"],
                      "characters": len(records), "receipt": str(receipt_path)}, indent=2))


if __name__ == "__main__":
    main()

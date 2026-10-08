"""Package ten actual GLB models and 2D references into a new offline HTML.

Python standard library only. Never edits models, images, manifest or vendors.
  python build_offline_gallery.py --manifest review-manifest.json \
    --output BUKA-REVIEW-MODEL.html

Manifest: a list, or {"models": [...]} / {"characters": [...]} with entries
{id, path?, reference?, note?, sha256?, referenceSha256?, name?}. Paths supplied
in the manifest resolve against its directory. Omitted paths default to this
script's models/{id}.glb and references/{id}.png. Exactly the ten roster IDs are
required. All embedded model bytes are verified after compression; SHA/active
geometry/clip metadata and source hashes are saved in a separate receipt.
"""
import argparse
import base64
import hashlib
import html
import json
from pathlib import Path
import re
import struct
import zlib

ROOT = Path(__file__).resolve().parent
IDS = ["alexia", "rindi", "atlas", "kairo", "luna", "mochi", "nox", "pip", "yuna", "zeno"]
VENDOR_PATHS = {"core": "build/three.core.js", "three": "build/three.module.js",
                "utils": "examples/jsm/utils/BufferGeometryUtils.js", "orbit": "examples/jsm/controls/OrbitControls.js",
                "loader": "examples/jsm/loaders/GLTFLoader.js"}
VENDOR_SHA = {
    "build/three.core.js": "eb077d2417f61d3e6d9264c317cabc4ea35769ed6b0ab533067292a550784c20",
    "build/three.module.js": "c8211c69345d2e9949dc7a8ac969380497aa0600a5a8ac6a459c8cd02dd9cb8a",
    "examples/jsm/utils/BufferGeometryUtils.js": "fda7e946b8e0b5ab39b779206589e7a1079a22eb24efb89d7223e03fdfb1f751",
    "examples/jsm/controls/OrbitControls.js": "b97879c748170baadeb3fb84cea1ffdf4674e283dc06042f34e2acb95a76042c",
    "examples/jsm/loaders/GLTFLoader.js": "67ac5551fdafa6e349bd80c8f8e5e39c136d6b2fb1ad647db9abb21dc86f9e4a",
    "LICENSE": "bfe119ea4fd413f5f7ca3fcd63adb0c4a073ed39daa2fe7d3e6b769e21272601"}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def b64(raw):
    return base64.b64encode(raw).decode("ascii")


def source_path(value, fallback, manifest_directory):
    if value is None:
        return fallback.resolve()
    require(isinstance(value, str) and value, "Source path must be a nonempty string")
    path = Path(value)
    return path.resolve() if path.is_absolute() else (manifest_directory/path).resolve()


def parse_glb(raw):
    require(len(raw) >= 28 and struct.unpack_from("<4sII", raw) == (b"glTF", 2, len(raw)), "Invalid GLB header")
    document, binary, offset = None, None, 12
    while offset < len(raw):
        require(offset+8 <= len(raw), "Truncated chunk header")
        length, kind = struct.unpack_from("<II", raw, offset)
        offset += 8
        chunk = raw[offset:offset+length]
        require(len(chunk) == length, "Truncated chunk data")
        if kind == 0x4E4F534A:
            require(document is None, "Duplicate JSON chunk")
            document = json.loads(chunk.rstrip(b" \0"))
        elif kind == 0x004E4942:
            require(binary is None, "Duplicate BIN chunk")
            binary = chunk
        else:
            raise ValueError("Unexpected GLB chunk")
        offset += length
    require(document is not None and binary is not None, "Missing embedded GLB data")
    require(len(document.get("buffers", [])) == 1 and "uri" not in document["buffers"][0], "External/multiple buffers unsupported")
    for image in document.get("images", []):
        require("bufferView" in image or str(image.get("uri", "")).startswith("data:"), "External texture unsupported")
    unsupported = set(document.get("extensionsRequired", [])) & {"KHR_draco_mesh_compression", "EXT_meshopt_compression", "KHR_texture_basisu"}
    require(not unsupported, "Compressed GLB extension requires an extra decoder: " + str(unsupported))
    return document


def active_geometry(document):
    nodes, meshes, accessors = document.get("nodes", []), document.get("meshes", []), document.get("accessors", [])
    scenes = document.get("scenes", [])
    require(scenes, "GLB has no scene")
    scene_index = document.get("scene", 0)
    require(type(scene_index) is int and 0 <= scene_index < len(scenes), "Invalid default scene")
    faces, positions, visited = 0, set(), set()

    def visit(index, ancestors):
        nonlocal faces
        require(type(index) is int and 0 <= index < len(nodes), "Invalid node index")
        require(index not in ancestors and index not in visited, "Cyclic or multiply-parented scene node")
        visited.add(index)
        node = nodes[index]
        if "mesh" in node:
            for primitive in meshes[node["mesh"]]["primitives"]:
                require(primitive.get("mode", 4) == 4, "Only triangle mesh primitives supported")
                position = primitive["attributes"]["POSITION"]
                require(accessors[position]["type"] == "VEC3", "POSITION must be VEC3")
                count = accessors[primitive.get("indices", position)]["count"]
                require(type(count) is int and count > 0 and count % 3 == 0, "Invalid triangle index count")
                positions.add(position)
                faces += count//3
        for child in node.get("children", []):
            visit(child, ancestors | {index})
    for node in scenes[scene_index].get("nodes", []):
        visit(node, set())
    require(faces > 0, "Default scene has no active triangle geometry")
    return faces, sum(accessors[index]["count"] for index in positions)


def inspect_model(entry, manifest_directory, compress):
    character_id = entry["id"]
    path = source_path(entry.get("path"), ROOT/"models"/(character_id+".glb"), manifest_directory)
    require(path.suffix.lower() == ".glb" and path.is_file(), "Missing model: " + str(path))
    raw = path.read_bytes()
    require(0 < len(raw) <= 200*1024*1024, "Model exceeds portable viewer size limit")
    expected = entry.get("sha256")
    require(expected is None or isinstance(expected, str) and sha(raw) == expected.lower(), "Model SHA mismatch: " + character_id)
    document = parse_glb(raw)
    faces, vertices = active_geometry(document)
    clip_names = [clip.get("name", "animation_"+str(index)) for index, clip in enumerate(document.get("animations", []))]
    name, note = entry.get("name", character_id.capitalize()), entry.get("note", "Kandidat model 3D. Bentuk dan detail masih perlu ditinjau terhadap referensi desain.")
    require(isinstance(name, str) and isinstance(note, str), "Model name/note must be text")
    packed = zlib.compress(raw, 9) if compress else raw
    require((zlib.decompress(packed) if compress else packed) == raw, "Model compression roundtrip failed")
    model = {"id": character_id, "name": name, "note": note, "filename": path.name, "bytes": len(raw),
             "sha256": sha(raw), "faces": faces, "vertices": vertices, "images": len(document.get("images", [])),
             "skins": len(document.get("skins", [])), "animations": len(clip_names), "clipNames": clip_names,
             "encoding": "zlib" if compress else "raw", "base64": b64(packed), "visualApproved": False, "gameIntegrated": False}
    return path, model


def inspect_reference(entry, manifest_directory):
    path = source_path(entry.get("reference"), ROOT/"references"/(entry["id"]+".png"), manifest_directory)
    require(path.is_file(), "Missing reference: " + str(path))
    raw = path.read_bytes()
    require(0 < len(raw) <= 20*1024*1024, "Reference exceeds size limit")
    mime = "image/png" if raw.startswith(b"\x89PNG\r\n\x1a\n") else "image/jpeg" if raw.startswith(b"\xff\xd8\xff") else None
    require(mime, "Reference must be an actual PNG/JPEG: " + str(path))
    expected = entry.get("referenceSha256")
    require(expected is None or isinstance(expected, str) and sha(raw) == expected.lower(), "Reference SHA mismatch")
    return path, {"filename": path.name, "bytes": len(raw), "sha256": sha(raw), "mime": mime, "base64": b64(raw), "is3DModel": False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--vendor", type=Path, default=ROOT/"vendor/three")
    parser.add_argument("--no-compress", action="store_true", help="Larger HTML; no DecompressionStream requirement")
    parser.add_argument("--expected-output-sha256")
    args = parser.parse_args()
    manifest_path, output = args.manifest.resolve(), args.output.resolve()
    receipt_path = output.with_suffix(".viewer-receipt.json")
    require(output.suffix.lower() == ".html", "Output must be a new .html")
    require(not output.exists() and not receipt_path.exists(), "No output overwrite permitted")
    manifest_raw = manifest_path.read_bytes()
    manifest = json.loads(manifest_raw)
    entries = manifest if isinstance(manifest, list) else manifest.get("models", manifest.get("characters")) if isinstance(manifest, dict) else None
    require(isinstance(entries, list) and len(entries) == 10, "Manifest must contain all10characters")
    require(all(isinstance(entry, dict) and entry.get("id") in IDS for entry in entries), "Unknown character entry")
    require({entry["id"] for entry in entries} == set(IDS), "Missing or duplicated roster IDs")
    entries = sorted(entries, key=lambda entry: IDS.index(entry["id"]))
    vendor_directory = args.vendor.resolve()
    raw_vendor, vendor_hashes = {}, {}
    inputs = {manifest_path: sha(manifest_raw)}
    for relative, expected in VENDOR_SHA.items():
        path = (vendor_directory/relative).resolve()
        require(path.is_relative_to(vendor_directory), "Vendor path escaped bundle")
        raw = path.read_bytes()
        require(len(raw) <= 4*1024*1024 and sha(raw) == expected, "Frozen Three.js r180 vendor mismatch: " + relative)
        raw.decode("utf-8")
        raw_vendor[relative], vendor_hashes[relative], inputs[path] = raw, expected, expected
    models, references = [], {}
    for entry in entries:
        path, model = inspect_model(entry, manifest_path.parent, not args.no_compress)
        reference_path, reference = inspect_reference(entry, manifest_path.parent)
        models.append(model); references[entry["id"]] = reference
        inputs[path], inputs[reference_path] = model["sha256"], reference["sha256"]
    template_path, script_path = ROOT/"gallery.html", ROOT/"gallery.js"
    template, script = template_path.read_text(encoding="utf-8"), script_path.read_text(encoding="utf-8")
    inputs[template_path], inputs[script_path] = sha(template_path.read_bytes()), sha(script_path.read_bytes())
    require(output not in inputs and receipt_path not in inputs and output != receipt_path, "Output would overwrite an input")
    for marker in ["<!-- EMBEDDED_PAYLOAD -->", "<!-- VIEWER_APP -->", "<!-- THIRD_PARTY_LICENSE -->"]:
        require(template.count(marker) == 1, "Template marker missing or repeated")
    payload = {"schema": "crwt.offline_character_review.v1", "models": models, "references": references, "defaultLightingProfile": "balanced",
               "vendor": {key: b64(raw_vendor[relative]) for key, relative in VENDOR_PATHS.items()},
               "visualApproved": False, "gameIntegrated": False}
    embedded = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    rendered = template.replace("<!-- EMBEDDED_PAYLOAD -->", '<script id="payload" type="application/json">'+embedded+'</script>')
    rendered = rendered.replace("<!-- VIEWER_APP -->", '<script type="module">\n'+script+'\n</script>')
    license_text = raw_vendor["LICENSE"].decode("utf-8")
    require("-->" not in license_text, "Unsafe license comment terminator")
    rendered = rendered.replace("<!-- THIRD_PARTY_LICENSE -->", "<!-- Three.js r180 MIT license\n"+license_text+"\n-->")
    result = rendered.encode("utf-8")
    if args.expected_output_sha256:
        require(re.fullmatch(r"[0-9a-f]{64}", args.expected_output_sha256), "Expected hash must be lowercase SHA256")
        require(sha(result) == args.expected_output_sha256, "Generated HTML hash differs: " + sha(result))
    require(all(sha(path.read_bytes()) == expected for path, expected in inputs.items()), "Source changed during packaging")
    output.parent.mkdir(parents=True, exist_ok=True)
    receipt = {"schema": "crwt.offline_character_review_receipt.v1", "viewer": output.name,
               "viewer_bytes": len(result), "viewer_sha256": sha(result), "manifest_sha256": sha(manifest_raw),
               "models": [{k: v for k, v in model.items() if k != "base64"} for model in models],
               "references": {key: {k: v for k, v in value.items() if k != "base64"} for key, value in references.items()},
               "vendor_sha256": vendor_hashes, "requires_network": False, "source_files_edited": False,
               "visual_approval": False, "game_integration": False,
               "animation_policy": "Controls expose the actual clip metadata of each loaded GLB; the viewer creates no clips."}
    with output.open("xb") as handle:
        handle.write(result)
    with receipt_path.open("x", encoding="utf-8") as handle:
        handle.write(json.dumps(receipt, ensure_ascii=False, indent=2)+"\n")
    print(json.dumps({"viewer": str(output), "bytes": len(result), "sha256": sha(result), "models": 10, "receipt": str(receipt_path)}))


if __name__ == "__main__":
    main()

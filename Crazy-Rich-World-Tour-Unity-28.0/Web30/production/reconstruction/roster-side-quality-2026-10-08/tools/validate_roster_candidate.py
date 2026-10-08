"""Read-only, standard-library checkpoint validation for the ten CRWT candidates.

Usage: python validate_roster_candidate.py manifest.json --receipt new-receipt.json

Manifest object: {approved:false, gameIntegrated:false, models:[{id,path,sha256,
expected?:{faces,vertices,meshes,skins,clips}, ...}], preservedFiles?:[{path,sha256}]}.
Paths are relative to the manifest directory, or absolute. Approval aliases are
accepted, but every supplied approval/integration flag must be exactly false.
The models array must contain exactly the ten roster IDs; SHA-256 is required.
Preserved files prove only the explicitly supplied bytes against their hashes.

Checks GLB v2/chunk structure, embedded data, accessor layout including sparse
and padded matrices, finite attribute/animation values, triangle index bounds,
default-scene counts, skin references and animation channel shape/timing. It
does not certify visual fidelity, manifoldness, rig quality or game integration.
No source files are modified. A receipt path must be new and distinct from inputs.
"""
import argparse
import base64
import datetime
import hashlib
import json
import math
from pathlib import Path
import re
import struct
import sys
import zlib

IDS = {"alexia", "rindi", "atlas", "kairo", "luna", "mochi", "nox", "pip", "yuna", "zeno"}
COMPONENTS = {5120: ("b", 1), 5121: ("B", 1), 5122: ("h", 2),
              5123: ("H", 2), 5125: ("I", 4), 5126: ("f", 4)}
WIDTHS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT2": 4, "MAT3": 9, "MAT4": 16}
APPROVAL = ("approved", "production_approved", "visualApproved", "visual_approval", "visual_final_approved")
INTEGRATION = ("gameIntegrated", "game_integrated", "game_integration", "game_assets_replaced")


class ValidationError(ValueError):
    pass


def require(condition, message):
    if not condition:
        raise ValidationError(message)


def integer(value, label, minimum=0):
    require(type(value) is int and value >= minimum, label + " must be an integer >= " + str(minimum))
    return value


def index(value, sequence, label):
    integer(value, label)
    require(value < len(sequence), label + " is out of range")
    return value


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def strict_json(raw):
    def bad_constant(value):
        raise ValidationError("Non-finite JSON number: " + value)
    def unique_pairs(pairs):
        result = {}
        for key, value in pairs:
            require(key not in result, "Duplicate JSON member: " + key)
            result[key] = value
        return result
    def finite_float(value):
        result = float(value)
        require(math.isfinite(result), "Non-finite JSON numeric exponent")
        return result
    return json.loads(raw, parse_constant=bad_constant, parse_float=finite_float, object_pairs_hook=unique_pairs)


def flags(value, mandatory=False):
    for group in (APPROVAL, INTEGRATION):
        present = [key for key in group if key in value]
        if mandatory:
            require(present, "Manifest must explicitly declare " + group[0] + ":false")
        for key in present:
            require(value[key] is False, key + " must be exactly false for a candidate checkpoint")


def load_file(entry, base, files):
    require(isinstance(entry, dict), "File entry must be an object")
    require(isinstance(entry.get("path"), str) and entry["path"], "File path is required")
    expected = entry.get("sha256")
    require(isinstance(expected, str) and re.fullmatch("[0-9a-fA-F]{64}", expected), "Required SHA256 must have 64 hex digits")
    path = Path(entry["path"])
    path = (path if path.is_absolute() else base / path).resolve(strict=True)
    require(path.is_file(), "Source is not a file: " + str(path))
    raw = path.read_bytes()
    actual = sha(raw)
    require(actual == expected.lower(), "SHA256 mismatch: " + str(path))
    files[path] = actual
    return path, raw, {"path": entry["path"], "resolved_path": str(path), "sha256": actual, "bytes": len(raw)}


def parse_glb(raw):
    require(len(raw) >= 28, "GLB is truncated before first complete chunk")
    require(struct.unpack_from("<4sII", raw) == (b"glTF", 2, len(raw)), "GLB v2 header/declared length mismatch")
    chunks, offset = [], 12
    while offset < len(raw):
        require(offset + 8 <= len(raw), "Truncated GLB chunk header")
        size, kind = struct.unpack_from("<II", raw, offset)
        offset += 8
        require(size % 4 == 0 and offset + size <= len(raw), "Unaligned or truncated GLB chunk")
        chunks.append((kind, raw[offset:offset + size]))
        offset += size
    require(len(chunks) == 2 and chunks[0][0] == 0x4E4F534A and chunks[1][0] == 0x004E4942,
            "Candidate must have exactly JSON then embedded BIN chunks")
    doc = strict_json(chunks[0][1].rstrip(b" "))
    require(isinstance(doc, dict) and doc.get("asset", {}).get("version") == "2.0", "glTF asset version must be 2.0")
    buffers = doc.get("buffers", [])
    require(len(buffers) == 1 and "uri" not in buffers[0], "Exactly one embedded buffer required; external buffers forbidden")
    length = integer(buffers[0].get("byteLength"), "buffer.byteLength", 1)
    require(length <= len(chunks[1][1]) <= length + 3, "BIN length exceeds declared buffer and permitted padding")
    unsupported = set(doc.get("extensionsRequired", [])) & {"KHR_draco_mesh_compression", "EXT_meshopt_compression", "KHR_texture_basisu"}
    require(not unsupported, "Compressed extension cannot be structurally decoded by this validator: " + str(unsupported))
    return doc, chunks[1][1][:length]


class Accessors:
    def __init__(self, doc, binary):
        self.doc, self.binary = doc, binary
        self.views, self.accessors = doc.get("bufferViews", []), doc.get("accessors", [])
        self.cache = {}
        for number, view in enumerate(self.views):
            require(view.get("buffer", 0) == 0, "bufferView references external/nonexistent buffer")
            start = integer(view.get("byteOffset", 0), "bufferView.byteOffset")
            length = integer(view.get("byteLength"), "bufferView.byteLength", 1)
            require(start % 4 == 0 and start + length <= len(binary), "bufferView alignment/bounds invalid: " + str(number))
            if "byteStride" in view:
                stride = integer(view["byteStride"], "bufferView.byteStride", 4)
                require(stride <= 252 and stride % 4 == 0, "bufferView.byteStride must be 4..252 and aligned")
            require(view.get("target") in (None, 34962, 34963), "Invalid bufferView target")
            require("EXT_meshopt_compression" not in view.get("extensions", {}), "Meshopt bufferView cannot be inspected")

    def block(self, view_id, local_offset, count, component_type, offsets, element_size, use_stride=True):
        view = self.views[index(view_id, self.views, "bufferView index")]
        _, component_size = COMPONENTS[component_type]
        local_offset = integer(local_offset, "accessor/sparse byteOffset")
        start = view.get("byteOffset", 0) + local_offset
        stride = view.get("byteStride", element_size) if use_stride else element_size
        require(use_stride or "byteStride" not in view, "Sparse data must be tightly packed")
        require(start % component_size == 0 and stride >= element_size and stride % component_size == 0,
                "Accessor component alignment/stride invalid")
        if len(offsets) > 4:
            require(start % 4 == 0 and stride % 4 == 0, "Matrix columns require four-byte alignment")
        end = local_offset + (count - 1) * stride + element_size
        require(end <= view["byteLength"] and start + (count - 1) * stride + element_size <= len(self.binary),
                "Accessor exceeds bufferView/BIN bounds")
        fmt = "<" + COMPONENTS[component_type][0]
        return [tuple(struct.unpack_from(fmt, self.binary, start + item * stride + delta)[0]
                      for delta in offsets) for item in range(count)]

    def read(self, accessor_id):
        index(accessor_id, self.accessors, "accessor index")
        if accessor_id in self.cache:
            return self.cache[accessor_id]
        accessor = self.accessors[accessor_id]
        component = accessor.get("componentType")
        require(component in COMPONENTS and accessor.get("type") in WIDTHS, "Unsupported accessor component/type")
        count = integer(accessor.get("count"), "accessor.count", 1)
        kind, size = accessor["type"], COMPONENTS[component][1]
        width = WIDTHS[kind]
        if kind.startswith("MAT"):
            rows = int(kind[-1]); column_stride = ((rows * size + 3) // 4) * 4
            offsets = [column * column_stride + row * size for column in range(rows) for row in range(rows)]
            element_size = rows * column_stride
        else:
            offsets, element_size = list(range(0, width * size, size)), width * size
        require(type(accessor.get("normalized", False)) is bool, "Accessor normalized must be boolean")
        require(not accessor.get("normalized") or component in (5120, 5121, 5122, 5123), "Only byte/short integer accessors may be normalized")
        if "bufferView" in accessor:
            values = self.block(accessor["bufferView"], accessor.get("byteOffset", 0), count, component, offsets, element_size)
        else:
            require(accessor.get("byteOffset", 0) == 0, "Accessor without bufferView cannot have byteOffset")
            values = [(0,) * width for _ in range(count)]
        if "sparse" in accessor:
            sparse = accessor["sparse"]
            sparse_count = integer(sparse.get("count"), "sparse.count", 1)
            require(sparse_count <= count, "Sparse count exceeds accessor")
            si, sv = sparse["indices"], sparse["values"]
            require(si.get("componentType") in (5121, 5123, 5125), "Sparse index component must be unsigned")
            sparse_indices = self.block(si["bufferView"], si.get("byteOffset", 0), sparse_count,
                                        si["componentType"], [0], COMPONENTS[si["componentType"]][1], False)
            sparse_values = self.block(sv["bufferView"], sv.get("byteOffset", 0), sparse_count, component, offsets, element_size, False)
            previous = -1
            for (target,), value in zip(sparse_indices, sparse_values):
                require(previous < target < count, "Sparse indices must increase strictly and remain in range")
                values[target] = value; previous = target
        if component == 5126:
            require(all(math.isfinite(value) for row in values for value in row), "Non-finite float accessor: " + str(accessor_id))
        for key in ("min", "max"):
            if key in accessor:
                require(isinstance(accessor[key], list) and len(accessor[key]) == width
                        and all(type(value) in (int, float) and math.isfinite(value) for value in accessor[key]), "Invalid accessor " + key)
        if "min" in accessor and "max" in accessor:
            require(all(low <= high for low, high in zip(accessor["min"], accessor["max"])), "Accessor min exceeds max")
        self.cache[accessor_id] = values
        return values


def validate_images(doc, binary, accessors):
    images = doc.get("images", [])
    for image in images:
        if "bufferView" in image:
            require("uri" not in image, "Image cannot specify both URI and bufferView")
            view = accessors.views[index(image["bufferView"], accessors.views, "image.bufferView")]
            require("byteStride" not in view, "Image bufferView cannot have stride")
            start = view.get("byteOffset", 0)
            raw = binary[start:start + view["byteLength"]]
            mime = image.get("mimeType")
        else:
            uri = image.get("uri", "")
            require(isinstance(uri, str) and uri.startswith("data:"), "External image URI forbidden")
            match = re.fullmatch(r"data:(image/(?:png|jpeg));base64,([A-Za-z0-9+/=\r\n]+)", uri)
            require(match is not None, "Only embedded PNG/JPEG base64 images supported")
            mime, encoded = match.groups(); raw = base64.b64decode(encoded.replace("\r", "").replace("\n", ""), validate=True)
            require(image.get("mimeType", mime) == mime, "Image MIME mismatch")
        if mime == "image/png":
            require(raw.startswith(b"\x89PNG\r\n\x1a\n"), "PNG signature mismatch")
            offset, seen_header, seen_end = 8, False, False
            while offset < len(raw):
                require(offset + 12 <= len(raw), "Truncated PNG chunk")
                length = struct.unpack_from(">I", raw, offset)[0]; kind = raw[offset + 4:offset + 8]
                require(offset + 12 + length <= len(raw), "PNG chunk exceeds embedded image")
                data = raw[offset + 8:offset + 8 + length]
                crc = struct.unpack_from(">I", raw, offset + 8 + length)[0]
                require(zlib.crc32(kind + data) & 0xFFFFFFFF == crc, "PNG CRC mismatch")
                if not seen_header:
                    require(kind == b"IHDR" and length == 13 and all(struct.unpack_from(">II", data)), "Invalid PNG IHDR")
                    seen_header = True
                offset += 12 + length
                if kind == b"IEND":
                    require(length == 0 and offset == len(raw), "PNG data follows IEND"); seen_end = True; break
            require(seen_header and seen_end, "PNG missing IHDR/IEND")
        elif mime == "image/jpeg":
            # SF3D image bufferViews include up to three alignment spaces after
            # JPEG EOI. Preserve and validate the bytes; do not rewrite them.
            end = raw.rfind(b"\xff\xd9")
            padding = raw[end + 2:] if end >= 0 else raw
            require(raw.startswith(b"\xff\xd8\xff") and end >= 3 and len(padding) <= 3
                    and all(value in (0, 32) for value in padding), "JPEG signature/end/padding mismatch")
        else:
            raise ValidationError("Only PNG/JPEG embedded images supported")
    for texture in doc.get("textures", []):
        index(texture.get("source"), images, "texture.source")
        if "sampler" in texture:
            index(texture["sampler"], doc.get("samplers", []), "texture.sampler")
    for material in doc.get("materials", []):
        def find_textures(value):
            if isinstance(value, dict):
                for key, child in value.items():
                    if key.endswith("Texture") and isinstance(child, dict):
                        index(child.get("index"), doc.get("textures", []), "material texture index")
                    find_textures(child)
            elif isinstance(value, list):
                for child in value: find_textures(child)
        find_textures(material)


def validate_geometry(doc, accessor_data):
    accessors, nodes, meshes = doc.get("accessors", []), doc.get("nodes", []), doc.get("meshes", [])
    mesh_info = []
    for mesh_number, mesh in enumerate(meshes):
        require(isinstance(mesh.get("primitives"), list) and mesh["primitives"], "Mesh has no primitives")
        triangles, positions = 0, set()
        for primitive in mesh["primitives"]:
            require(primitive.get("mode", 4) == 4, "Candidate must use triangle primitives")
            require("KHR_draco_mesh_compression" not in primitive.get("extensions", {}), "Draco primitive unsupported")
            attrs = primitive.get("attributes", {})
            pos_id = index(attrs.get("POSITION"), accessors, "POSITION accessor")
            pos = accessors[pos_id]; count = pos["count"]
            require(pos["type"] == "VEC3" and pos["componentType"] == 5126, "POSITION must be FLOAT VEC3")
            accessor_data.read(pos_id); positions.add(pos_id)
            for semantic, attribute_id in attrs.items():
                attr = accessors[index(attribute_id, accessors, semantic + " accessor")]
                require(attr["count"] == count, "Primitive attribute count mismatch: " + semantic)
                accessor_data.read(attribute_id)
                if semantic == "NORMAL": require(attr["type"] == "VEC3", "NORMAL must be VEC3")
                if semantic.startswith("TEXCOORD_"): require(attr["type"] == "VEC2", "UV must be VEC2")
                if semantic.startswith("JOINTS_"): require(attr["type"] == "VEC4" and attr["componentType"] in (5121, 5123) and not attr.get("normalized"), "Invalid joint accessor")
                if semantic.startswith("WEIGHTS_"): require(attr["type"] == "VEC4", "WEIGHTS must be VEC4")
            for target in primitive.get("targets", []):
                for semantic, target_id in target.items():
                    require(semantic in ("POSITION", "NORMAL", "TANGENT"), "Invalid morph target semantic")
                    target_acc = accessors[index(target_id, accessors, "morph accessor")]
                    require(target_acc["count"] == count and target_acc["type"] == "VEC3", "Morph target shape/count mismatch")
                    accessor_data.read(target_id)
            if "indices" in primitive:
                ind_id = index(primitive["indices"], accessors, "indices accessor")
                ind = accessors[ind_id]
                require(ind["type"] == "SCALAR" and ind["componentType"] in (5121, 5123, 5125) and not ind.get("normalized"), "Indices must be unsigned SCALAR")
                require("byteStride" not in accessor_data.views[ind["bufferView"]] if "bufferView" in ind else True, "Index buffer must be tightly packed")
                values = accessor_data.read(ind_id)
                require(all(value[0] < count for value in values), "Triangle index exceeds POSITION count")
                triangle_items = ind["count"]
            else: triangle_items = count
            require(triangle_items % 3 == 0, "Triangle index/vertex count must be divisible by three")
            triangles += triangle_items // 3
            if "material" in primitive: index(primitive["material"], doc.get("materials", []), "primitive.material")
        mesh_info.append((triangles, positions))
    parented = set()
    for node_number, node in enumerate(nodes):
        require(not ("matrix" in node and any(key in node for key in ("translation", "rotation", "scale"))), "Node matrix and TRS are mutually exclusive")
        for key, width in (("matrix", 16), ("translation", 3), ("rotation", 4), ("scale", 3)):
            if key in node: require(isinstance(node[key], list) and len(node[key]) == width and all(type(v) in (int, float) and math.isfinite(v) for v in node[key]), "Invalid finite node " + key)
        if "mesh" in node: index(node["mesh"], meshes, "node.mesh")
        if "skin" in node: index(node["skin"], doc.get("skins", []), "node.skin")
        for child in node.get("children", []):
            index(child, nodes, "node.child")
            require(child != node_number and child not in parented, "Self or multiply-parented node")
            parented.add(child)
    colors = {}
    def check_cycle(number):
        require(colors.get(number) != 1, "Cyclic node graph")
        if colors.get(number) == 2: return
        colors[number] = 1
        for child in nodes[number].get("children", []): check_cycle(child)
        colors[number] = 2
    for number in range(len(nodes)): check_cycle(number)
    scenes = doc.get("scenes", [])
    selected = index(doc.get("scene", 0), scenes, "default scene")
    for scene in scenes:
        roots = scene.get("nodes", [])
        require(len(roots) == len(set(roots)), "Duplicate scene roots")
        for root in roots: index(root, nodes, "scene root"); require(root not in parented, "Scene root has a parent")
    positions, faces, instances, active_nodes = set(), 0, 0, set()
    def visit(number):
        nonlocal faces, instances
        require(number not in active_nodes, "Node instantiated twice in default scene")
        active_nodes.add(number)
        node = nodes[number]
        if "mesh" in node:
            face_count, pos = mesh_info[node["mesh"]]; faces += face_count; instances += 1; positions.update(pos)
        for child in node.get("children", []): visit(child)
    for root in scenes[selected].get("nodes", []): visit(root)
    require(faces > 0, "Default scene has no triangles")
    return {"faces": faces, "vertices": sum(accessors[value]["count"] for value in positions),
            "meshes": instances, "mesh_definitions": len(meshes), "default_scene": selected,
            "default_scene_nodes": len(active_nodes), "skins": len(doc.get("skins", [])),
            "clips": len(doc.get("animations", [])), "images": len(doc.get("images", [])),
            "normal_present_on_every_primitive": all("NORMAL" in primitive.get("attributes", {}) for mesh in meshes for primitive in mesh["primitives"])}


def validate_skins_animations(doc, data):
    nodes, accessors = doc.get("nodes", []), doc.get("accessors", [])
    for skin in doc.get("skins", []):
        joints = skin.get("joints", [])
        require(joints and len(joints) == len(set(joints)), "Skin joints missing/duplicated")
        for joint in joints: index(joint, nodes, "skin joint")
        if "skeleton" in skin: index(skin["skeleton"], nodes, "skin skeleton")
        if "inverseBindMatrices" in skin:
            acc_id = index(skin["inverseBindMatrices"], accessors, "inverseBindMatrices")
            acc = accessors[acc_id]
            require(acc["type"] == "MAT4" and acc["componentType"] == 5126 and acc["count"] >= len(joints), "Invalid inverse bind matrices")
            data.read(acc_id)
    for node in nodes:
        if "skin" not in node or "mesh" not in node: continue
        joint_count = len(doc["skins"][node["skin"]]["joints"])
        for primitive in doc["meshes"][node["mesh"]]["primitives"]:
            for semantic, acc_id in primitive["attributes"].items():
                if semantic.startswith("JOINTS_"): require(all(value < joint_count for row in data.read(acc_id) for value in row), "Vertex joint index exceeds bound skin")
    for animation in doc.get("animations", []):
        samplers = animation.get("samplers", [])
        for sampler in samplers:
            input_id, output_id = index(sampler.get("input"), accessors, "animation input"), index(sampler.get("output"), accessors, "animation output")
            inp = accessors[input_id]
            require(inp["type"] == "SCALAR" and inp["componentType"] == 5126, "Animation times must be FLOAT SCALAR")
            times = [row[0] for row in data.read(input_id)]
            require(times[0] >= 0 and all(first < second for first, second in zip(times, times[1:])), "Animation times must increase strictly and be nonnegative")
            require(sampler.get("interpolation", "LINEAR") in ("LINEAR", "STEP", "CUBICSPLINE"), "Unsupported animation interpolation")
            data.read(output_id)
        seen = set()
        for channel in animation.get("channels", []):
            sampler = samplers[index(channel.get("sampler"), samplers, "animation channel sampler")]
            target = channel.get("target", {}); node_id = index(target.get("node"), nodes, "animation target node")
            path = target.get("path")
            require(path in ("translation", "rotation", "scale", "weights"), "Unsupported animation target path")
            require((node_id, path) not in seen, "Duplicate animation target channel"); seen.add((node_id, path))
            inp, out = accessors[sampler["input"]], accessors[sampler["output"]]
            factor = 3 if sampler.get("interpolation") == "CUBICSPLINE" else 1
            if path == "weights":
                require("mesh" in nodes[node_id], "Morph animation target has no mesh")
                primitives = doc["meshes"][nodes[node_id]["mesh"]]["primitives"]
                targets = len(primitives[0].get("targets", []))
                require(targets > 0 and all(len(p.get("targets", [])) == targets for p in primitives), "Morph target counts disagree")
                kind, expected_count = "SCALAR", inp["count"] * factor * targets
            else: kind, expected_count = ("VEC4" if path == "rotation" else "VEC3"), inp["count"] * factor
            require(out["type"] == kind and out["componentType"] == 5126 and out["count"] == expected_count, "Animation output type/count mismatch")


def validate_model(raw):
    doc, binary = parse_glb(raw)
    data = Accessors(doc, binary)
    for number in range(len(data.accessors)): data.read(number)
    validate_images(doc, binary, data)
    result = validate_geometry(doc, data)
    validate_skins_animations(doc, data)
    result["clip_names"] = [clip.get("name", "animation_" + str(number)) for number, clip in enumerate(doc.get("animations", []))]
    result["bin_sha256"] = sha(binary)
    result["accessors_checked"] = len(data.accessors)
    result["buffer_views_checked"] = len(data.views)
    return result


def validate_manifest(manifest_path, receipt_path=None):
    manifest_path = Path(manifest_path).resolve(strict=True)
    raw = manifest_path.read_bytes(); manifest = strict_json(raw)
    require(isinstance(manifest, dict), "Manifest must be an object with header and models")
    flags(manifest, True)
    entries = manifest.get("models")
    require(isinstance(entries, list) and len(entries) == 10, "Exactly ten model entries required")
    require(all(isinstance(entry, dict) and entry.get("id") in IDS for entry in entries), "Unknown or invalid roster ID")
    require({entry["id"] for entry in entries} == IDS, "Missing/duplicate roster ID")
    files, records = {manifest_path: sha(raw)}, []
    for entry in entries:
        flags(entry)
        path, model_raw, fingerprint = load_file(entry, manifest_path.parent, files)
        require(path.suffix.lower() == ".glb", "Candidate model path must be GLB")
        try: actual = validate_model(model_raw)
        except (ValidationError, KeyError, IndexError, TypeError, struct.error, RecursionError) as error:
            raise ValidationError(entry["id"] + ": " + str(error)) from error
        expected = dict(entry.get("expected", {}))
        for key in ("faces", "vertices", "meshes", "skins", "clips", "images", "clip_names"):
            if key in entry: expected.setdefault(key, entry[key])
        if "animations" in entry: expected.setdefault("clips", entry["animations"])
        for key, value in expected.items():
            require(key in actual, "Unknown expected count field: " + key)
            if key == "clip_names":
                require(isinstance(value, list) and all(isinstance(name, str) for name in value), "Expected clip_names must be a string array")
            else:
                integer(value, "Expected " + key)
            require(value == actual[key], entry["id"] + " expected " + key + " mismatch")
        records.append({"id": entry["id"], **fingerprint, "actual": actual, "approved": False, "gameIntegrated": False})
    preserved = manifest.get("preservedFiles", manifest.get("preserved_files", []))
    require(isinstance(preserved, list), "preservedFiles must be an array")
    preservation = []
    for entry in preserved:
        _, _, fingerprint = load_file(entry, manifest_path.parent, files)
        preservation.append(fingerprint)
    if receipt_path is not None:
        receipt_path = Path(receipt_path).resolve()
        require(receipt_path not in files and not receipt_path.exists(), "Receipt must be new and cannot overwrite an input")
    require(all(sha(path.read_bytes()) == expected for path, expected in files.items()), "Input changed during validation")
    return {"schema": "crwt.roster_candidate_validation.v1", "valid": True,
            "validated_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "manifest_sha256": sha(raw), "models_checked": 10, "models": records,
            "preserved_files_checked": preservation, "source_files_modified": False,
            "approved": False, "gameIntegrated": False,
            "limits": ["Structural and byte integrity only; no visual-fidelity approval.",
                       "No manifoldness, self-intersection, deformation or gameplay quality certificate.",
                       "Vertices count unique active POSITION accessors; faces and meshes count default-scene instances.",
                       "Preservation coverage is only files explicitly listed with their expected hashes."]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--receipt", type=Path, help="New JSON receipt path; stdout always receives JSON")
    args = parser.parse_args()
    try:
        receipt = validate_manifest(args.manifest, args.receipt)
        if args.receipt:
            args.receipt.parent.mkdir(parents=True, exist_ok=True)
            with args.receipt.open("x", encoding="utf-8") as handle:
                handle.write(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n")
        print(json.dumps(receipt, ensure_ascii=False))
    except (ValueError, OSError, KeyError, TypeError, IndexError, struct.error) as error:
        print(json.dumps({"schema": "crwt.roster_candidate_validation.v1", "valid": False,
                          "error": str(error), "source_files_modified": False}, ensure_ascii=False))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

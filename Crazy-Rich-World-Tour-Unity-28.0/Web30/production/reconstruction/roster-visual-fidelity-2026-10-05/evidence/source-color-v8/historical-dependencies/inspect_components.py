"""Read-only connected-component inspection of the pinned actual Mochi GLB."""
import argparse
import hashlib
import json
import struct
from pathlib import Path

SOURCE_SHA = "19cc6a8c6a8ff08518ab3bc2f29de1a5f77056daa00bf400400837285e2b372b"


def read_glb(path):
    raw = path.read_bytes()
    if struct.unpack_from("<III", raw) != (0x46546C67, 2, len(raw)):
        raise ValueError("Invalid GLB header")
    offset, doc, binary = 12, None, None
    while offset < len(raw):
        length, kind = struct.unpack_from("<II", raw, offset)
        chunk = raw[offset + 8:offset + 8 + length]
        if kind == 0x4E4F534A:
            doc = json.loads(chunk)
        elif kind == 0x004E4942:
            binary = chunk
        else:
            raise ValueError("Unexpected GLB chunk")
        offset += 8 + length
    return raw, doc, binary


def accessor(doc, binary, number):
    entry = doc["accessors"][number]
    view = doc["bufferViews"][entry["bufferView"]]
    if "sparse" in entry or view.get("buffer", 0) != 0:
        raise ValueError("Unsupported accessor")
    kinds = {5126: "f", 5125: "I", 5123: "H", 5121: "B"}
    width = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[entry["type"]]
    code = "<" + kinds[entry["componentType"]] * width
    size = struct.calcsize(code)
    stride = view.get("byteStride", size)
    start = view.get("byteOffset", 0) + entry.get("byteOffset", 0)
    return [struct.unpack_from(code, binary, start + i * stride) for i in range(entry["count"])]


def world_blender(point):
    # Pin the actual orientation-only root quaternion [0,1,0,0]. This rotation
    # and glTF Y-up→Blender Z-up conversion have determinant +1, without mirror.
    return (-point[0], point[2], point[1])


def inspect(doc, binary):
    if doc["nodes"][2].get("rotation") != [0, 1, 0, 0] or len(doc["meshes"]) != 1:
        raise ValueError("Pinned orientation/mesh contract mismatch")
    prim = doc["meshes"][0]["primitives"][0]
    if len(doc["meshes"][0]["primitives"]) != 1 or prim.get("mode", 4) != 4:
        raise ValueError("Expected single triangle primitive")
    positions = accessor(doc, binary, prim["attributes"]["POSITION"])
    indices = [r[0] for r in accessor(doc, binary, prim["indices"])]
    faces = [indices[i:i + 3] for i in range(0, len(indices), 3)]
    parents = list(range(len(positions)))
    def find(v):
        while parents[v] != v:
            parents[v] = parents[parents[v]]
            v = parents[v]
        return v
    def union(a, b):
        a, b = find(a), find(b)
        if a != b:
            parents[b] = a
    # UV seams can duplicate identical positions; join only for inspection.
    welded = {}
    for i, point in enumerate(positions):
        key = tuple(round(v, 6) for v in point)
        if key in welded:
            union(i, welded[key])
        else:
            welded[key] = i
    for a, b, c in faces:
        union(a, b)
        union(a, c)
    groups = {}
    for fi, face in enumerate(faces):
        groups.setdefault(find(face[0]), []).append(fi)
    components = []
    for face_ids in sorted(groups.values(), key=len, reverse=True):
        ids = sorted({i for fi in face_ids for i in faces[fi]})
        points = [world_blender(positions[i]) for i in ids]
        components.append({"component": len(components), "faces": len(face_ids), "vertices": len(ids),
            "centroid_blender_z_up": [sum(p[j] for p in points) / len(points) for j in range(3)],
            "bounds_blender_z_up": [[min(p[j] for p in points) for j in range(3)], [max(p[j] for p in points) for j in range(3)]],
            "face_ids": face_ids, "vertex_ids": ids})
    return positions, faces, components


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--source", type=Path, required=True)
    ap.add_argument("--output", type=Path, required=True)
    config = ap.parse_args()
    source = config.source.resolve(strict=True)
    output = config.output.resolve()
    raw, doc, binary = read_glb(source)
    if hashlib.sha256(raw).hexdigest() != SOURCE_SHA:
        raise SystemExit("Pinned source identity mismatch")
    if output == source or output.exists():
        raise SystemExit("Output must be a fresh inspection file")
    positions, faces, components = inspect(doc, binary)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps({"source_sha256": SOURCE_SHA, "source_vertices": len(positions), "source_triangles": len(faces),
        "inspection_only_position_weld": "round each coordinate to 1e-6; original mesh untouched",
        "components": components}, indent=2) + "\n", encoding="utf-8")
    print(json.dumps([{k: v for k, v in c.items() if k not in ("face_ids", "vertex_ids")} for c in components], indent=2))


if __name__ == "__main__":
    main()

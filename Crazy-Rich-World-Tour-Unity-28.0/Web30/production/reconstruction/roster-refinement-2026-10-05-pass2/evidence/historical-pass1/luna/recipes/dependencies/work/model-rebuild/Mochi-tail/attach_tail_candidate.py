"""Attach the actual detached Mochi cream tuft with one inferred hidden connector.

All original positions, normals, UVs and embedded image bytes remain. Only two
hidden source vertex fans are opened; the original tuft is retained, not replaced.
"""
import argparse
import copy
import hashlib
import json
import math
import struct
from collections import Counter
from pathlib import Path

from inspect_components import SOURCE_SHA, accessor, inspect, read_glb, world_blender

ANCHOR_BODY = 3496
ANCHOR_TIP = 4339
EXPECTED_FANS = {
    "body": [3171, 3175, 3176, 15234, 15240, 15241],
    "tip": [3966, 3967, 3968, 15927, 15928, 15929],
}


def add(a, b): return tuple(x + y for x, y in zip(a, b))
def sub(a, b): return tuple(x - y for x, y in zip(a, b))
def mul(a, s): return tuple(x * s for x in a)
def dot(a, b): return sum(x * y for x, y in zip(a, b))
def cross(a, b): return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])
def norm(a):
    length = math.sqrt(dot(a, a))
    if length < 1e-10: raise ValueError("Degenerate vector")
    return mul(a, 1 / length)
def local_gltf(p): return (-p[0], p[2], p[1])
def key(p): return tuple(round(x, 6) for x in p)


def fan_loop(positions, faces, anchor):
    keys = [key(p) for p in positions]
    representatives = {}
    for i, k in enumerate(keys): representatives.setdefault(k, i)
    fan = [fi for fi, face in enumerate(faces) if keys[anchor] in [keys[i] for i in face]]
    counts, directed = Counter(), {}
    for fi in fan:
        tri = [representatives[keys[i]] for i in faces[fi]]
        for a, b in zip(tri, tri[1:] + tri[:1]):
            edge = tuple(sorted((a, b)))
            counts[edge] += 1
            directed[edge] = (a, b)
    edges = [directed[e] for e, count in counts.items() if count == 1]
    next_vertex = dict(edges)
    if len(next_vertex) != len(edges): raise ValueError("Non-simple hidden patch")
    start = min(next_vertex)
    loop, current = [start], next_vertex[start]
    while current != start:
        if current in loop or current not in next_vertex: raise ValueError("Broken hidden-patch boundary")
        loop.append(current)
        current = next_vertex[current]
    if len(loop) != len(edges): raise ValueError("Disconnected hidden-patch boundary")
    return fan, loop


def frame(tangent):
    tangent = norm(tangent)
    u = norm(cross((0, 0, 1), tangent))
    v = cross(tangent, u)
    return u, v


def stitch(a, b):
    # Rings have matching forward winding; variable-size endpoint boundaries
    # are joined by angle progress, sharing actual source boundary vertices.
    n, m, i, j, result = len(a), len(b), 0, 0, []
    while i < n or j < m:
        ta, tb = (i + 1) / n if i < n else 2, (j + 1) / m if j < m else 2
        ai, bj = a[i % n], b[j % m]
        if abs(ta - tb) < 1e-9:
            an, bn = a[(i + 1) % n], b[(j + 1) % m]
            result += [(ai, an, bn), (ai, bn, bj)]
            i += 1; j += 1
        elif ta < tb:
            result.append((ai, a[(i + 1) % n], bj)); i += 1
        else:
            result.append((ai, b[(j + 1) % m], bj)); j += 1
    return result


def append_accessor(doc, binary, values, kind, component_type, target):
    while len(binary) % 4: binary.extend(b"\0")
    offset = len(binary)
    width = {"SCALAR": 1, "VEC2": 2, "VEC3": 3}[kind]
    code = "<" + ("I" if component_type == 5125 else "f") * width
    for value in values: binary.extend(struct.pack(code, *value))
    view = len(doc["bufferViews"])
    doc["bufferViews"].append({"buffer": 0, "byteOffset": offset, "byteLength": len(binary) - offset, "target": target})
    index = len(doc["accessors"])
    doc["accessors"].append({"bufferView": view, "componentType": component_type, "count": len(values), "type": kind,
        "min": [min(v[j] for v in values) for j in range(width)], "max": [max(v[j] for v in values) for j in range(width)]})
    return index


def write_glb(path, doc, binary):
    doc["buffers"][0]["byteLength"] = len(binary)
    encoded = json.dumps(doc, separators=(",", ":"), ensure_ascii=False).encode()
    encoded += b" " * (-len(encoded) % 4)
    binary += b"\0" * (-len(binary) % 4)
    size = 12 + 8 + len(encoded) + 8 + len(binary)
    path.write_bytes(struct.pack("<III", 0x46546C67, 2, size) + struct.pack("<II", len(encoded), 0x4E4F534A)
        + encoded + struct.pack("<II", len(binary), 0x004E4942) + binary)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--source", type=Path, required=True)
    ap.add_argument("--output-dir", type=Path, required=True)
    ap.add_argument("--expected-output-sha256")
    ap.add_argument("--confirm-hidden-tail-connector-review", action="store_true")
    config = ap.parse_args()
    source = config.source.resolve(strict=True)
    output = config.output_dir.resolve()
    if not config.confirm_hidden_tail_connector_review:
        ap.error("Use --confirm-hidden-tail-connector-review; hidden shape is inferred and unapproved.")
    if source.is_relative_to(output) or output == source.parent or (output.exists() and any(output.iterdir())):
        ap.error("Output must be a fresh isolated directory that does not contain source.")
    raw, doc, binary = read_glb(source)
    if hashlib.sha256(raw).hexdigest() != SOURCE_SHA: ap.error("Pinned source identity mismatch.")
    old_doc, old_binary = copy.deepcopy(doc), bytes(binary)
    positions, source_faces, components = inspect(doc, binary)
    if [(c["faces"], c["vertices"]) for c in components] != [(22604, 14431), (440, 363)]:
        raise ValueError("Pinned actual component selection mismatch")
    primitive = doc["meshes"][0]["primitives"][0]
    normals = accessor(doc, binary, primitive["attributes"]["NORMAL"])
    uvs = accessor(doc, binary, primitive["attributes"]["TEXCOORD_0"])
    old_positions, old_normals, old_uvs = positions[:], normals[:], uvs[:]
    body_fan, body_loop = fan_loop(positions, source_faces, ANCHOR_BODY)
    tip_fan, tip_loop = fan_loop(positions, source_faces, ANCHOR_TIP)
    if body_fan != EXPECTED_FANS["body"] or tip_fan != EXPECTED_FANS["tip"]:
        raise ValueError("Frozen source face selection mismatch")
    body, tip = world_blender(positions[ANCHOR_BODY]), world_blender(positions[ANCHOR_TIP])
    body_normal, tip_normal = norm(world_blender(normals[ANCHOR_BODY])), norm(world_blender(normals[ANCHOR_TIP]))
    controls = [body, add(body, mul(body_normal, .06)), add(tip, mul(tip_normal, .046)), tip]
    def curve(t):
        a, b, c, d = controls
        return add(add(mul(a, (1-t)**3), mul(b, 3*(1-t)**2*t)), add(mul(c, 3*(1-t)*t*t), mul(d, t**3)))
    def tangent(t):
        a, b, c, d = controls
        return add(add(mul(sub(b, a), 3*(1-t)**2), mul(sub(c, b), 6*(1-t)*t)), mul(sub(d, c), 3*t*t))
    u0, v0 = frame(tangent(0))
    radial = sub(world_blender(positions[body_loop[0]]), body)
    phase = math.atan2(dot(radial, v0), dot(radial, u0))
    # Tip surface faces back into the connector, so reverse its patch order.
    tip_loop = list(reversed(tip_loop))
    ue, ve = frame(tangent(1))
    end_direction = add(mul(ue, math.cos(phase)), mul(ve, math.sin(phase)))
    start = max(range(len(tip_loop)), key=lambda i: dot(norm(sub(world_blender(positions[tip_loop[i]]), tip)), end_direction))
    tip_loop = tip_loop[start:] + tip_loop[:start]
    rings = [body_loop]
    ring_centers = []
    ring_count, sides = 10, 12
    for j in range(1, ring_count):
        t = j / ring_count
        center = curve(t)
        u, v = frame(tangent(t))
        # Organic taper grows from the actual tiny hidden port, then narrows into
        # the original tuft; this creates no extra fluffy endpoint or new tail.
        radius = .008 + .014 * math.sin(math.pi * t) ** .8
        ring, ring_centers = [], ring_centers + [center]
        for i in range(sides):
            angle = phase + i * math.tau / sides
            radial = add(mul(u, math.cos(angle)), mul(v, math.sin(angle)))
            ring.append(len(positions))
            positions.append(local_gltf(add(center, mul(radial, radius))))
            normals.append(local_gltf(radial))
            # Reuse an existing posterior-hip orange atlas texel. No image is
            # generated, edited, blended or re-encoded; original UVs remain.
            uvs.append(old_uvs[ANCHOR_BODY])
        rings.append(ring)
    rings.append(tip_loop)
    connector_faces = [face for a, b in zip(rings, rings[1:]) for face in stitch(a, b)]
    removed = sorted(body_fan + tip_fan)
    retained = [fi for fi in range(len(source_faces)) if fi not in set(removed)]
    faces = [tuple(source_faces[fi]) for fi in retained] + connector_faces
    binary = bytearray(binary)
    primitive["attributes"] = {"POSITION": append_accessor(doc, binary, positions, "VEC3", 5126, 34962),
        "NORMAL": append_accessor(doc, binary, normals, "VEC3", 5126, 34962),
        "TEXCOORD_0": append_accessor(doc, binary, uvs, "VEC2", 5126, 34962)}
    primitive["indices"] = append_accessor(doc, binary, [(i,) for face in faces for i in face], "SCALAR", 5125, 34963)
    doc.setdefault("extras", {})["crwt_tail_review"] = {"candidate_not_approved": True, "source_sha256": SOURCE_SHA,
        "existing_cream_tip_preserved": True, "hidden_connector_inferred": True, "no_mirror": True}
    output.mkdir(parents=True, exist_ok=True)
    glb = output / "mochi-tail-attached-candidate.glb"
    write_glb(glb, doc, binary)
    final_raw, final_doc, final_binary = read_glb(glb)
    final_positions, final_faces, final_components = inspect(final_doc, final_binary)
    final_prim = final_doc["meshes"][0]["primitives"][0]
    final_normals = accessor(final_doc, final_binary, final_prim["attributes"]["NORMAL"])
    final_uvs = accessor(final_doc, final_binary, final_prim["attributes"]["TEXCOORD_0"])
    if final_positions[:len(old_positions)] != old_positions or final_normals[:len(old_normals)] != old_normals or final_uvs[:len(old_uvs)] != old_uvs:
        raise ValueError("Original vertex attributes changed")
    if final_binary[:len(old_binary)] != old_binary or any(final_doc[k] != old_doc[k] for k in ("nodes", "scenes", "materials", "images", "textures")):
        raise ValueError("Original transform/material/image identity changed")
    if final_faces[:len(retained)] != [source_faces[fi] for fi in retained] or len(final_components) != 1:
        raise ValueError("Retained source topology or connected attachment failed")
    welded = {}; mapped = [welded.setdefault(key(p), len(welded)) for p in final_positions]
    edge_counts = Counter(tuple(sorted((mapped[face[j]], mapped[face[(j+1)%3]]))) for face in final_faces for j in range(3))
    if any(count != 2 for count in edge_counts.values()): raise ValueError("Attachment is not a closed welded manifold")
    winding = Counter()
    for face in final_faces:
        for j in range(3):
            a, b = mapped[face[j]], mapped[face[(j+1)%3]]
            winding[(min(a, b), max(a, b))] += 1 if a < b else -1
    if any(winding.values()): raise ValueError("Attachment surface winding is inconsistent")
    result_sha = hashlib.sha256(final_raw).hexdigest()
    if config.expected_output_sha256 and result_sha != config.expected_output_sha256:
        raise ValueError("Expected output SHA mismatch")
    proof = {"schema": "crwt.mochi-tail-attachment.v1", "status": "hidden_connector_visual_candidate", "visual_final_approved": False,
        "game_assets_replaced": False, "source": {"path": str(source), "sha256": SOURCE_SHA, "bytes": len(raw)},
        "output": {"path": glb.name, "sha256": result_sha, "bytes": len(final_raw)},
        "selection": {"original_component_faces": [22604, 440], "retained_original_cream_tip_faces": 434,
            "anchor_vertices": {"posterior_hip": ANCHOR_BODY, "inner_rear_tip": ANCHOR_TIP}, "removed_hidden_source_face_ids": removed},
        "geometry": {"source_vertices": len(old_positions), "added_vertices": len(positions)-len(old_positions),
            "source_triangles": len(source_faces), "removed_hidden_triangles": len(removed), "connector_triangles": len(connector_faces),
            "final_triangles": len(final_faces), "connected_components_before": 2, "connected_components_after": 1,
            "all_welded_edges_two_faces": True, "surface_winding_consistent": True,
            "original_position_normal_uv_arrays_preserved": True, "retained_source_face_order_and_indices_preserved": True,
            "controls_blender_z_up": controls, "ring_centers_blender_z_up": ring_centers},
        "preservation": {"original_bin_chunk_is_exact_prefix": True, "embedded_images_unchanged": True,
            "materials_unchanged": True, "node_transforms_unchanged": True, "input_sha256_unchanged": hashlib.sha256(source.read_bytes()).hexdigest() == SOURCE_SHA},
        "texture_policy": "Connector reuses actual existing posterior-hip orange UV texel; no new texture or generated detail.",
        "limits": ["Hidden curve between body and existing tip is inferred from one front image; anatomy is unapproved.",
            "No extra fluffy tip or second disconnected tail was added; original visible body and tip positions remain.",
            "The small missing connection gap may change front pixels; pixel-identical silhouette is not claimed.",
            "Source glossy/normal material settings retained; root may apply separately reviewed material refinement.",
            "Six original center vertices may become unused when their hidden fans are opened; original attribute arrays are preserved.",
            "No rig, animation, game integration or final visual approval is claimed."]}
    (output / "mochi-tail-attachment.proof.json").write_text(json.dumps(proof, indent=2) + "\n", encoding="utf-8")
    (output / "frozen-face-selection.json").write_text(json.dumps({"source_sha256": SOURCE_SHA,
        "original_tip_component_face_ids": components[1]["face_ids"], "removed_hidden_source_face_ids": removed,
        "retained_source_face_ids": retained}, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(glb), "sha256": result_sha, "triangles": len(final_faces), "connected_components": 1}))


if __name__ == "__main__":
    main()

"""Build an OPTIMIZED separate Yuna palette CANDIDATE as glTF 2.0 / GLB.

Preserves the original candidate and rebuilds the same design at lower sampling.
Target: <= 2500 triangles. Original candidate is never overwritten.

Uses Python's standard library only. No downloads, paid API, installation,
body generation, rigging, or game update. Geometry is a manually approximated
rigid prop guided by the observed approved master, not an exact reconstruction.

Run from workspace:
  bundled-python outputs/props/build_yuna_palette_optimized_candidate.py
Optional:
  --source PATH_TO_MASTER_PNG --out OUTPUT_DIRECTORY

Front is +Z, Y is up. Units are arbitrary design units; world-scale not approved.
The thumb hole is genuinely open through the palette body.
"""
from __future__ import annotations

import argparse
from collections import Counter
import datetime as dt
import hashlib
import json
import math
from pathlib import Path
import struct

SOURCE_SHA256 = "d3559fe6948cc5a1befffba7f779d46138517394dcb53f2deb0ce0be113c719e"
SOURCE_REPOSITORY_PATH = (
    "Crazy-Rich-World-Tour-Unity-28.0/Web30/production/references/"
    "chibi_travel_adventurers_collectible_lineup.png"
)
SOURCE_COMMIT = "fbdb1e36ecb9ee3fc07aaed9072441285ba683b9"
N = 64
PAINT_RINGS = 5
PAINT_SIDES = 16
THICKNESS = 0.042
HOLE_CENTER = (0.205, 0.165)
HOLE_RADII = (0.075, 0.031)
HOLE_ROTATION = 0.32

# Approximate canonical contour of the visible asymmetrical cream palette.
# These are hand-chosen design coordinates, NOT an extracted segmentation.
OUTLINE_CONTROL = [
    (0.075, 0.540), (0.240, 0.475), (0.335, 0.330),
    (0.355, 0.130), (0.330, -0.080), (0.225, -0.325),
    (0.065, -0.495), (-0.130, -0.480), (-0.285, -0.335),
    (-0.345, -0.125), (-0.310, 0.090), (-0.225, 0.300),
    (-0.075, 0.485),
]
# Approximate main color families/placement visible on Yuna's palette.
# Exact blob count, centers, outlines and depth are not verified.
PAINT_PATCHES = [
    ("pink_upper", (0.038, 0.429), (0.060, 0.040), -0.35, "#F06F9B"),
    ("coral_upper", (0.177, 0.400), (0.043, 0.040), 0.45, "#EE7766"),
    ("cobalt_left_upper", (-0.164, 0.212), (0.068, 0.090), -0.25, "#238AB8"),
    ("mint_upper_middle", (0.040, 0.198), (0.054, 0.078), -0.45, "#74CDBB"),
    ("orange_left_middle", (-0.235, -0.016), (0.035, 0.047), -0.2, "#F5A77D"),
    ("sky_middle", (-0.026, -0.097), (0.049, 0.040), 0.3, "#58C0DD"),
    ("violet_lower_left", (-0.241, -0.248), (0.037, 0.054), -0.3, "#AA78C4"),
    ("rose_lower", (-0.106, -0.366), (0.064, 0.079), -0.35, "#ED6084"),
    ("yellow_lower", (0.094, -0.348), (0.055, 0.060), 0.4, "#F8C04F"),
    ("brown_right_middle", (0.220, -0.190), (0.034, 0.038), 0.4, "#966D4B"),
]

def cross2(a, b):
    return a[0] * b[1] - a[1] * b[0]

def catmull_rom(points, samples_per_segment=18):
    result = []
    count = len(points)
    for k in range(count):
        p0, p1, p2, p3 = (points[(k + j) % count] for j in (-1, 0, 1, 2))
        for n in range(samples_per_segment):
            t = n / samples_per_segment
            result.append(tuple(0.5 * (
                2 * p1[d] + (-p0[d] + p2[d]) * t
                + (2*p0[d] - 5*p1[d] + 4*p2[d] - p3[d]) * t*t
                + (-p0[d] + 3*p1[d] - 3*p2[d] + p3[d]) * t*t*t
            ) for d in range(2)))
    return result

OUTLINE = catmull_rom(OUTLINE_CONTROL)

def outer_radius(theta):
    direction = (math.cos(theta), math.sin(theta))
    candidates = []
    for i, a in enumerate(OUTLINE):
        b = OUTLINE[(i + 1) % len(OUTLINE)]
        edge = (b[0] - a[0], b[1] - a[1])
        relative = (a[0] - HOLE_CENTER[0], a[1] - HOLE_CENTER[1])
        denom = cross2(direction, edge)
        if abs(denom) < 1e-10:
            continue
        t = cross2(relative, edge) / denom
        u = cross2(relative, direction) / denom
        if t > 0 and -1e-7 <= u <= 1 + 1e-7:
            candidates.append(t)
    if not candidates:
        raise ValueError("Contour does not intersect sampled thumb-hole ray")
    return min(candidates)

def inner_radius(theta):
    theta -= HOLE_ROTATION
    return 1 / math.sqrt(
        (math.cos(theta) / HOLE_RADII[0])**2
        + (math.sin(theta) / HOLE_RADII[1])**2
    )

def normals(vertices, faces):
    sums = [[0.0, 0.0, 0.0] for _ in vertices]
    for a, b, c in faces:
        u = [vertices[b][i] - vertices[a][i] for i in range(3)]
        v = [vertices[c][i] - vertices[a][i] for i in range(3)]
        n = (u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0])
        for index in (a, b, c):
            for axis in range(3):
                sums[index][axis] += n[axis]
    return [
        tuple(value / max(1e-12, math.sqrt(sum(v*v for v in item))) for value in item)
        for item in sums
    ]

def build_body():
    vertices = []
    # Each layer: z, outer inset, inner opening expansion.
    layers = [
        (THICKNESS/2, 0.008, 0.004),
        (THICKNESS/2 - 0.008, 0.0, 0.0),
        (-THICKNESS/2 + 0.008, 0.0, 0.0),
        (-THICKNESS/2, 0.008, 0.004),
    ]
    for z, inset, opening in layers:
        for inner in (False, True):
            for i in range(N):
                theta = math.tau * i / N
                r = inner_radius(theta) + opening if inner else outer_radius(theta) - inset
                if r <= 0:
                    raise ValueError("Invalid boundary radius")
                vertices.append((
                    HOLE_CENTER[0] + r * math.cos(theta),
                    HOLE_CENTER[1] + r * math.sin(theta),
                    z,
                ))
    faces = []
    material_indices = []
    def add(a, b, c, material):
        faces.append((a, b, c))
        material_indices.append(material)
    for i in range(N):
        j = (i + 1) % N
        # Front annulus.
        add(i, j, N+j, 0)
        add(i, N+j, N+i, 0)
        # Back annulus with opposite winding.
        a, b, c, d = 6*N+i, 6*N+j, 7*N+j, 7*N+i
        add(a, c, b, 0)
        add(a, d, c, 0)
        # Outer side and bevels.
        for layer in range(3):
            a, b = layer*2*N+i, (layer+1)*2*N+i
            c, d = (layer+1)*2*N+j, layer*2*N+j
            add(a, b, c, 1)
            add(a, c, d, 1)
            # Thumb-hole walls face toward cavity.
            a, b = layer*2*N+N+i, (layer+1)*2*N+N+i
            c, d = (layer+1)*2*N+N+j, layer*2*N+N+j
            add(a, c, b, 1)
            add(a, d, c, 1)
    return vertices, faces, material_indices

def build_paint(center, radii, angle, phase):
    vertices = []
    rings, sides = PAINT_RINGS, PAINT_SIDES
    height = 0.009
    zcenter = THICKNESS/2 + 0.001
    ca, sa = math.cos(angle), math.sin(angle)
    vertices.append((center[0], center[1], zcenter + height))
    for ring in range(1, rings):
        latitude = math.pi * ring / rings
        for side in range(sides):
            theta = math.tau * side / sides
            organic = 1 + 0.035 * math.sin(3*theta+phase) + 0.020 * math.sin(5*theta-phase)
            x = radii[0] * math.sin(latitude) * math.cos(theta) * organic
            y = radii[1] * math.sin(latitude) * math.sin(theta) * organic
            vertices.append((
                center[0] + ca*x - sa*y,
                center[1] + sa*x + ca*y,
                zcenter + height * math.cos(latitude),
            ))
    bottom = len(vertices)
    vertices.append((center[0], center[1], zcenter - height))
    faces = []
    for i in range(sides):
        j = (i+1) % sides
        faces.append((0, 1+i, 1+j))
    for ring in range(rings-2):
        for i in range(sides):
            j = (i+1) % sides
            a, b, c, d = 1+ring*sides+i, 1+(ring+1)*sides+i, 1+(ring+1)*sides+j, 1+ring*sides+j
            faces.extend(((a, b, c), (a, c, d)))
    last = 1 + (rings-2)*sides
    for i in range(sides):
        j = (i+1) % sides
        faces.append((last+i, bottom, last+j))
    return vertices, faces

def color(hex_color):
    return [int(hex_color[i:i+2], 16) / 255 for i in (1, 3, 5)] + [1]

def material(name, hex_color, roughness):
    return {
        "name": name,
        "pbrMetallicRoughness": {
            "baseColorFactor": color(hex_color),
            "metallicFactor": 0.0,
            "roughnessFactor": roughness,
        },
        "doubleSided": False,
    }

class GlbWriter:
    def __init__(self):
        self.blob = bytearray()
        self.doc = {
            "asset": {"version": "2.0", "generator": "CRWT optimized rigid prop candidate builder (stdlib)"},
            "scene": 0,
            "scenes": [{"name": "Yuna_Palette_Optimized_Candidate", "nodes": []}],
            "nodes": [],
            "meshes": [],
            "materials": [
                material("Cream_palette_face", "#F8DEC0", 0.78),
                material("Warm_palette_edge_and_hole", "#D8AB7F", 0.75),
            ],
            "bufferViews": [],
            "accessors": [],
            "extras": {
                "project": "Crazy Rich: World Tour",
                "prop_id": "yuna-painter-palette",
                "status": "candidate-manual-source-guided-approximation",
                "visual_final_approved": False,
                "source_sha256": SOURCE_SHA256,
                "source_commit": SOURCE_COMMIT,
                "source_reference": SOURCE_REPOSITORY_PATH,
                "front_axis": "+Z",
                "up_axis": "+Y",
                "units": "arbitrary design units; not measured from reference",
                "no_body_or_rig": True,
            },
        }

    def accessor(self, array, dimension, component_type, target, with_bounds=False):
        while len(self.blob) % 4:
            self.blob.append(0)
        offset = len(self.blob)
        flat = [v for row in array for v in row] if dimension > 1 else list(array)
        code = {5126: "f", 5123: "H", 5125: "I"}[component_type]
        raw = struct.pack("<" + code*len(flat), *flat)
        self.blob.extend(raw)
        view = len(self.doc["bufferViews"])
        self.doc["bufferViews"].append({
            "buffer": 0, "byteOffset": offset, "byteLength": len(raw), "target": target,
        })
        record = {
            "bufferView": view, "componentType": component_type,
            "count": len(array), "type": {1: "SCALAR", 3: "VEC3"}[dimension],
        }
        if with_bounds:
            record["min"] = [min(row[i] for row in array) for i in range(dimension)]
            record["max"] = [max(row[i] for row in array) for i in range(dimension)]
        index = len(self.doc["accessors"])
        self.doc["accessors"].append(record)
        return index

    def mesh(self, name, vertices, faces, materials):
        pos = self.accessor(vertices, 3, 5126, 34962, True)
        norm = self.accessor(normals(vertices, faces), 3, 5126, 34962)
        primitive_list = []
        for mat in sorted(set(materials)):
            indices = [v for face, chosen in zip(faces, materials) if chosen == mat for v in face]
            index_accessor = self.accessor(indices, 1, 5123 if len(vertices) < 65536 else 5125, 34963)
            primitive_list.append({
                "attributes": {"POSITION": pos, "NORMAL": norm},
                "indices": index_accessor, "material": mat, "mode": 4,
            })
        index = len(self.doc["meshes"])
        self.doc["meshes"].append({"name": name, "primitives": primitive_list})
        node_index = len(self.doc["nodes"])
        self.doc["nodes"].append({"name": name, "mesh": index})
        self.doc["scenes"][0]["nodes"].append(node_index)

    def save(self, path):
        self.doc["buffers"] = [{"byteLength": len(self.blob)}]
        json_bytes = json.dumps(self.doc, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        json_bytes += b" " * (-len(json_bytes) % 4)
        binary = bytes(self.blob)
        binary += b"\0" * (-len(binary) % 4)
        total = 12 + 8 + len(json_bytes) + 8 + len(binary)
        path.write_bytes(
            struct.pack("<III", 0x46546C67, 2, total)
            + struct.pack("<II", len(json_bytes), 0x4E4F534A) + json_bytes
            + struct.pack("<II", len(binary), 0x004E4942) + binary
        )

def topology_stats(vertices, faces):
    edges = Counter(tuple(sorted((a, b))) for face in faces for a, b in zip(face, face[1:]+face[:1]))
    degenerate = 0
    for a, b, c in faces:
        u = [vertices[b][i] - vertices[a][i] for i in range(3)]
        v = [vertices[c][i] - vertices[a][i] for i in range(3)]
        area = (
            (u[1]*v[2]-u[2]*v[1])**2
            + (u[2]*v[0]-u[0]*v[2])**2
            + (u[0]*v[1]-u[1]*v[0])**2
        )
        degenerate += area < 1e-20
    return {
        "vertices": len(vertices), "triangles": len(faces),
        "boundary_edges": sum(n == 1 for n in edges.values()),
        "nonmanifold_edges": sum(n > 2 for n in edges.values()),
        "degenerate_triangles": degenerate,
        "closed_triangle_surface": all(n == 2 for n in edges.values()),
        "bounds": [
            [min(v[i] for v in vertices) for i in range(3)],
            [max(v[i] for v in vertices) for i in range(3)],
        ],
    }

def read_glb(path):
    data = path.read_bytes()
    magic, version, size = struct.unpack_from("<III", data)
    if (magic, version, size) != (0x46546C67, 2, len(data)):
        raise ValueError("Invalid GLB header")
    cursor, document, binary = 12, None, b""
    while cursor < len(data):
        length, kind = struct.unpack_from("<II", data, cursor)
        chunk = data[cursor+8:cursor+8+length]
        if kind == 0x4E4F534A:
            document = json.loads(chunk)
        elif kind == 0x004E4942:
            binary = chunk
        cursor += 8 + length
    if document is None:
        raise ValueError("Missing GLB JSON")
    return document, binary

def position_accessor(doc, binary, index):
    acc = doc["accessors"][index]
    if acc["type"] != "VEC3" or acc["componentType"] != 5126:
        raise ValueError("Expected VEC3 float positions")
    view = doc["bufferViews"][acc["bufferView"]]
    offset = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
    stride = view.get("byteStride", 12)
    return [
        struct.unpack_from("<fff", binary, offset + i*stride)
        for i in range(acc["count"])
    ]

def audit_glb(path):
    doc, binary = read_glb(path)
    position_refs = [
        p["attributes"]["POSITION"] for m in doc["meshes"] for p in m["primitives"]
    ]
    return {
        "file": path.name,
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "bytes": path.stat().st_size,
        "triangles": sum(
            doc["accessors"][p["indices"]]["count"] // 3
            for m in doc["meshes"] for p in m["primitives"]
        ),
        "unique_position_accessor_vertices": sum(
            doc["accessors"][i]["count"] for i in set(position_refs)
        ),
        "primitive_expanded_position_vertices": sum(
            doc["accessors"][i]["count"] for i in position_refs
        ),
        "body_primitive_position_refs": [
            {
                "material": p["material"],
                "position_accessor": p["attributes"]["POSITION"],
                "position_count": doc["accessors"][p["attributes"]["POSITION"]]["count"],
            }
            for p in doc["meshes"][0]["primitives"]
        ],
        "uv_attributes_present": any(
            any(k.startswith("TEXCOORD") for k in p["attributes"])
            for m in doc["meshes"] for p in m["primitives"]
        ),
    }

def point_segment_distance(point, a, b):
    ab = tuple(b[i] - a[i] for i in range(3))
    ap = tuple(point[i] - a[i] for i in range(3))
    denom = sum(v*v for v in ab)
    u = max(0.0, min(1.0, sum(ap[i]*ab[i] for i in range(3))/max(denom, 1e-30)))
    return math.sqrt(sum((point[i] - (a[i] + u*ab[i]))**2 for i in range(3)))

def sampled_boundary_deviation(original_path, optimized_path):
    old_doc, old_bin = read_glb(original_path)
    new_doc, new_bin = read_glb(optimized_path)
    old = position_accessor(
        old_doc, old_bin, old_doc["meshes"][0]["primitives"][0]["attributes"]["POSITION"]
    )
    new = position_accessor(
        new_doc, new_bin, new_doc["meshes"][0]["primitives"][0]["attributes"]["POSITION"]
    )
    old_n, new_n = len(old)//8, len(new)//8
    maximum = 0.0
    for ring in range(8):
        reduced = new[ring*new_n:(ring+1)*new_n]
        for point in old[ring*old_n:(ring+1)*old_n]:
            nearest = min(
                point_segment_distance(point, reduced[i], reduced[(i+1)%new_n])
                for i in range(new_n)
            )
            maximum = max(maximum, nearest)
    return {
        "method": "Maximum original-candidate boundary vertex distance to corresponding optimized boundary polylines (8 body loops).",
        "original_body_boundary_samples": old_n,
        "optimized_body_boundary_samples": new_n,
        "max_sampled_body_boundary_deviation_design_units": maximum,
        "limitation": "Compares candidate to candidate, not to the master image. Does not quantify paint-surface or texture fidelity.",
    }

def main():
    here = Path(__file__).resolve().parent
    workspace = here.parent.parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=workspace / "work" / "master-lineup.png")
    parser.add_argument("--out", type=Path, default=here)
    args = parser.parse_args()
    actual_source_sha = hashlib.sha256(args.source.read_bytes()).hexdigest()
    if actual_source_sha != SOURCE_SHA256:
        raise ValueError("Source hash differs from approved master; builder stopped")
    args.out.mkdir(parents=True, exist_ok=True)
    writer = GlbWriter()
    verts, faces, mats = build_body()
    writer.mesh("Yuna_palette_body_with_open_thumb_hole", verts, faces, mats)
    components = [topology_stats(verts, faces)]
    all_vertices = list(verts)
    for i, (name, center, radii, angle, hex_color) in enumerate(PAINT_PATCHES):
        paint_verts, paint_faces = build_paint(center, radii, angle, i*0.31)
        mat = len(writer.doc["materials"])
        writer.doc["materials"].append(material(name, hex_color, 0.52))
        writer.mesh("Paint_" + name, paint_verts, paint_faces, [mat] * len(paint_faces))
        components.append(topology_stats(paint_verts, paint_faces))
        all_vertices.extend(paint_verts)
    if any(
        c["boundary_edges"] or c["nonmanifold_edges"] or c["degenerate_triangles"]
        for c in components
    ):
        raise AssertionError("Candidate topology checks failed")
    glb_path = args.out / "yuna-palette-source-guided-optimized-candidate.glb"
    writer.save(glb_path)
    evidence = {
        "project": "Crazy Rich: World Tour",
        "prop_id": "yuna-painter-palette",
        "status": "optimized-candidate-render-needed-manual-approximation",
        "generated_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
        "source": {
            "repository": "zetsuen1412-alt/comeplayers",
            "branch": "codex/crazy-rich-web-v30",
            "commit": SOURCE_COMMIT,
            "repository_path": SOURCE_REPOSITORY_PATH,
            "sha256": actual_source_sha,
            "image_visually_inspected": True,
            "target": "Bottom row, third figure; name Yuna inferred from repository roster order",
            "selection_reason": "Kairo suitcase is significantly occluded by legs/footwear; Yuna palette's rigid front silhouette and main color families are more readable.",
        },
        "observed": [
            "Pale cream asymmetrical painter palette",
            "A visible elongated thumb/grip hole near upper-right part of shown face",
            "Multiple colored paint patches: blues, pink/red, warm yellow/orange, green and purple, with a brown-looking patch",
            "Held on Yuna's anatomical right side",
        ],
        "inferred_or_approximate": [
            "Contour is hand-approximated, not segmented or recovered by photogrammetry",
            "True unforeshortened shape inferred from an angled reference",
            "Thumb-hole exact size, position and interior bevel",
            "Paint count, placement, outline, depth and material values",
            "Total thickness and edge bevels",
            "Plain rear surface, unseen underside, grip alignment and arbitrary unit scale",
        ],
        "not_claimed": [
            "Exact visual match",
            "User visual approval",
            "Gemini-generated mesh",
            "Final production topology or textures",
            "Character body, rig, animation or game integration",
        ],
        "method": {
            "builder": "build_yuna_palette_optimized_candidate.py",
            "provider": "Local Python standard-library mesh construction",
            "paid_api": False, "network_used": False, "system_installations": False,
            "front_axis": "+Z", "up_axis": "+Y",
            "palette_thickness_design_units": THICKNESS,
            "separate_components": ["palette body"] + [p[0] for p in PAINT_PATCHES],
            "geometry_note": "Palette body is a closed annular beveled solid with a genuinely open thumb hole; paint patches are separate closed meshes partly embedded in its face.",
        },
        "output": {
            "file": glb_path.name,
            "sha256": hashlib.sha256(glb_path.read_bytes()).hexdigest(),
            "bytes": glb_path.stat().st_size,
            "format": "glTF 2.0 / GLB",
            "mesh_count": len(writer.doc["meshes"]),
            "material_count": len(writer.doc["materials"]),
            "total_vertices": sum(c["vertices"] for c in components),
            "total_triangles": sum(c["triangles"] for c in components),
            "skins": 0, "animations": 0, "embedded_textures": 0,
            "bounds": [
                [min(v[i] for v in all_vertices) for i in range(3)],
                [max(v[i] for v in all_vertices) for i in range(3)],
            ],
        },
        "validation": {
            "source_hash_matches": True,
            "all_components_closed": all(c["closed_triangle_surface"] for c in components),
            "boundary_edges": sum(c["boundary_edges"] for c in components),
            "nonmanifold_edges": sum(c["nonmanifold_edges"] for c in components),
            "degenerate_triangles": sum(c["degenerate_triangles"] for c in components),
            "actual_mesh_render_reviewed": False,
            "visual_match_verified": False,
            "scale_and_hand_grip_verified": False,
            "game_assets_replaced": False,
            "component_reports": components,
        },
        "next_review": [
            "Render actual GLB front/back/side/three-quarter and compare its source-visible outline, thumb hole and paint layout",
            "Check rear/plain-surface inference and thickness in camera orbit",
            "Fit to Yuna's hand only after accepted Yuna body exists",
            "Revise differences before any acceptance or game integration",
        ],
    }
    original_path = args.out / "yuna-palette-source-guided-candidate.glb"
    original_render_path = args.out / "yuna-palette-source-guided-candidate-review" / "render-evidence.json"
    current_audit = audit_glb(glb_path)
    original_audit = audit_glb(original_path) if original_path.exists() else None
    if current_audit["triangles"] > 2500:
        raise AssertionError("Optimized candidate exceeded triangle target")
    original_render = json.loads(original_render_path.read_text(encoding="utf-8")) if original_render_path.exists() else None
    evidence["optimization"] = {
        "target_max_triangles": 2500,
        "technique": "Rebuild identical contour, thickness, hole, paint placement/colors at lower boundary/paint sampling; no dependency decimation.",
        "sampling": {
            "original": {"body_boundary": 192, "paint_rings": 10, "paint_sides": 40},
            "optimized": {"body_boundary": N, "paint_rings": PAINT_RINGS, "paint_sides": PAINT_SIDES},
        },
        "preserved_design_parameters": [
            "OUTLINE_CONTROL", "THICKNESS", "HOLE_CENTER", "HOLE_RADII", "HOLE_ROTATION",
            "PAINT_PATCHES centers/radii/rotation/colors", "body bevel distances", "material values",
        ],
        "original_candidate": original_audit,
        "optimized_candidate": current_audit,
        "original_render_evidence": original_render,
        "triangles_reduction_percent": (
            100 * (1-current_audit["triangles"]/original_audit["triangles"])
            if original_audit else None
        ),
        "boundary_deviation": (
            sampled_boundary_deviation(original_path, glb_path)
            if original_audit else None
        ),
        "original_preserved": True,
        "optimized_actual_render_reviewed": False,
        "vertex_count_accounting": {
            "builder_metric": "Sum of unique referenced POSITION accessor counts.",
            "renderer_metric_correspondence": "Original renderer reports 6692; original GLB sum of POSITION counts per primitive is also 6692. Builder count is 5156. Both body material primitives reference the SAME 1536-position accessor, yielding 1536 extra in primitive-expanded accounting.",
            "known_from_glb": "No TEXCOORD attributes. Body position and normal accessors are shared by two material primitives.",
            "not_asserted": "Loader internal welding/normal-splitting behavior was not independently instrumented. Do not attribute the difference to UVs or normal splitting.",
        },
    }
    evidence["original_actual_render_review"] = {
        "images_inspected": [
            "yuna-palette-source-guided-candidate-review/geometry-contact-sheet.png",
            "canonical master lineup",
        ],
        "observations": [
            "Front/back render shows genuine elongated thumb hole through body.",
            "Side views show finite thickness; back plain and paint patches confined to front.",
            "Paint colors are readable but the patch count/centers/outlines remain approximate, simplified compared to the source.",
            "Candidate oval silhouette, hole position and thickness are not established as exact source matches.",
        ],
        "visual_final_approved": False,
    }
    evidence_path = args.out / "yuna-palette-optimized-candidate-evidence.json"
    evidence_path.write_text(json.dumps(evidence, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({
        "glb": str(glb_path), "evidence": str(evidence_path),
        "sha256": evidence["output"]["sha256"],
        "vertices": evidence["output"]["total_vertices"],
        "triangles": evidence["output"]["total_triangles"],
        "status": evidence["status"],
    }, indent=2))

if __name__ == "__main__":
    main()


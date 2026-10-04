"""Read-only geometry inventory for a GLB, using stdlib and numpy.

Outputs JSON, CSV, and a brief Markdown report. Exact-coordinate welding is an
analysis-only connectivity comparison; original buffers are never modified.
Neither connectivity nor small size establishes that a part is an artifact.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
from pathlib import Path
import struct
import sys

import numpy as np


COMPONENT_DTYPES = {
    5120: np.dtype("i1"), 5121: np.dtype("u1"),
    5122: np.dtype("<i2"), 5123: np.dtype("<u2"),
    5125: np.dtype("<u4"), 5126: np.dtype("<f4"),
}
TYPE_WIDTH = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4,
              "MAT2": 4, "MAT3": 9, "MAT4": 16}


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def load_glb(path):
    raw = path.read_bytes()
    if len(raw) < 12:
        raise ValueError("GLB shorter than header")
    magic, version, total = struct.unpack_from("<III", raw)
    if magic != 0x46546C67 or version != 2 or total != len(raw):
        raise ValueError("Invalid GLB v2 header or declared length")
    chunks, at = [], 12
    while at < len(raw):
        if at + 8 > len(raw):
            raise ValueError("Truncated chunk header")
        size, kind = struct.unpack_from("<II", raw, at)
        at += 8
        if at + size > len(raw):
            raise ValueError("Truncated GLB chunk")
        chunks.append((kind, raw[at:at+size]))
        at += size
    if not chunks or chunks[0][0] != 0x4E4F534A:
        raise ValueError("First chunk must contain JSON")
    doc = json.loads(chunks[0][1].rstrip(b" \x00"))
    binary = [b for t, b in chunks if t == 0x004E4942]
    if len(binary) > 1:
        raise ValueError("Multiple BIN chunks are unsupported")
    if any("uri" in b for b in doc.get("buffers", [])):
        raise ValueError("External/data URI buffers are unsupported; use embedded GLB")
    bin_data = binary[0] if binary else b""
    if len(doc.get("buffers", [])) > 1:
        raise ValueError("Multiple buffers are unsupported")
    if doc.get("buffers") and doc["buffers"][0]["byteLength"] > len(bin_data):
        raise ValueError("Declared buffer exceeds BIN chunk")
    return raw, doc, bin_data, chunks


def read_accessor(doc, binary, accessor_id):
    accessor = doc["accessors"][accessor_id]
    dtype = COMPONENT_DTYPES[accessor["componentType"]]
    width, count = TYPE_WIDTH[accessor["type"]], accessor["count"]
    if accessor["type"] in ("MAT2", "MAT3") and dtype.itemsize < 4:
        raise ValueError("Small-component padded matrix accessor is unsupported")
    if "bufferView" in accessor:
        view = doc["bufferViews"][accessor["bufferView"]]
        if "EXT_meshopt_compression" in view.get("extensions", {}):
            raise ValueError("Meshopt-compressed bufferView unsupported; no geometry guess will be made")
        if view.get("buffer", 0) != 0:
            raise ValueError("Accessor references nonembedded buffer")
        offset = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
        stride = view.get("byteStride", dtype.itemsize * width)
        end = offset + max(0, count-1) * stride + (dtype.itemsize * width if count else 0)
        if end > view.get("byteOffset", 0) + view["byteLength"] or end > len(binary):
            raise ValueError("Accessor extends beyond its bufferView")
        result = np.ndarray((count, width), dtype=dtype, buffer=binary,
                            offset=offset, strides=(stride, dtype.itemsize)).copy()
    else:
        result = np.zeros((count, width), dtype=dtype)
    if "sparse" in accessor:
        sparse = accessor["sparse"]
        si, sv = sparse["indices"], sparse["values"]
        iv = doc["bufferViews"][si["bufferView"]]
        vv = doc["bufferViews"][sv["bufferView"]]
        idtype = COMPONENT_DTYPES[si["componentType"]]
        idx = np.frombuffer(binary, dtype=idtype, count=sparse["count"],
                            offset=iv.get("byteOffset", 0) + si.get("byteOffset", 0))
        vals = np.frombuffer(binary, dtype=dtype, count=sparse["count"] * width,
                             offset=vv.get("byteOffset", 0) + sv.get("byteOffset", 0))
        result[idx] = vals.reshape(-1, width)
    digest = sha256(result.tobytes(order="C"))
    if accessor.get("normalized") and accessor["componentType"] != 5126:
        value = result.astype(np.float64)
        max_value = np.iinfo(dtype).max
        result = value / max_value
        if np.issubdtype(dtype, np.signedinteger):
            result = np.maximum(result, -1)
    return result, {"accessor": accessor_id, "component_type": accessor["componentType"],
                    "type": accessor["type"], "count": count,
                    "raw_attribute_sha256": digest,
                    "hash_definition": "accessor element bytes in original component dtype, deinterleaved; sparse overrides applied"}


def node_matrix(node):
    if "matrix" in node:
        return np.array(node["matrix"], dtype=np.float64).reshape(4, 4, order="F")
    t = node.get("translation", [0, 0, 0])
    s = node.get("scale", [1, 1, 1])
    x, y, z, w = node.get("rotation", [0, 0, 0, 1])
    r = np.array([
        [1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)],
        [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)],
        [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)],
    ], dtype=np.float64)
    m = np.eye(4)
    m[:3, :3] = r @ np.diag(s)
    m[:3, 3] = t
    return m


def instances(doc):
    nodes, found = doc.get("nodes", []), []
    roots = doc.get("scenes", [{}])[doc.get("scene", 0)].get("nodes", [])
    if not doc.get("scenes"):
        child_ids = {i for n in nodes for i in n.get("children", [])}
        roots = [i for i in range(len(nodes)) if i not in child_ids]
    def visit(i, parent, ancestry):
        if i in ancestry:
            raise ValueError("Node graph contains a cycle")
        node = nodes[i]
        world = parent @ node_matrix(node)
        if "mesh" in node:
            found.append((i, node["mesh"], world, node.get("name", f"node-{i}")))
        for child in node.get("children", []):
            visit(child, world, ancestry | {i})
    for root in roots:
        visit(root, np.eye(4), set())
    if not found and not nodes:
        found = [(None, i, np.eye(4), f"mesh-{i}") for i in range(len(doc.get("meshes", [])))]
    return found


def triangulate(indices, mode):
    if mode == 4:
        if len(indices) % 3:
            raise ValueError("TRIANGLES indices not divisible by three")
        return indices.reshape(-1, 3)
    if mode == 5:
        if len(indices) < 3:
            return np.zeros((0, 3), dtype=np.int64)
        tris = np.stack([indices[:-2], indices[1:-1], indices[2:]], axis=1)
        tris[1::2, :2] = tris[1::2, 1::-1]
        return tris
    if mode == 6:
        return np.array([[indices[0], indices[i], indices[i+1]]
                         for i in range(1, len(indices)-1)], dtype=np.int64).reshape(-1, 3)
    raise ValueError(f"Primitive mode {mode} is not a triangle surface")


class UnionFind:
    def __init__(self, n):
        self.parent = np.arange(n, dtype=np.int64)
        self.rank = np.zeros(n, dtype=np.uint8)
    def find(self, a):
        while self.parent[a] != a:
            self.parent[a] = self.parent[self.parent[a]]
            a = self.parent[a]
        return a
    def union(self, a, b):
        a, b = self.find(a), self.find(b)
        if a == b:
            return
        if self.rank[a] < self.rank[b]:
            a, b = b, a
        self.parent[b] = a
        if self.rank[a] == self.rank[b]:
            self.rank[a] += 1


def component_metrics(vertices, triangles, face_ids, component_id, source_ids):
    faces = triangles[face_ids]
    vert_ids = np.unique(faces)
    points = vertices[vert_ids]
    tri_points = vertices[faces]
    a, b, c = tri_points[:, 0], tri_points[:, 1], tri_points[:, 2]
    cross = np.cross(b-a, c-a)
    area = np.linalg.norm(cross, axis=1) / 2
    edges = np.sort(np.concatenate([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]]), axis=1)
    _, edge_counts = np.unique(edges, axis=0, return_counts=True)
    boundary = int(np.sum(edge_counts == 1))
    nonmanifold = int(np.sum(edge_counts > 2))
    centers = (a+b+c) / 3
    centroid = (centers * area[:, None]).sum(axis=0) / area.sum() if area.sum() else points.mean(axis=0)
    bounds = np.array([points.min(axis=0), points.max(axis=0)])
    signed_volume = float(np.einsum("ij,ij->i", a, np.cross(b, c)).sum() / 6)
    return {
        "component": component_id,
        "vertices": int(len(vert_ids)), "faces": int(len(face_ids)),
        "bounds_min": bounds[0].tolist(), "bounds_max": bounds[1].tolist(),
        "extent_xyz": (bounds[1]-bounds[0]).tolist(),
        "bounds_center": bounds.mean(axis=0).tolist(),
        "vertex_mean": points.mean(axis=0).tolist(),
        "surface_centroid": centroid.tolist(),
        "surface_area": float(area.sum()),
        "zero_area_faces": int(np.sum(area <= 1e-16)),
        "boundary_edges": boundary, "nonmanifold_edges": nonmanifold,
        "closed_edge_manifold": boundary == 0 and nonmanifold == 0,
        "signed_volume_if_closed": signed_volume if boundary == 0 and nonmanifold == 0 else None,
        "source_primitives": sorted(set(int(i) for i in source_ids[face_ids])),
        "triangle_membership_sha256": sha256(np.asarray(face_ids, dtype="<u8").tobytes()),
        "vertex_membership_sha256": sha256(np.asarray(vert_ids, dtype="<u8").tobytes()),
        "position_values_sha256": sha256(np.asarray(points, dtype="<f8").tobytes()),
        "triangle_index_values_sha256": sha256(np.asarray(faces, dtype="<u8").tobytes()),
    }


def components(vertices, triangles, source_ids, through_edges=False):
    if through_edges:
        # Standard surface islands: adjacent faces must share an entire edge.
        union = UnionFind(len(triangles))
        edges = np.sort(np.concatenate([triangles[:, [0, 1]], triangles[:, [1, 2]], triangles[:, [2, 0]]]), axis=1)
        _, inverse = np.unique(edges, axis=0, return_inverse=True)
        owners = np.tile(np.arange(len(triangles)), 3)
        order = np.argsort(inverse, kind="stable")
        sorted_edge_ids, sorted_owners = inverse[order], owners[order]
        same_edge = np.flatnonzero(sorted_edge_ids[1:] == sorted_edge_ids[:-1])
        for i in same_edge:
            union.union(int(sorted_owners[i]), int(sorted_owners[i+1]))
        roots = np.array([union.find(i) for i in range(len(triangles))], dtype=np.int64)
    else:
        union = UnionFind(len(vertices))
        for a, b, c in triangles:
            union.union(int(a), int(b))
            union.union(int(a), int(c))
        roots = np.array([union.find(int(f[0])) for f in triangles], dtype=np.int64)
    unique_roots, inv = np.unique(roots, return_inverse=True)
    ordered = sorted(range(len(unique_roots)), key=lambda i: (-int(np.sum(inv == i)), int(unique_roots[i])))
    reports = [component_metrics(vertices, triangles, np.flatnonzero(inv == label), i+1, source_ids)
               for i, label in enumerate(ordered)]
    if reports:
        main = reports[0]
        lower, upper = np.array(main["bounds_min"]), np.array(main["bounds_max"])
        extent = upper-lower
        scale = max(float(np.max(extent)), 1e-16)
        for report in reports:
            report["face_fraction"] = report["faces"] / len(triangles)
            report["area_fraction"] = report["surface_area"] / sum(r["surface_area"] for r in reports)
            report["center_in_main_bounds_xyz"] = ((np.array(report["bounds_center"])-lower) / np.maximum(extent, 1e-16)).tolist()
            report["max_extent_vs_main"] = max(report["extent_xyz"]) / scale
            report["interpretation"] = "main component by face count" if report["component"] == 1 else "separate island; artifact status requires visual/anatomical inspection"
    return reports, int(len(set(np.unique(triangles))))


def audit(path):
    raw, doc, binary, chunks = load_glb(path)
    vertices, faces, sources, primitive_reports, warnings = [], [], [], [], []
    base, all_instances = 0, instances(doc)
    for node_id, mesh_id, transform, node_name in all_instances:
        mesh = doc["meshes"][mesh_id]
        for primitive_id, primitive in enumerate(mesh["primitives"]):
            if "POSITION" not in primitive.get("attributes", {}):
                warnings.append(f"Skipped mesh {mesh_id} primitive {primitive_id}: no POSITION")
                continue
            if any(e in primitive.get("extensions", {}) for e in ["KHR_draco_mesh_compression", "EXT_meshopt_compression"]):
                raise ValueError("Compressed primitive unsupported; no geometry guess will be made")
            local, pos_meta = read_accessor(doc, binary, primitive["attributes"]["POSITION"])
            if local.shape[1] != 3 or not np.isfinite(local).all():
                raise ValueError("POSITION must contain finite VEC3 values")
            local = local.astype(np.float64)
            world = local @ transform[:3, :3].T + transform[:3, 3]
            if "indices" in primitive:
                indices, index_meta = read_accessor(doc, binary, primitive["indices"])
                indices = indices.reshape(-1).astype(np.int64)
            else:
                indices, index_meta = np.arange(len(local)), None
            if len(indices) and (indices.min() < 0 or indices.max() >= len(local)):
                raise ValueError("Index is outside POSITION accessor")
            mode = primitive.get("mode", 4)
            if mode not in (4, 5, 6):
                warnings.append(f"Skipped mesh {mesh_id} primitive {primitive_id}: nonsurface mode {mode}")
                continue
            tris = triangulate(indices, mode)
            report_id = len(primitive_reports)
            primitive_reports.append({
                "audit_primitive": report_id, "mesh": mesh_id,
                "mesh_name": mesh.get("name"), "node": node_id, "node_name": node_name,
                "primitive": primitive_id, "mode": mode,
                "vertices": len(local), "faces": len(tris), "material": primitive.get("material"),
                "attributes": primitive.get("attributes"),
                "position": pos_meta, "indices": index_meta,
                "world_transform": transform.tolist(),
                "world_bounds_min": world.min(axis=0).tolist() if len(world) else None,
                "world_bounds_max": world.max(axis=0).tolist() if len(world) else None,
            })
            vertices.append(world)
            faces.append(tris + base)
            sources.append(np.full(len(tris), report_id, dtype=np.int64))
            base += len(world)
    if not vertices:
        raise ValueError("No decodable triangle geometry")
    vertices = np.concatenate(vertices)
    triangles = np.concatenate(faces)
    sources = np.concatenate(sources)
    if not len(triangles):
        raise ValueError("No triangles")
    indexed_components, used_indexed = components(vertices, triangles, sources)
    # np.unique compares exact world coordinates, with no distance tolerance.
    welded_vertices, inverse = np.unique(vertices, axis=0, return_inverse=True)
    welded_triangles = inverse[triangles]
    coordinate_components, used_welded = components(welded_vertices, welded_triangles, sources)
    indexed_edge_components, _ = components(vertices, triangles, sources, through_edges=True)
    coordinate_edge_components, _ = components(welded_vertices, welded_triangles, sources, through_edges=True)
    if doc.get("skins"):
        warnings.append("Skins exist: this audit uses stored vertex positions and node transforms; no skin deformation or animation is evaluated")
    if any(p.get("targets") for mesh in doc.get("meshes", []) for p in mesh.get("primitives", [])):
        warnings.append("Morph targets exist: this audit uses base POSITION only")
    return {
        "schema": "crwt.read_only_glb_component_audit.v1",
        "input_file": str(path.resolve()), "input_bytes": len(raw),
        "input_sha256": sha256(raw),
        "input_git_blob_sha1": hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest(),
        "binary_chunk_sha256": sha256(binary),
        "json_chunk_sha256": sha256(chunks[0][1]),
        "scene": doc.get("scene", 0), "scene_instances": len(all_instances),
        "mesh_count": len(doc.get("meshes", [])), "primitive_count": len(primitive_reports),
        "skin_count": len(doc.get("skins", [])), "animation_count": len(doc.get("animations", [])),
        "material_count": len(doc.get("materials", [])), "image_count": len(doc.get("images", [])),
        "indexed_vertices": len(vertices), "used_indexed_vertices": used_indexed,
        "exact_coordinate_vertices": len(welded_vertices), "used_exact_coordinate_vertices": used_welded,
        "faces": len(triangles), "bounds_min": vertices.min(axis=0).tolist(),
        "bounds_max": vertices.max(axis=0).tolist(),
        "connectivity_definition": "Vertex connectivity permits point-only contacts; edge connectivity requires an entire shared edge. Indexed pools stay separate for each mesh primitive/instance. Exact-coordinate pools analytically coalesce equal world-space coordinates across primitive pools; no tolerance, mesh edits, or output welding. Edge-connected exact-coordinate components are the primary surface-island inventory.",
        "hash_note": "File/chunk/accessor hashes identify original binary data. Component hashes identify ordered membership or decoded world-space values; coordinate component numbering differs from indexed numbering.",
        "primitives": primitive_reports, "indexed_components": indexed_components,
        "exact_coordinate_components": coordinate_components,
        "indexed_edge_components": indexed_edge_components,
        "exact_coordinate_edge_components": coordinate_edge_components,
        "warnings": warnings,
        "anatomy_limit": "Bounds and connectivity locate isolated parts but cannot establish hair/eye/finger anatomy or decide deletion. Requires visual inspection of the actual mesh and reference.",
    }


def write_outputs(report, prefix):
    prefix.parent.mkdir(parents=True, exist_ok=True)
    json_path, csv_path, md_path = (prefix.with_suffix(s) for s in (".json", ".csv", ".md"))
    json_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        fields = ["connectivity", "component", "vertices", "faces", "face_fraction", "surface_area", "area_fraction", "boundary_edges", "nonmanifold_edges", "closed_edge_manifold", "min_x", "min_y", "min_z", "max_x", "max_y", "max_z", "extent_x", "extent_y", "extent_z", "center_x", "center_y", "center_z", "normalized_x", "normalized_y", "normalized_z", "triangle_membership_sha256"]
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        for kind in ("indexed", "exact_coordinate", "indexed_edge", "exact_coordinate_edge"):
            for c in report[kind + "_components"]:
                row = {key: c[key] for key in fields if key in c}
                row["connectivity"] = kind
                for name, values in [("min", c["bounds_min"]), ("max", c["bounds_max"]), ("extent", c["extent_xyz"]), ("center", c["bounds_center"]), ("normalized", c["center_in_main_bounds_xyz"])]:
                    row.update({f"{name}_{axis}": value for axis, value in zip("xyz", values)})
                writer.writerow(row)
    lines = ["# Read-only GLB geometry audit", "", f"Input: `{report['input_file']}`", "", f"SHA-256: `{report['input_sha256']}`", "", f"{report['faces']:,} triangles; {report['indexed_vertices']:,} indexed vertices; {report['primitive_count']} mesh primitives.", "", f"Indexed vertex connectivity: **{len(report['indexed_components'])}**. Exact-coordinate vertex connectivity: **{len(report['exact_coordinate_components'])}**. Indexed edge connectivity: **{len(report['indexed_edge_components'])}**. Exact-coordinate edge connectivity: **{len(report['exact_coordinate_edge_components'])}**.", "", report["connectivity_definition"], "", "No source geometry was edited. Small isolated components are candidates for inspection, not approved deletions.", "", "Primary inventory: exact-coordinate edge-connected surface islands.", "", "| Island | Faces | Area fraction | Bounds min XYZ | Bounds max XYZ | Center within main bounds XYZ | Closed |", "|---|---:|---:|---|---|---|---|" ]
    for c in report["exact_coordinate_edge_components"]:
        vec = lambda v: ", ".join(f"{x:.6g}" for x in v)
        lines.append(f"| {c['component']} | {c['faces']:,} | {c['area_fraction']:.6%} | {vec(c['bounds_min'])} | {vec(c['bounds_max'])} | {vec(c['center_in_main_bounds_xyz'])} | {c['closed_edge_manifold']} |")
    lines += ["", report["anatomy_limit"]]
    if report["warnings"]:
        lines += ["", "Warnings:", ""] + [f"- {w}" for w in report["warnings"]]
    md_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return [str(p.resolve()) for p in (json_path, csv_path, md_path)]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("--out", type=Path, required=True, help="Output prefix; writes .json, .csv, .md")
    args = parser.parse_args()
    before = sha256(args.input.read_bytes())
    report = audit(args.input)
    after = sha256(args.input.read_bytes())
    if before != after or before != report["input_sha256"]:
        raise RuntimeError("Input changed during audit")
    report["input_hash_before_after_matches"] = True
    paths = write_outputs(report, args.out)
    print(json.dumps({"input_sha256": before, "faces": report["faces"],
                      "indexed_components": len(report["indexed_components"]),
                      "exact_coordinate_components": len(report["exact_coordinate_components"]),
                      "exact_coordinate_edge_components": len(report["exact_coordinate_edge_components"]),
                      "input_unchanged": True, "reports": paths}, indent=2))


if __name__ == "__main__":
    main()

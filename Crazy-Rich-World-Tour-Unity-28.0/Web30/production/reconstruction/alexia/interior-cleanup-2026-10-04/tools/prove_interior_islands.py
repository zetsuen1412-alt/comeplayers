"""Read-only exhaustive containment certificate for selected Alexia V11 islands.

All selected vertices are tested by generalized winding number. Every selected
triangle is certified separated from every dominant-component triangle using
an AABB separating-axis bound or a conservatively bounded triangle-pair SAT.
No exporter or deletion operation is present in this script.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys
import time

import numpy as np

ROOT = Path(__file__).resolve().parent
from audit_glb_components import load_glb, read_accessor, UnionFind

EXPECTED_SHA = "d0a0fea651079aa98d026a1610ef0a9e7f4c14c0c466cb1d949886df45c24a66"
EXPECTED_POSITION_SHA = "416825b530ca4cdae092800cb917a2ffdbc5f30202f6621b58d5ce80219218e6"
EXPECTED_INDEX_SHA = "e5a321d62cdacca1924f83c966dbba454cba7edcafa444d2fc320cfe1ba1c941"
TARGET_COMPONENTS = [5, 6, 7, 8, 10]
EPS = np.finfo(np.float64).eps
GAMMA8 = 8*EPS/(1-8*EPS)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def next_down(value):
    return np.nextafter(value, -np.inf)


def next_up(value):
    return np.nextafter(value, np.inf)


def get_source(path):
    raw, doc, binary, _ = load_glb(path)
    if digest(raw) != EXPECTED_SHA:
        raise ValueError("Input is not the exact reviewed original Alexia V11")
    if len(doc.get("meshes", [])) != 1 or len(doc["meshes"][0]["primitives"]) != 1:
        raise ValueError("Expected one V11 primitive")
    primitive = doc["meshes"][0]["primitives"][0]
    if primitive.get("mode", 4) != 4:
        raise ValueError("Expected original TRIANGLES primitive")
    vertices, pmeta = read_accessor(doc, binary, primitive["attributes"]["POSITION"])
    indices, imeta = read_accessor(doc, binary, primitive["indices"])
    if pmeta["raw_attribute_sha256"] != EXPECTED_POSITION_SHA or imeta["raw_attribute_sha256"] != EXPECTED_INDEX_SHA:
        raise ValueError("Original geometry accessors differ")
    vertices = vertices.astype(np.float64)
    faces = indices.reshape(-1, 3).astype(np.int64)
    union = UnionFind(len(vertices))
    for a, b, c in faces:
        union.union(int(a), int(b))
        union.union(int(a), int(c))
    roots = np.array([union.find(int(f[0])) for f in faces])
    _, inverse, counts = np.unique(roots, return_inverse=True, return_counts=True)
    ordered = sorted(range(len(counts)), key=lambda i: (-int(counts[i]), int(np.flatnonzero(inverse == i)[0])))
    groups = [np.flatnonzero(inverse == i) for i in ordered]
    # The two eight-face islands are ordered by original source connectivity.
    if [len(g) for g in groups] != [448244, 500, 212, 200, 188, 124, 82, 16, 8, 8]:
        raise ValueError("Component counts differ from original V11 audit")
    # Disambiguate the two equal-sized components using their known exact bounds.
    if not np.isclose(vertices[np.unique(faces[groups[8]])].mean(axis=0)[1], 0.5155, atol=0.01):
        groups[8], groups[9] = groups[9], groups[8]
    return raw, vertices, faces, groups, pmeta, imeta


def winding_at_point(triangles, point):
    a, b, c = (triangles[:, i] - point for i in range(3))
    la, lb, lc = (np.linalg.norm(x, axis=1) for x in (a, b, c))
    numerator = np.einsum("ij,ij->i", a, np.cross(b, c))
    denominator = la*lb*lc + np.einsum("ij,ij->i", a, b)*lc + np.einsum("ij,ij->i", b, c)*la + np.einsum("ij,ij->i", c, a)*lb
    return float(np.sum(2*np.arctan2(numerator, denominator)) / (4*np.pi))


def main_surface_invariants(faces, triangles):
    oriented_edges = np.concatenate([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]])
    edges = np.sort(oriented_edges, axis=1)
    _, inverse, counts = np.unique(edges, axis=0, return_inverse=True, return_counts=True)
    signs = np.where(oriented_edges[:, 0] < oriented_edges[:, 1], 1, -1)
    sums = np.bincount(inverse, weights=signs)
    twice_area = np.linalg.norm(np.cross(triangles[:, 1]-triangles[:, 0], triangles[:, 2]-triangles[:, 0]), axis=1)
    return {"triangles": len(faces), "boundary_edges": int(np.sum(counts == 1)),
            "nonmanifold_edges": int(np.sum(counts > 2)),
            "edge_orientation_conflicts": int(np.sum(sums != 0)),
            "zero_area_triangles": int(np.sum(twice_area == 0)),
            "closed_oriented_triangle_cycle": bool(np.all(counts == 2) and np.all(sums == 0) and np.all(twice_area > 0)),
            "global_self_intersections_tested": False,
            "interpretation": "Certificate concerns the region with absolute winding number one against this closed oriented triangle surface; it does not approve production anatomy or global embedding."}


def projected_interval(points, axes):
    """Conservative interval of projection values; axes are arbitrary directions.

    Float64 coordinates originate in exact binary float32 source POSITION.
    Dot-product error is guarded by gamma8*sum(abs(products)), rounded outward.
    Computed axis coefficients are themselves treated as exact binary directions;
    separation along any nonzero direction is a valid geometric certificate.
    """
    if points.ndim == 2:
        products = points[None, :, :] * axes[:, None, :]
    else:
        products = points * axes[:, None, :]
    projection = np.sum(products, axis=2)
    absolute_sum_upper = next_up(np.sum(np.abs(products), axis=2) * (1+GAMMA8))
    error = next_up(absolute_sum_upper * GAMMA8)
    low = np.min(next_down(projection-error), axis=1)
    high = np.max(next_up(projection+error), axis=1)
    return low, high


def sat_distance_bounds(a, b):
    """Return a lower bound on separation per A/B triangle pair.

    Failure to separate means uncertain/intersecting, never a safe result.
    Includes both plane normals, nine edge cross-products and six in-plane axes
    (for coplanar separation), but correctness does not depend on completeness:
    any individually established separating direction proves nonintersection.
    """
    k = len(b)
    ea = np.array([a[1]-a[0], a[2]-a[1], a[0]-a[2]])
    eb = np.stack([b[:, 1]-b[:, 0], b[:, 2]-b[:, 1], b[:, 0]-b[:, 2]], axis=1)
    na = np.cross(ea[0], ea[1])
    nb = np.cross(eb[:, 0], eb[:, 1])
    axes = [np.broadcast_to(na, (k, 3)), nb]
    axes += [np.cross(np.broadcast_to(ea[i], (k, 3)), eb[:, j]) for i in range(3) for j in range(3)]
    axes += [np.broadcast_to(np.cross(na, ea[i]), (k, 3)) for i in range(3)]
    axes += [np.cross(nb, eb[:, j]) for j in range(3)]
    best = np.zeros(k, dtype=np.float64)
    for axis in axes:
        norm_sq_upper = next_up(np.sum(axis*axis, axis=1) * (1+GAMMA8))
        norm_upper = next_up(np.sqrt(norm_sq_upper) * (1+GAMMA8))
        valid = norm_upper > 1e-24
        if not np.any(valid):
            continue
        alow, ahigh = projected_interval(a, axis)
        blow, bhigh = projected_interval(b, axis)
        gap_lower = np.maximum(next_down(blow-ahigh), next_down(alow-bhigh))
        value = np.zeros(k, dtype=np.float64)
        value[valid] = next_down(np.maximum(gap_lower[valid], 0)/norm_upper[valid])
        best = np.maximum(best, value)
    return best


def certify_triangle_separation(triangle, main_triangles, main_low, main_high, margin):
    lo, hi = triangle.min(axis=0), triangle.max(axis=0)
    # An AABB gap along X/Y/Z is already a lower bound on triangle distance.
    aabb_gap = np.max(np.maximum(next_down(main_low-hi), next_down(lo-main_high)), axis=1)
    needs_sat = aabb_gap <= margin
    selected = np.flatnonzero(needs_sat)
    outside_min = float(aabb_gap[~needs_sat].min()) if np.any(~needs_sat) else None
    bounds = sat_distance_bounds(triangle, main_triangles[selected]) if len(selected) else np.array([])
    ambiguous = selected[bounds <= margin]
    lower_values = ([outside_min] if outside_min is not None else []) + ([float(bounds.min())] if len(bounds) else [])
    return {"all_triangle_pairs_separated": not len(ambiguous),
            "dominant_triangle_pair_count": len(main_triangles),
            "aabb_certified_pair_count": int(np.sum(~needs_sat)),
            "sat_checked_pair_count": len(selected),
            "sat_certified_pair_count": int(np.sum(bounds > margin)),
            "ambiguous_pair_count": len(ambiguous),
            "ambiguous_dominant_local_face_ids": ambiguous.tolist(),
            "separation_distance_lower_bound": min(lower_values) if lower_values else None}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    started = time.perf_counter()
    raw, vertices, faces, groups, pmeta, imeta = get_source(args.input)
    main_triangles = vertices[faces[groups[0]]]
    invariants = main_surface_invariants(faces[groups[0]], main_triangles)
    scale = float(np.max(vertices.max(axis=0)-vertices.min(axis=0)))
    margin = scale*1e-7
    main_low, main_high = main_triangles.min(axis=1), main_triangles.max(axis=1)
    certificates = []
    print(json.dumps({"phase": "source validated", "source_sha256": digest(raw), "margin_model_units": margin,
                      "main_surface": invariants}), flush=True)
    for component_id in TARGET_COMPONENTS:
        source_face_ids = groups[component_id-1]
        vertex_ids = np.unique(faces[source_face_ids])
        windings = [winding_at_point(main_triangles, vertices[i]) for i in vertex_ids]
        all_winding_inside = bool(all(abs(w)>0.5 and abs(abs(w)-1)<1e-5 for w in windings))
        triangle_certificates = []
        for source_face_id in source_face_ids:
            certificate = certify_triangle_separation(vertices[faces[source_face_id]], main_triangles, main_low, main_high, margin)
            certificate["source_face_id"] = int(source_face_id)
            certificate["ambiguous_dominant_source_face_ids"] = groups[0][certificate.pop("ambiguous_dominant_local_face_ids")].tolist()
            triangle_certificates.append(certificate)
        all_separated = bool(all(c["all_triangle_pairs_separated"] for c in triangle_certificates))
        ambiguous_count = sum(c["ambiguous_pair_count"] for c in triangle_certificates)
        certificate = {"component_id": component_id, "source_face_ids": source_face_ids.tolist(),
                       "source_face_membership_sha256_u64le": digest(np.asarray(source_face_ids, dtype="<u8").tobytes()),
                       "vertex_count": len(vertex_ids), "source_vertex_ids": vertex_ids.tolist(),
                       "vertex_winding_numbers": windings,
                       "winding_abs_min": min(abs(w) for w in windings),
                       "winding_abs_max": max(abs(w) for w in windings),
                       "all_vertices_winding_inside": all_winding_inside,
                       "all_vertices_strictly_inside": bool(all_winding_inside and all_separated and invariants["closed_oriented_triangle_cycle"]),
                       "all_triangle_pairs_separated": all_separated,
                       "ambiguous_pair_count": ambiguous_count,
                       "minimum_certified_surface_separation_lower_bound": min(c["separation_distance_lower_bound"] for c in triangle_certificates),
                       "triangle_certificates": triangle_certificates,
                       "safe_for_candidate_removal": bool(all_winding_inside and all_separated and invariants["closed_oriented_triangle_cycle"])}
        certificates.append(certificate)
        print(json.dumps({"phase": "component certified", "component_id": component_id, "vertices": len(vertex_ids),
                          "triangles": len(source_face_ids), "all_vertices_winding_inside": all_winding_inside,
                          "all_triangle_pairs_separated": all_separated, "ambiguous_pair_count": ambiguous_count,
                          "lower_bound": certificate["minimum_certified_surface_separation_lower_bound"]}), flush=True)
    safe = all(c["safe_for_candidate_removal"] for c in certificates)
    proven = [c["component_id"] for c in certificates if c["safe_for_candidate_removal"]]
    proven_face_ids = np.sort(np.concatenate([groups[i-1] for i in proven])).astype("<u8") if proven else np.array([], dtype="<u8")
    after = digest(args.input.read_bytes())
    if after != digest(raw):
        raise RuntimeError("Input changed during proof")
    report = {"schema": "crwt.v11.interior_containment_certificate.v1", "source_file": str(args.input.resolve()),
              "source_sha256": digest(raw), "source_bytes": len(raw),
              "source_position_accessor_sha256": pmeta["raw_attribute_sha256"],
              "source_indices_accessor_sha256": imeta["raw_attribute_sha256"],
              "input_unchanged": True, "safe_for_candidate_removal": safe,
              "requested_component_ids": TARGET_COMPONENTS,
              "excluded_external_component_ids": [2, 3, 4, 9],
              "proven_interior_component_ids": proven, "proven_interior_face_count": len(proven_face_ids),
              "proven_interior_source_face_ids": proven_face_ids.tolist(),
              "proven_interior_source_face_ids_sha256_u64le": digest(proven_face_ids.tobytes()),
              "main_surface_invariants": invariants,
              "margin_model_units": margin, "geometry_scale_model_units": scale,
              "method": "Every selected source vertex: generalized winding number against dominant closed oriented triangle cycle, |w| near1. Every selected triangle versus EVERY dominant triangle: AABB gap certificate or interval/error-guarded separating-axis projection certificate with Euclidean separation lower bound greater than margin. No nearest-neighbor sampling and no broad-phase candidate pairs dropped without a gap certificate.",
              "numerical_guard": "Source POSITION float32 values read exactly into float64. Projection dot bounds use outward-rounded gamma8 error intervals. Arbitrary computed nonzero axes suffice to establish separation; axis accuracy relative to a mathematical normal is not required. Normal lengths rounded conservatively upward. Strict margin=source scale*1e-7 exceeds float64 operation error.",
              "triangle_interior_argument": "A selected triangle is connected. Its vertices lie in the winding-one region and its entire surface is strictly separated from all dominant triangles. Winding cannot change across any continuous path on that triangle without crossing the dominant surface, so every point of the triangle stays in the same interior region.",
              "scope_limit": "Proof supports a separately reviewed diagnostic candidate removing only the listed interior surface fragments. It does not prove dominant-mesh global self-intersection absence, production topology, hair/eye/hand fidelity, rig readiness or game approval. Original mesh remains intact.",
              "component_certificates": certificates, "elapsed_seconds": time.perf_counter()-started}
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({"safe_for_candidate_removal": safe, "proven_components": proven,
                      "proven_faces": len(proven_face_ids), "proof_path": str(args.out.resolve()),
                      "proof_sha256": digest(args.out.read_bytes()), "elapsed_seconds": report["elapsed_seconds"]}), flush=True)


if __name__ == "__main__":
    main()

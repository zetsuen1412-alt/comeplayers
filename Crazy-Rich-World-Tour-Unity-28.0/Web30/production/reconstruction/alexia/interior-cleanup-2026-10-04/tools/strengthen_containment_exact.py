"""Add exact-binary rational ray parity to an existing exhaustive certificate.

Reads and preserves the parent certificate. Exact integer arithmetic classifies
ray/triangle intersection on the original float32 geometry, using positive-X
integer-shear rays and retries for projected edge/vertex contacts. Conservative
projection intervals are only a broad phase: no pair is excluded without a
strict interval separation. Outputs a NEW certificate; never exports a mesh.
"""
import argparse
import copy
import hashlib
import json
from pathlib import Path

import numpy as np
from prove_interior_islands import get_source, digest, next_down, next_up, GAMMA8


RAYS = [(0, 0), (1, 2), (3, 5), (7, 11), (13, 17)]


def projection_bounds(triangles, dy, dz):
    x, y, z = triangles[:, :, 0], triangles[:, :, 1], triangles[:, :, 2]
    u, v = y-dy*x, z-dz*x
    eu = next_up(GAMMA8*next_up(np.abs(y)+abs(dy)*np.abs(x)))
    ev = next_up(GAMMA8*next_up(np.abs(z)+abs(dz)*np.abs(x)))
    low = np.column_stack([next_down(u-eu).min(axis=1), next_down(v-ev).min(axis=1)])
    high = np.column_stack([next_up(u+eu).max(axis=1), next_up(v+ev).max(axis=1)])
    return low, high


def point_projection_bounds(point, dy, dz):
    x, y, z = point
    p = np.array([y-dy*x, z-dz*x])
    error = next_up(GAMMA8*next_up(np.array([abs(y)+abs(dy)*abs(x), abs(z)+abs(dz)*abs(x)])))
    return next_down(p-error), next_up(p+error)


def integer_coordinates(points):
    # All denominators are powers of two, so the maximum is a common multiple.
    ratios = [[float(value).as_integer_ratio() for value in point] for point in points]
    denominator = max(pair[1] for row in ratios for pair in row)
    return [[n*(denominator//d) for n, d in row] for row in ratios]


def orient2(a, b, c):
    return (b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0])


def exact_ray_triangle(point, triangle, dy, dz):
    integers = integer_coordinates([*triangle, point])
    projected = [(y-dy*x, z-dz*x) for x, y, z in integers]
    a, b, c, p = projected
    denominator = orient2(a, b, c)
    u, v, w = orient2(b, c, p), orient2(c, a, p), orient2(a, b, p)
    if denominator == 0:
        if u == 0 and v == 0 and w == 0:
            # Collinear projection can mean a coplanar ray. Only exact bounds
            # exclusion is safe here; otherwise use a different ray direction.
            inside_bounds = all(min(q[i] for q in (a, b, c)) <= p[i] <= max(q[i] for q in (a, b, c)) for i in range(2))
            return "ambiguous" if inside_bounds else "miss"
        return "miss"
    inclusive = (u >= 0 and v >= 0 and w >= 0) or (u <= 0 and v <= 0 and w <= 0)
    if not inclusive:
        return "miss"
    if u == 0 or v == 0 or w == 0:
        return "ambiguous"
    px = integers[3][0]
    numerator = u*(integers[0][0]-px) + v*(integers[1][0]-px) + w*(integers[2][0]-px)
    if numerator == 0:
        return "ambiguous"
    return "positive_intersection" if (numerator > 0) == (denominator > 0) else "behind"


def exact_parity(point, main_triangles, main_source_ids, caches):
    attempts = []
    for dy, dz in RAYS:
        if (dy, dz) not in caches:
            caches[(dy, dz)] = projection_bounds(main_triangles, dy, dz)
        low, high = caches[(dy, dz)]
        point_low, point_high = point_projection_bounds(point, dy, dz)
        candidates = np.flatnonzero(np.all(high >= point_low, axis=1) & np.all(low <= point_high, axis=1))
        intersections, ambiguous = [], []
        for face_id in candidates:
            result = exact_ray_triangle(point, main_triangles[face_id], dy, dz)
            if result == "positive_intersection":
                intersections.append(int(main_source_ids[face_id]))
            elif result == "ambiguous":
                ambiguous.append(int(main_source_ids[face_id]))
        attempt = {"ray_direction_xyz": [1, dy, dz], "broad_phase_candidate_count": len(candidates),
                   "positive_intersection_source_face_ids": intersections,
                   "positive_intersections": len(intersections),
                   "ambiguous_source_face_ids": ambiguous, "ambiguous_pair_count": len(ambiguous)}
        attempts.append(attempt)
        if not ambiguous:
            return {"exact_inside": len(intersections) % 2 == 1,
                    "exact_parity": len(intersections) % 2,
                    "classification": "inside" if len(intersections) % 2 else "outside",
                    "attempts": attempts}
    return {"exact_inside": False, "exact_parity": None,
            "classification": "uncertain: every ray had an exact boundary contact", "attempts": attempts}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("--parent-proof", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    if args.out.resolve() == args.parent_proof.resolve():
        raise ValueError("Must preserve parent certificate and use a new output path")
    parent_bytes = args.parent_proof.read_bytes()
    proof = json.loads(parent_bytes)
    raw, vertices, faces, groups, _, _ = get_source(args.input)
    if proof["source_sha256"] != digest(raw) or not proof["safe_for_candidate_removal"]:
        raise ValueError("Parent proof must be valid for this exact source")
    main_source_ids = groups[0]
    main_triangles = vertices[faces[main_source_ids]]
    caches, results = {}, []
    for certificate in proof["component_certificates"]:
        expected_faces = groups[certificate["component_id"]-1].tolist()
        if certificate["source_face_ids"] != expected_faces:
            raise ValueError("Component membership differs from original source")
        source_vertex_ids = np.unique(faces[expected_faces])
        vertex_results = []
        for vertex_id in source_vertex_ids:
            r = exact_parity(vertices[vertex_id], main_triangles, main_source_ids, caches)
            r["source_vertex_id"] = int(vertex_id)
            vertex_results.append(r)
        exact_all = all(r["exact_inside"] for r in vertex_results)
        certificate["all_vertices_exact_parity_inside"] = exact_all
        certificate["exact_ray_parity_results"] = vertex_results
        certificate["safe_for_candidate_removal"] = bool(certificate["safe_for_candidate_removal"] and exact_all)
        results += vertex_results
        print(json.dumps({"component_id": certificate["component_id"], "vertices": len(vertex_results),
                          "all_vertices_exact_parity_inside": exact_all,
                          "rays_with_retries": sum(len(r["attempts"]) > 1 for r in vertex_results)}), flush=True)
    proof["schema"] = "crwt.v11.interior_containment_certificate.v2.exact_parity"
    proof["parent_certificate"] = {"path": str(args.parent_proof.resolve()), "sha256": digest(parent_bytes), "preserved_unchanged": args.parent_proof.read_bytes() == parent_bytes}
    proof["exact_ray_parity"] = {"all_vertices_classified_inside": all(r["exact_inside"] for r in results),
                               "vertex_count": len(results), "unknown_vertex_count": sum(r["exact_parity"] is None for r in results),
                               "outside_vertex_count": sum(r["exact_parity"] == 0 for r in results),
                               "rays_with_retries": sum(len(r["attempts"]) > 1 for r in results),
                               "method": "Exact integer ray/triangle orientation, barycentric-sign and ray-depth tests on original binary float32 coordinates. Each finite float is converted by as_integer_ratio to a common power-of-two denominator. Rays have exact integer directions (1,dy,dz). Odd positive-ray crossing parity classifies strict interior; exact edge/vertex/coplanar contact triggers another integer direction. Broad-phase candidate exclusion uses conservative float64 projection intervals, not approximate intersection signs."}
    proof["safe_for_candidate_removal"] = bool(all(c["safe_for_candidate_removal"] for c in proof["component_certificates"]))
    proof["method"] += " Additionally every selected vertex has exact-binary rational odd ray parity, with all geometric intersection decisions performed by Python arbitrary-precision integers."
    if digest(args.input.read_bytes()) != digest(raw) or args.parent_proof.read_bytes() != parent_bytes:
        raise RuntimeError("Input mesh or parent certificate changed during exact proof")
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(proof, indent=2), encoding="utf-8")
    print(json.dumps({"safe_for_candidate_removal": proof["safe_for_candidate_removal"],
                      "exact_ray_parity": proof["exact_ray_parity"],
                      "proof_path": str(args.out.resolve()), "final_proof_sha256": digest(args.out.read_bytes())}), flush=True)


if __name__ == "__main__":
    main()

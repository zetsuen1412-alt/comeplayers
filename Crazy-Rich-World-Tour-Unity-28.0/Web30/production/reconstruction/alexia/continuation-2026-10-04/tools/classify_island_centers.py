"""Read-only winding-number check at separate-island bounds centers.

This locates one sample point per island relative to the dominant closed mesh.
It does not prove containment of an entire island, no self-intersections, or
whether an island has an intended semantic role. No source geometry is edited.
"""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from render_glb_islands import read_geometry


def winding_at_point(triangles, point):
    a, b, c = (triangles[:, i] - point for i in range(3))
    la, lb, lc = (np.linalg.norm(x, axis=1) for x in (a, b, c))
    numerator = np.einsum("ij,ij->i", a, np.cross(b, c))
    denominator = la*lb*lc + np.einsum("ij,ij->i", a, b)*lc + np.einsum("ij,ij->i", b, c)*la + np.einsum("ij,ij->i", c, a)*lb
    return float(np.sum(2*np.arctan2(numerator, denominator)) / (4*np.pi))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    raw, points, faces, _, _, groups = read_geometry(args.input)
    input_hash = hashlib.sha256(raw).hexdigest()
    main_triangles = points[faces[groups[0]]]
    result = []
    for island, group in enumerate(groups[1:], 2):
        vertices = points[np.unique(faces[group])]
        low, high = vertices.min(axis=0), vertices.max(axis=0)
        center = (low+high)/2
        samples = {"bounds_center": center, "surface_vertex_mean": vertices.mean(axis=0)}
        samples.update({f"bounds_{side}_{axis}": center + np.eye(3)[i] * ((high-low)[i]/2) * sign
                        for i, axis in enumerate("xyz") for side, sign in [("max", 1), ("min", -1)]})
        windings = {name: winding_at_point(main_triangles, point) for name, point in samples.items()}
        result.append({"island": island, "triangles": len(group), "bounds_center_xyz": center.tolist(),
                       "winding_samples": windings,
                       "all_eight_samples_inside_main": all(abs(w)>0.5 for w in windings.values()),
                       "all_eight_samples_outside_main": all(abs(w)<0.5 for w in windings.values()),
                       "classification_limit": "Eight sample points only; not a complete vertex/surface containment test. Main mesh self-intersections are untested."})
    after = hashlib.sha256(args.input.read_bytes()).hexdigest()
    if after != input_hash:
        raise RuntimeError("Input changed during analysis")
    output = {"input_sha256": input_hash, "input_unchanged": True,
              "method": "Generalized winding number (solid-angle sum) against dominant component; abs(w)>0.5 classified interior at the sample point only.",
              "semantic_limit": "Interior/occlusion and small size do not establish that deleting a separate island is appropriate.",
              "islands": result}
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(output, indent=2), encoding="utf-8")
    print(json.dumps({"input_sha256": input_hash, "islands": [{"island": r["island"], "center_winding": r["winding_samples"]["bounds_center"], "all_eight_samples_inside_main": r["all_eight_samples_inside_main"], "all_eight_samples_outside_main": r["all_eight_samples_outside_main"]} for r in result]}, indent=2))


if __name__ == "__main__":
    main()

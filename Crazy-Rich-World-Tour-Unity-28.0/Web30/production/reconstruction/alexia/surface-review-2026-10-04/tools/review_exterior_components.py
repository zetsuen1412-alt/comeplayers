"""Read-only exterior island inventory and honest diagnostic image crops.

No GLB is exported or edited. Crop coordinates and source hashes are recorded;
cropped illustrations are not calibrated registration or deletion approval.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
from audit_glb_components import load_glb, read_accessor, UnionFind

SOURCE_SHA = "d0a0fea651079aa98d026a1610ef0a9e7f4c14c0c466cb1d949886df45c24a66"
REFERENCE_SHA = "935b1f8f7d2be4a6a453a089041844f2cd4470eb64be17d9d72568efb3708933"
IDS = (2, 3, 4, 9)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def font(size):
    try:
        return ImageFont.truetype(r"C:\Windows\Fonts\arial.ttf", size)
    except OSError:
        return ImageFont.load_default()


def source_image(path):
    raw = path.read_bytes()
    image = Image.open(path).convert("RGB")
    return image, {"path": str(path.resolve()), "sha256": sha(raw), "size": list(image.size)}


def fit(image, width, height):
    result = image.copy()
    result.thumbnail((width, height), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (width, height), "white")
    canvas.paste(result, ((width-result.width)//2, (height-result.height)//2))
    return canvas


def parse_inputs():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--production-root", type=Path, required=True,
                        help="Project Web30/production directory containing original V11, V2 and captures")
    parser.add_argument("--audit", type=Path, required=True,
                        help="Existing original V11 component audit JSON")
    parser.add_argument("--locations", type=Path, required=True,
                        help="Existing 1500x2298 original component location render")
    parser.add_argument("--out-dir", type=Path, required=True,
                        help="New directory for this run; existing directories are refused")
    args = parser.parse_args()
    production = args.production_root.resolve(strict=True)
    if not production.is_dir():
        parser.error("--production-root must be an existing directory")
    original = production / "reconstruction/alexia/v11-hunyuan21-diagnostic/alexia-v11-hunyuan21-untextured-diagnostic.glb"
    reference = production / "turnarounds/alexia/turnaround-blue-imagegen-v2.png"
    captures = production / "reconstruction/alexia/nano-banana-ui-review"
    audit_path = args.audit.resolve(strict=True)
    locations = args.locations.resolve(strict=True)
    input_files = [original, reference, audit_path, locations]
    input_files += [captures / f"nano-banana-{label}-capture.jpg" for label in ("back", "left", "right", "front")]
    for path in input_files:
        if not path.is_file():
            parser.error(f"Required input file is missing: {path}")
    out = args.out_dir.resolve()
    if out.exists():
        parser.error("--out-dir already exists; choose a new directory so previous evidence cannot be overwritten")
    for source in input_files:
        resolved = source.resolve(strict=True)
        if out == resolved or out in resolved.parents:
            parser.error("--out-dir must be distinct from input assets and their containing directories")
    # Check exact sources before creating the explicitly requested output directory.
    if sha(original.read_bytes()) != SOURCE_SHA or sha(reference.read_bytes()) != REFERENCE_SHA:
        parser.error("Exact reviewed source/reference hash mismatch")
    with Image.open(locations) as image:
        if image.size != (1500, 2298):
            parser.error("--locations must be the original 1500x2298 location render; crop math depends on it")
    out.mkdir(parents=True, exist_ok=False)
    return original, reference, captures, audit_path, locations, out


def main():
    ORIGINAL, REFERENCE, CAPTURES, AUDIT, LOCATIONS, OUT = parse_inputs()
    raw, doc, binary, _ = load_glb(ORIGINAL)
    if sha(raw) != SOURCE_SHA or sha(REFERENCE.read_bytes()) != REFERENCE_SHA:
        raise ValueError("Exact reviewed source/reference hash mismatch")
    primitive = doc["meshes"][0]["primitives"][0]
    if primitive.get("mode", 4) != 4:
        raise ValueError("Expected the reviewed triangle primitive")
    points = read_accessor(doc, binary, primitive["attributes"]["POSITION"])[0].astype(np.float64)
    faces = read_accessor(doc, binary, primitive["indices"])[0].reshape(-1, 3).astype(np.int64)
    # The original audited world transform is exactly identity.
    audit = json.loads(AUDIT.read_text(encoding="utf-8"))
    if audit["primitives"][0]["world_transform"] != np.eye(4).tolist():
        raise ValueError("This diagnostic assumes the independently audited identity transform")
    union = UnionFind(len(points))
    for a, b, c in faces:
        union.union(int(a), int(b))
        union.union(int(a), int(c))
    roots = np.array([union.find(int(face[0])) for face in faces])
    root_ids, counts = np.unique(roots, return_counts=True)
    order = sorted(range(len(root_ids)), key=lambda i: (-int(counts[i]), int(root_ids[i])))
    groups = [np.flatnonzero(roots == root_ids[i]) for i in order]
    height = float(np.ptp(points[:, 1]))
    components = []
    for cid in IDS:
        source_face_ids = groups[cid-1]
        audit_component = audit["indexed_edge_components"][cid-1]
        membership_hash = sha(source_face_ids.astype("<u8").tobytes())
        if membership_hash != audit_component["triangle_membership_sha256"]:
            raise ValueError(f"Component {cid} source membership diverges from original audit")
        vertex_ids = np.unique(faces[source_face_ids])
        component_points = points[vertex_ids]
        centered = component_points-component_points.mean(axis=0)
        eig_values, eig_vectors = np.linalg.eigh(centered.T @ centered / len(centered))
        axes = eig_vectors[:, ::-1]
        projected = centered @ axes
        pca_extents = np.ptp(projected, axis=0)
        components.append({
            "component_id": cid,
            "source_face_ids": source_face_ids.tolist(),
            "source_face_membership_u64le_sha256": membership_hash,
            "vertices": int(len(vertex_ids)), "faces": int(len(source_face_ids)),
            "bounds_min": component_points.min(axis=0).tolist(),
            "bounds_max": component_points.max(axis=0).tolist(),
            "bounds_center": ((component_points.min(axis=0)+component_points.max(axis=0))/2).tolist(),
            "world_extent_xyz": np.ptp(component_points, axis=0).tolist(),
            "extent_fraction_of_character_height": (np.ptp(component_points, axis=0)/height).tolist(),
            "surface_area": audit_component["surface_area"],
            "area_fraction_of_original_mesh": audit_component["area_fraction"],
            "signed_volume_if_closed": audit_component["signed_volume_if_closed"],
            "pca_axis_extents": pca_extents.tolist(),
            "pca_smallest_to_largest_extent_ratio": float(min(pca_extents)/max(pca_extents)),
            "pca_method": "Unweighted actual vertex covariance; extents of actual vertices projected on eigenvectors, no best-fit semantic part assignment",
            "closed_edge_manifold": audit_component["closed_edge_manifold"],
            "action_for_review": "keep_excluded_from_hair_ablation" if cid == 9 else "optional_ablation_candidate_only",
        })
    sheets = []
    crops = []
    original_ref, ref_info = source_image(REFERENCE)
    # The canonical reference has six rendered 2D drafts, not calibrated cameras.
    ref_boxes = {"V2 front": (0, 0, 512, 489), "V2 back": (1024, 489, 1536, 1024),
                 "V2 side faces LEFT": (1024, 0, 1536, 489), "V2 side faces RIGHT": (0, 489, 512, 1024)}
    panels = []
    for label, box in ref_boxes.items():
        panels.append((label, original_ref.crop(box)))
        crops.append({"label": label, "source": ref_info, "box_xyxy": list(box)})
    for label in ("back", "left", "right", "front"):
        image, info = source_image(CAPTURES/f"nano-banana-{label}-capture.jpg")
        panels.append((f"Nano Banana capture: {label}", image))
        crops.append({"label": f"Nano Banana {label}", "source": info, "box_xyxy": [0, 0, image.width, image.height]})
    sheet = Image.new("RGB", (1600, 965), "white")
    draw = ImageDraw.Draw(sheet)
    for i, (label, image) in enumerate(panels):
        x, y = i % 4 * 400, i // 4 * 442
        sheet.paste(fit(image, 400, 400), (x, y+42))
        draw.text((x+8, y+10), label, fill=(22, 32, 49), font=font(17))
    draw.text((15, 900), "Actual hashed reference/captures. Panels fit independently; poses and camera projections are not registered.", fill=(22, 32, 49), font=font(18))
    draw.text((15, 930), "V2 hidden views are 2D design drafts; Nano Banana hair roots, locks, pose and scale differ across views.", fill=(22, 32, 49), font=font(18))
    ref_sheet = OUT/"reference-capture-comparison.png"
    sheet.save(ref_sheet)
    sheets.append({"path": str(ref_sheet.resolve()), "sha256": sha(ref_sheet.read_bytes())})

    location_image, loc_info = source_image(LOCATIONS)
    # Matches render_glb_islands.py shared camera and panel size exactly.
    rotation = np.diag([-1., 1., -1.])
    camera_points = points @ rotation.T
    low, high = camera_points.min(axis=0), camera_points.max(axis=0)
    center = (low+high)/2
    half_y = max((high-low)[1]/2, (high-low)[0]/2 * 1020/750)*1.15
    half_x = half_y*750/1020
    context_sheet = Image.new("RGB", (1200, 880), "white")
    draw = ImageDraw.Draw(context_sheet)
    for i, component in enumerate(components):
        cid = component["component_id"]
        source_face_ids = np.array(component["source_face_ids"])
        if cid == 9:
            local_rotation, panel_x = np.eye(3), 0
            transformed = points @ local_rotation.T
            local_center = (transformed.min(axis=0)+transformed.max(axis=0))/2
            view_label = "FRONT +Z"
        else:
            local_rotation, panel_x, local_center = rotation, 750, center
            view_label = "BACK -Z"
        cp = points[np.unique(faces[source_face_ids])] @ local_rotation.T
        xy = (cp-local_center)[:, :2]/[half_x, half_y]
        pixels = np.column_stack(((xy[:, 0]+1)*375+panel_x, (1-xy[:, 1])*510+64))
        # A fixed 170px source context is enlarged consistently for each island.
        cx, cy = ((pixels.min(axis=0)+pixels.max(axis=0))/2).tolist()
        box = (round(cx-85), round(cy-85), round(cx+85), round(cy+85))
        image = location_image.crop(box).resize((390, 390), Image.Resampling.NEAREST)
        x, y = i % 2 * 600, i // 2 * 410
        context_sheet.paste(image, (x+15, y+10))
        draw.text((x+415, y+40), f"Component {cid}", fill=(22, 32, 49), font=font(18))
        draw.text((x+415, y+70), f"{component['faces']} faces", fill=(22, 32, 49), font=font(17))
        draw.text((x+415, y+102), view_label, fill=(22, 32, 49), font=font(17))
        draw.text((x+415, y+135), "Marker enlarged", fill=(70, 77, 90), font=font(15))
        draw.text((x+415, y+160), "for visibility", fill=(70, 77, 90), font=font(15))
        if cid == 9:
            draw.text((x+415, y+215), "Actual shard", fill=(70, 77, 90), font=font(15))
            draw.text((x+415, y+238), "is much smaller", fill=(70, 77, 90), font=font(15))
            draw.text((x+415, y+275), "Keep: front eye", fill=(22, 32, 49), font=font(15))
            draw.text((x+415, y+298), "or bang region", fill=(22, 32, 49), font=font(15))
        crops.append({"label": f"Actual V11 {view_label} context component {cid}", "source": loc_info,
                      "box_xyxy": list(box), "scale": 390/170,
                      "component_projected_pixels_bbox": [pixels.min(axis=0).tolist(), pixels.max(axis=0).tolist()],
                      "marker_is_enlarged_and_ignores_depth": True})
    draw.text((15, 835), "Actual original triangles, component colors for diagnosis. Crops are equally scaled; markers are not real geometry.", fill=(22, 32, 49), font=font(17))
    context_path = OUT/"exterior-island-context.png"
    context_sheet.save(context_path)
    sheets.append({"path": str(context_path.resolve()), "sha256": sha(context_path.read_bytes())})
    ablation_ids = np.concatenate([groups[cid-1] for cid in (2, 3, 4)])
    ablation_ids.sort()
    report = {
        "schema": "crwt.exterior_components_read_only_review.v1",
        "source_glb": str(ORIGINAL.resolve()), "source_sha256": SOURCE_SHA,
        "reference": ref_info, "input_geometry_unchanged": sha(ORIGINAL.read_bytes()) == SOURCE_SHA,
        "geometry_exported_or_modified": False,
        "safe_for_automatic_removal": False, "visual_final_approved": False,
        "recommendation": "Create a separately labeled 2/3/4 ablation candidate for visual comparison only; retain component 9 and the original/interior candidate",
        "proposed_ablation_component_ids": [2, 3, 4], "proposed_ablation_face_count": int(len(ablation_ids)),
        "proposed_ablation_source_face_ids": ablation_ids.tolist(),
        "proposed_ablation_source_face_membership_u64le_sha256": sha(ablation_ids.astype("<u8").tobytes()),
        "explicit_keep_component_ids": [1, 9], "components": components,
        "images": sheets, "crops": crops,
        "limits": ["No exact cross-view correspondence or camera registration from these generated 2D sources",
                   "Existing 8-sample winding result establishes sampled positions only, not full exterior surface containment",
                   "No permanent artistic hair-volume decision or eye repair follows from component size/connectivity",
                   "Removing detached blobs would leave the large connected hair loops and fused hands unchanged"],
    }
    output = OUT/"exterior-component-review.json"
    output.write_text(json.dumps(report, indent=2)+"\n", encoding="utf-8")
    print(json.dumps({"report": str(output), "report_sha256": sha(output.read_bytes()),
                      "proposed_ablation_faces": len(ablation_ids), "source_unchanged": report["input_geometry_unchanged"],
                      "components": [{k:c[k] for k in ("component_id", "faces", "world_extent_xyz", "pca_axis_extents", "surface_area")} for c in components]}))


if __name__ == "__main__":
    main()

"""Render actual GLB islands read-only with depth-tested ModernGL.

No texture synthesis, mesh export, welding, filtering or deletion. Marker circles
show projected island centers and intentionally ignore depth; lower panels hide
the main component only for inspection. Every input triangle stays in the source.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent
import numpy as np
import moderngl
from PIL import Image, ImageDraw, ImageFont

from audit_glb_components import load_glb, read_accessor, instances, triangulate, UnionFind


PALETTE = np.array([
    [0.60, 0.63, 0.68], [0.91, 0.15, 0.15], [0.10, 0.42, 0.90],
    [0.77, 0.19, 0.82], [0.05, 0.66, 0.37], [0.94, 0.52, 0.02],
    [0.02, 0.65, 0.73], [0.58, 0.29, 0.10], [0.81, 0.63, 0.03],
    [0.97, 0.25, 0.55],
], dtype=np.float32)


def read_geometry(path):
    raw, doc, binary, _ = load_glb(path)
    points, faces = [], []
    base = 0
    for _, mesh_id, matrix, _ in instances(doc):
        for primitive in doc["meshes"][mesh_id]["primitives"]:
            if primitive.get("mode", 4) not in (4, 5, 6):
                continue
            local, _ = read_accessor(doc, binary, primitive["attributes"]["POSITION"])
            world = local @ matrix[:3, :3].T + matrix[:3, 3]
            indices = read_accessor(doc, binary, primitive["indices"])[0].reshape(-1) if "indices" in primitive else np.arange(len(local))
            tri = triangulate(indices.astype(np.int64), primitive.get("mode", 4))
            points.append(world)
            faces.append(tri + base)
            base += len(world)
    points, faces = np.concatenate(points), np.concatenate(faces)
    union = UnionFind(len(points))
    for a, b, c in faces:
        union.union(int(a), int(b))
        union.union(int(a), int(c))
    roots = np.array([union.find(int(f[0])) for f in faces])
    ids, inverse, counts = np.unique(roots, return_inverse=True, return_counts=True)
    order = sorted(range(len(ids)), key=lambda i: (-int(counts[i]), int(ids[i])))
    rank = np.empty(len(order), dtype=np.int64)
    rank[order] = np.arange(len(order))
    face_components = rank[inverse]
    vertex_components = np.zeros(len(points), dtype=np.int64)
    for col in range(3):
        vertex_components[faces[:, col]] = face_components
    normals = np.zeros_like(points)
    tri_points = points[faces]
    cross = np.cross(tri_points[:, 1]-tri_points[:, 0], tri_points[:, 2]-tri_points[:, 0])
    for col in range(3):
        np.add.at(normals, faces[:, col], cross)
    normals /= np.maximum(np.linalg.norm(normals, axis=1, keepdims=True), 1e-20)
    groups = [np.flatnonzero(face_components == i) for i in range(len(order))]
    return raw, points, faces, normals, vertex_components, groups


def rotation_y(angle):
    c, s = np.cos(np.deg2rad(angle)), np.sin(np.deg2rad(angle))
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def rotation_x(angle):
    c, s = np.cos(np.deg2rad(angle)), np.sin(np.deg2rad(angle))
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])


class Renderer:
    def __init__(self):
        self.ctx = moderngl.create_standalone_context(require=330)
        self.program = self.ctx.program(vertex_shader='''
            #version 330
            in vec3 in_position;
            in vec3 in_normal;
            in vec3 in_color;
            out vec3 v_normal;
            out vec3 v_color;
            void main() {
                gl_Position = vec4(in_position, 1.0);
                v_normal = in_normal;
                v_color = in_color;
            }
        ''', fragment_shader='''
            #version 330
            in vec3 v_normal;
            in vec3 v_color;
            out vec4 fragColor;
            void main() {
                vec3 n = normalize(v_normal);
                float diffuse = abs(dot(n, normalize(vec3(.30, .45, .84))));
                fragColor = vec4(v_color * (.30 + .70 * diffuse), 1.0);
            }
        ''')

    def render(self, points, triangles, normals, colors, size, rotation, bounds_points=None):
        width, height = size
        camera_points = points @ rotation.T
        frame_points = camera_points if bounds_points is None else bounds_points @ rotation.T
        low, high = frame_points.min(axis=0), frame_points.max(axis=0)
        center = (low+high)/2
        extent = high-low
        half_y = max(extent[1]/2, extent[0]/2 * height/width, 1e-8) * 1.15
        half_x = half_y * width/height
        half_z = max(extent[2]/2, half_y/2, 1e-8) * 1.3
        clip = (camera_points-center) / np.array([half_x, half_y, -half_z])
        attributes = np.concatenate([clip, normals @ rotation.T, colors], axis=1).astype("f4")
        vbo = self.ctx.buffer(attributes.tobytes())
        ibo = self.ctx.buffer(np.asarray(triangles, dtype="u4").tobytes())
        vao = self.ctx.vertex_array(self.program, [(vbo, "3f 3f 3f", "in_position", "in_normal", "in_color")], ibo)
        fbo = self.ctx.simple_framebuffer((width, height), components=4)
        fbo.use()
        fbo.clear(0.975, 0.978, 0.985, 1.0, depth=1.0)
        self.ctx.enable(moderngl.DEPTH_TEST)
        self.ctx.disable(moderngl.CULL_FACE | moderngl.BLEND)
        vao.render(moderngl.TRIANGLES)
        result = Image.frombytes("RGBA", (width, height), fbo.read(components=4)).transpose(Image.Transpose.FLIP_TOP_BOTTOM).convert("RGB")
        fbo.release()
        vao.release()
        ibo.release()
        vbo.release()
        return result, clip


def get_font(size):
    for path in [r"C:\Windows\Fonts\arial.ttf", r"C:\Windows\Fonts\segoeui.ttf"]:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            pass
    return ImageFont.load_default()


def markers(image, centers, rotation, frame_points, labels=True):
    width, height = image.size
    transformed = frame_points @ rotation.T
    low, high = transformed.min(axis=0), transformed.max(axis=0)
    center = (low+high)/2
    half_y = max((high-low)[1]/2, (high-low)[0]/2 * height/width, 1e-8) * 1.15
    half_x = half_y * width/height
    xy = ((centers @ rotation.T)-center)[:, :2]/[half_x, half_y]
    pixels = np.column_stack(((xy[:, 0]+1)*width/2, (1-xy[:, 1])*height/2))
    draw = ImageDraw.Draw(image)
    font = get_font(17)
    # Main-component center is intentionally omitted.
    for i, (x, y) in enumerate(pixels[1:], 1):
        color = tuple((PALETTE[i % len(PALETTE)] * 255).astype(int).tolist())
        x, y = float(x), float(y)
        draw.ellipse((x-7, y-7, x+7, y+7), outline=color, width=3)
        if labels:
            offset_x = 14 if i % 2 else -26
            offset_y = -22 if i % 3 == 0 else 8
            draw.text((x+offset_x, y+offset_y), str(i+1), fill=color, font=font,
                      stroke_width=2, stroke_fill="white")
    return image


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    raw, points, faces, normals, ids, groups = read_geometry(args.input)
    before = hashlib.sha256(raw).hexdigest()
    colors = PALETTE[ids % len(PALETTE)]
    centers = np.array([(points[np.unique(faces[g])].min(axis=0) + points[np.unique(faces[g])].max(axis=0))/2 for g in groups])
    renderer = Renderer()
    size = (750, 1020)
    header = 64
    sheet = Image.new("RGB", (size[0]*2, (size[1]+header)*2+130), "white")
    draw = ImageDraw.Draw(sheet)
    panels = [("FRONT +Z / all original triangles", 0, False),
              ("BACK -Z / all original triangles", 180, False),
              ("FRONT +Z / nine islands isolated", 0, True),
              ("BACK -Z / nine islands isolated", 180, True)]
    isolated_face_ids = np.concatenate(groups[1:])
    for i, (label, angle, isolated) in enumerate(panels):
        selected = faces[isolated_face_ids] if isolated else faces
        rotation = rotation_y(angle)
        img, _ = renderer.render(points, selected, normals, colors, size, rotation)
        markers(img, centers, rotation, points)
        left, top = i % 2 * size[0], i // 2 * (size[1]+header)
        sheet.paste(img, (left, top+header))
        draw.text((left+22, top+17), label, font=get_font(26), fill=(23, 32, 53))
    draw.text((24, sheet.height-115), "Actual V11 geometry. Circles identify island centers; marker size is enlarged for visibility.", font=get_font(21), fill=(33, 39, 52))
    draw.text((24, sheet.height-80), "Lower panels isolate geometry for inspection. Input GLB unchanged. Colors identify components, not materials.", font=get_font(19), fill=(33, 39, 52))
    draw.text((24, sheet.height-45), f"SHA256 {before}", font=get_font(16), fill=(53, 63, 82))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    location_path = Path(str(args.out) + "-locations.png")
    sheet.save(location_path)
    tile_size = (450, 355)
    zoom_sheet = Image.new("RGB", (1350, 3*(tile_size[1]+65)+80), "white")
    draw = ImageDraw.Draw(zoom_sheet)
    for i, group in enumerate(groups[1:], 1):
        vertex_ids = np.unique(faces[group])
        rotation = rotation_x(20) @ rotation_y(30)
        img, _ = renderer.render(points, faces[group], normals, colors, tile_size, rotation, bounds_points=points[vertex_ids])
        left, top = (i-1) % 3 * tile_size[0], (i-1) // 3 * (tile_size[1]+65)
        zoom_sheet.paste(img, (left, top+65))
        draw.text((left+15, top+8), f"Island {i+1} / {len(group):,} triangles", font=get_font(23), fill=(23, 32, 53))
        draw.text((left+15, top+36), "center " + ", ".join(f"{x:.4f}" for x in centers[i]), font=get_font(17), fill=(53, 63, 82))
    draw.text((20, zoom_sheet.height-60), "Actual separate islands enlarged individually at DIFFERENT scales. Orthographic oblique view.", font=get_font(21), fill=(33, 39, 52))
    draw.text((20, zoom_sheet.height-30), "Closed small surfaces may be interior/occluded geometry; size alone does not justify removal.", font=get_font(20), fill=(33, 39, 52))
    isolated_path = Path(str(args.out) + "-isolated.png")
    zoom_sheet.save(isolated_path)
    after = hashlib.sha256(args.input.read_bytes()).hexdigest()
    if before != after:
        raise RuntimeError("Input changed during rendering")
    evidence = {"input_sha256": before, "input_unchanged": True,
                "actual_geometry": True, "depth_tested": True,
                "renderer": renderer.ctx.info.get("GL_RENDERER"),
                "front_camera": "+Z looking toward -Z; image X=source X, up=source Y",
                "back_camera": "-Z looking toward +Z; image X=-source X, up=source Y",
                "all_triangles": len(faces), "component_face_counts": [len(g) for g in groups],
                "marker_note": "Enlarged center markers, superimposed irrespective of depth; circles do not depict actual island size",
                "isolation_note": "Main component omitted in isolated inspection panels only; no model was exported/edited",
                "paths": [str(location_path.resolve()), str(isolated_path.resolve())]}
    Path(str(args.out) + "-render-evidence.json").write_text(json.dumps(evidence, indent=2), encoding="utf-8")
    print(json.dumps(evidence, indent=2))


if __name__ == "__main__":
    main()

"""Blender: build a volumetric Pip review scene beside the preserved original roster.

This is a source-guided hard-surface reconstruction, not visual approval. The
original scene, ten original meshes and their actions remain in the saved blend.
The candidate export contains only the new mechanical suitcase family.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import struct
import sys
from pathlib import Path

import bpy
from mathutils import Vector

SOURCE_SHA = "c2ceab85a941585bf5d6189b250646a7647893e1fe3063d80fa7faa649c4dea4"
REFERENCE_SHA = "d3559fe6948cc5a1befffba7f779d46138517394dcb53f2deb0ce0be113c719e"
PREFIX = "PipReview | "
PARTS = []
MATERIALS = {}
RIG = None
COLLECTION = None
CASE_WIDTH = 1.07
COMPANION_OFFSET = (-0.47, -0.08)
WHEEL_CENTER = 0.064


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--reference", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--expected-source-sha256", default=SOURCE_SHA)
    parser.add_argument("--confirm-reference-guided-candidate", action="store_true")
    result = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    if not result.confirm_reference_guided_candidate:
        parser.error("Use --confirm-reference-guided-candidate for this unapproved review export.")
    result.source = result.source.resolve(strict=True)
    result.reference = result.reference.resolve(strict=True)
    result.output_dir = result.output_dir.resolve()
    if sha(result.source) != result.expected_source_sha256 or sha(result.reference) != REFERENCE_SHA:
        parser.error("Source/reference identity mismatch.")
    if result.output_dir == result.source.parent or result.source.is_relative_to(result.output_dir):
        parser.error("Output must be an isolated directory that does not contain the source.")
    if result.output_dir.exists() and any(result.output_dir.iterdir()):
        parser.error("Output directory must be fresh and empty; no existing asset will be replaced.")
    return result


def original_fingerprint(objects):
    """Record original datablocks and actual mesh positions/topology, without evaluation."""
    result = {}
    for obj in objects:
        d = {"type": obj.type, "matrix_basis": [float(v) for row in obj.matrix_basis for v in row],
             "parent": obj.parent.name if obj.parent else None,
             "action": obj.animation_data.action.name if obj.animation_data and obj.animation_data.action else None}
        if obj.type == "MESH":
            h = hashlib.sha256()
            for vert in obj.data.vertices:
                h.update(struct.pack("<3f", *vert.co))
            for poly in obj.data.polygons:
                h.update(struct.pack("<I", len(poly.vertices)))
                h.update(struct.pack("<" + "I" * len(poly.vertices), *poly.vertices))
            d.update(mesh_sha256=h.hexdigest(), materials=[m.name if m else None for m in obj.data.materials],
                     groups=[g.name for g in obj.vertex_groups], modifiers=[(m.name, m.type) for m in obj.modifiers])
        elif obj.type == "ARMATURE":
            d["bones"] = {b.name: [float(v) for row in b.matrix_local for v in row] for b in obj.data.bones}
        result[obj.name] = d
    return result


def material(name, color, metallic=0.0, roughness=0.4, emission=0.0):
    mat = bpy.data.materials.new(PREFIX + name)
    # Palette specifications are visible sRGB; shader sockets require linear RGB.
    linear = tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in color)
    mat.diffuse_color = (*linear, 1)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*linear, 1)
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    if emission:
        shader.inputs["Emission Color"].default_value = (*linear, 1)
        shader.inputs["Emission Strength"].default_value = emission
    if name == "screen":
        shader.inputs["Specular IOR Level"].default_value = 0.12
    if name == "pixels":
        # Digital face is actual emissive mesh. Suppress white studio diffuse/specular
        # so its cyan source color survives lighting instead of becoming porcelain.
        shader.inputs["Base Color"].default_value = (0, 0, 0, 1)
        shader.inputs["Specular IOR Level"].default_value = 0
    MATERIALS[name] = mat
    return mat


def move_to_candidate(obj):
    for col in list(obj.users_collection):
        col.objects.unlink(obj)
    COLLECTION.objects.link(obj)


def finish(obj, name, mat, bone="Body", smooth=False):
    obj.name = PREFIX + name
    move_to_candidate(obj)
    if obj.type != "MESH":
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.convert(target="MESH")
        obj = bpy.context.view_layer.objects.active
    obj.data.materials.append(MATERIALS[mat])
    for poly in obj.data.polygons:
        poly.use_smooth = smooth
    obj["character_id"] = "pip"
    obj["part"] = name
    obj["review_status"] = "REFERENCE_GUIDED_CANDIDATE_NOT_APPROVED"
    obj["mechanical_bone"] = bone
    group = obj.vertex_groups.new(name=bone)
    group.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")
    mod = obj.modifiers.new("Rigid mechanical skin", "ARMATURE")
    mod.object = RIG
    obj.parent = RIG
    PARTS.append(obj)
    return obj


def box(name, location, dimensions, mat, radius=0.01, bone="Body", rotation=None, smooth=False):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.dimensions = dimensions
    if rotation:
        obj.rotation_euler = rotation
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if radius:
        bevel = obj.modifiers.new("Manufactured rounded edges", "BEVEL")
        bevel.width = min(radius, min(dimensions) * 0.48)
        bevel.segments = 6 if radius < 0.03 else 10
        bpy.ops.object.modifier_apply(modifier=bevel.name)
    if smooth:
        for poly in obj.data.polygons:
            poly.use_smooth = True
        normal = obj.modifiers.new("Rounded shell weighted normals", "WEIGHTED_NORMAL")
        normal.keep_sharp = True
        bpy.ops.object.modifier_apply(modifier=normal.name)
    return finish(obj, name, mat, bone, smooth=smooth)


def sphere(name, location, scale, mat, bone="Body"):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, location=location)
    obj = bpy.context.object
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, name, mat, bone, smooth=True)


def cylinder(name, location, radius, depth, mat, bone="Body", axis="Z", vertices=32):
    rotation = {"Z": (0, 0, 0), "X": (0, math.pi / 2, 0), "Y": (math.pi / 2, 0, 0)}[axis]
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object
    bevel = obj.modifiers.new("Machined rim", "BEVEL")
    bevel.width = min(radius * 0.12, depth * 0.2)
    bevel.segments = 3
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    return finish(obj, name, mat, bone, smooth=True)


def tube(name, points, radius, mat, bone="Body", closed=False):
    curve = bpy.data.curves.new(PREFIX + name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 1
    curve.bevel_depth = radius
    curve.bevel_resolution = 3
    curve.use_fill_caps = True
    poly = curve.splines.new("POLY")
    poly.points.add(len(points) - 1)
    for point, xyz in zip(poly.points, points):
        point.co = (*xyz, 1)
    poly.use_cyclic_u = closed
    obj = bpy.data.objects.new(PREFIX + name, curve)
    COLLECTION.objects.link(obj)
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    obj.select_set(False)
    return finish(obj, name, mat, bone, smooth=True)


def round_outline(name, x, y, z, width, height, corner, thickness, mat, bone="Body"):
    points = []
    for cx, cz, start in [(width / 2 - corner, height / 2 - corner, 0),
                          (-width / 2 + corner, height / 2 - corner, 90),
                          (-width / 2 + corner, -height / 2 + corner, 180),
                          (width / 2 - corner, -height / 2 + corner, 270)]:
        for i in range(13):
            angle = math.radians(start + i * 90 / 12)
            points.append((x + cx + corner * math.cos(angle), y, z + cz + corner * math.sin(angle)))
    return tube(name, points, thickness, mat, bone, True)


def extruded_shape(name, points_xz, y, depth, mat, bone="Body"):
    # XZ counterclockwise outlines face Blender -Y; icon contours can arrive in
    # either order. Normalize them so the extrusion has outward surface normals.
    area2 = sum(points_xz[i][0] * points_xz[(i + 1) % len(points_xz)][1]
                - points_xz[(i + 1) % len(points_xz)][0] * points_xz[i][1]
                for i in range(len(points_xz)))
    if area2 < 0:
        points_xz = list(reversed(points_xz))
    n = len(points_xz)
    verts = [(x, y - depth / 2, z) for x, z in points_xz] + [(x, y + depth / 2, z) for x, z in points_xz]
    faces = [tuple(range(n)), tuple(reversed(range(n, 2 * n)))]
    faces += [(i, i + n, (i + 1) % n + n, (i + 1) % n) for i in range(n)]
    mesh = bpy.data.meshes.new(PREFIX + name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(PREFIX + name, mesh)
    COLLECTION.objects.link(obj)
    return finish(obj, name, mat, bone)


def rounded_prism(name, location, dimensions, radius, mat, bone="Body"):
    """True large XZ corner radii independent of a thin plate's Y thickness."""
    x, y, z = location
    width, depth, height = dimensions
    points = []
    radius = min(radius, width / 2 - 0.0001, height / 2 - 0.0001)
    for cx, cz, start in [(width / 2 - radius, height / 2 - radius, 0),
                          (-width / 2 + radius, height / 2 - radius, 90),
                          (-width / 2 + radius, -height / 2 + radius, 180),
                          (width / 2 - radius, -height / 2 + radius, 270)]:
        for i in range(13):
            angle = math.radians(start + i * 90 / 12)
            points.append((x + cx + radius * math.cos(angle), z + cz + radius * math.sin(angle)))
    obj = extruded_shape(name, points, y, depth, mat, bone)
    for poly in obj.data.polygons:
        poly.use_smooth = len(poly.vertices) == 4
    return obj


def star(name, x, y, z, radius, mat, bone, scale=1):
    def points(r):
        return [(x + r * (1 if i % 2 == 0 else 0.46) * math.cos(math.pi / 2 + i * math.pi / 5),
                 z + r * (1 if i % 2 == 0 else 0.46) * math.sin(math.pi / 2 + i * math.pi / 5)) for i in range(10)]
    extruded_shape(name + " white embroidered border", points(radius * 1.15), y, 0.003 * scale, "ivory", bone)
    extruded_shape(name + " colored star", points(radius), y - 0.002 * scale, 0.003 * scale, mat, bone)


def create_rig():
    global RIG
    data = bpy.data.armatures.new(PREFIX + "mechanical skeleton")
    RIG = bpy.data.objects.new("pip_reference_candidate", data)
    COLLECTION.objects.link(RIG)
    bpy.context.view_layer.objects.active = RIG
    RIG.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    def bone(name, head, parent):
        b = data.edit_bones.new(name)
        b.head = head
        # Mechanical bones use identity-aligned XYZ axes; lift/extension is local Z,
        # and caster rolling is local X. They do not imitate humanoid limb axes.
        b.tail = Vector(head) + Vector((0, 0.1, 0))
        if parent:
            b.parent = data.edit_bones[parent]
    bone("Root", (0, 0, 0), None)
    bone("Body", (0, 0, 0.13), "Root")
    bone("Handle", (0, 0.065, 1.08), "Body")
    for side, x in [("L", -0.252), ("R", 0.252)]:
        for front, y in [("F", -0.092), ("B", 0.092)]:
            bone("Wheel." + side + front, (x * CASE_WIDTH, y, WHEEL_CENTER), "Body")
    cx, cy = COMPANION_OFFSET
    bone("Companion", (cx, cy, 0.061), "Root")
    bone("CompanionHandle", (cx, cy + 0.072 * 0.47, 0.535), "Companion")
    for side, x in [("L", -0.252), ("R", 0.252)]:
        for front, y in [("F", -0.092), ("B", 0.092)]:
            bone("CompanionWheel." + side + front, (cx + x * 0.47 * CASE_WIDTH, cy + y * 0.47, WHEEL_CENTER * 0.47), "Companion")
    bpy.ops.object.mode_set(mode="OBJECT")
    RIG.select_set(False)
    RIG["character_id"] = "pip"
    RIG["visual_final_approved"] = False
    RIG["model_status"] = "REFERENCE_GUIDED_MECHANICAL_REBUILD_CANDIDATE"
    RIG["reference_sha256"] = REFERENCE_SHA
    RIG["front_direction_blender"] = "-Y"
    RIG["source_revision"] = 10


def suitcase(label, offset, s, companion=False):
    ox, oy = offset
    body = "Companion" if companion else "Body"
    handle = "CompanionHandle" if companion else "Handle"
    wheel_prefix = "CompanionWheel." if companion else "Wheel."
    def xyz(x, y, z):
        return (ox + x * s * CASE_WIDTH, oy + y * s, z * s)
    def dims(x, y, z):
        return (x * s * CASE_WIDTH, y * s, z * s)
    def b(part, loc, size, mat, radius=0.01, bone=body, smooth=False):
        return box(label + " " + part, xyz(*loc), dims(*size), mat, radius * s, bone, smooth=smooth)
    def panel(part, loc, size, mat, radius, bone=body):
        return rounded_prism(label + " " + part, xyz(*loc), dims(*size), radius * s, mat, bone)
    def cy(part, loc, radius, depth, mat, bone=body, axis="Z"):
        return cylinder(label + " " + part, xyz(*loc), radius * s, depth * s, mat, bone, axis)
    def path(part, points, radius, mat, bone=body):
        return tube(label + " " + part, [xyz(*p) for p in points], radius * s, mat, bone)
    # Rounded case, rear lid and closure: separate real surfaces rather than a flat image.
    b("rounded turquoise shell", (0, 0, 0.594), (0.654, 0.275, 0.932), "turquoise", 0.12, smooth=True)
    panel("plain rear lid", (0, 0.115, 0.594), (0.595, 0.085, 0.868), "sky", 0.065)
    round_outline(label + " dark closure gasket", ox, oy + 0.072 * s, 0.594 * s, 0.635 * s * CASE_WIDTH, 0.91 * s, 0.081 * s, 0.0045 * s, "navy", body)
    panel("ivory front face", (0, -0.131, 0.594), (0.58, 0.05, 0.875), "ivory", 0.075)
    round_outline(label + " gold inset front frame", ox, oy - 0.158 * s, 0.594 * s, 0.57 * s * CASE_WIDTH, 0.855 * s, 0.069 * s, 0.007 * s, "gold", body)
    # Source has an asymmetric gold strip at image-left and cyan stripe at image-right.
    path("left gold armor rail", [(-0.258, -0.158, 0.945), (-0.29, -0.158, 0.85), (-0.29, -0.158, 0.345), (-0.267, -0.158, 0.24)], 0.017, "gold")
    path("right cyan corner rail", [(0.265, -0.168, 0.94), (0.292, -0.168, 0.81), (0.292, -0.168, 0.33), (0.258, -0.168, 0.24), (0.20, -0.168, 0.225)], 0.017, "sky")
    for side, x in [("left", -0.281), ("right", 0.281)]:
        for vertical, z in [("upper", 1.014), ("lower", 0.183)]:
            b(side + " " + vertical + " gold corner armor", (x, -0.098, z), (0.072, 0.105, 0.069), "gold", 0.025)
            cy(side + " " + vertical + " armor rivet", (x, -0.154, z), 0.009, 0.005, "steel", axis="Y")
    for z in [0.89, 0.28]:
        b("side hinge " + str(z), (0.33, 0.073, z), (0.017, 0.059, 0.049), "navy", 0.009)
        cy("hinge pin " + str(z), (0.34, 0.073, z), 0.009, 0.054, "steel")
    # Large black recessed face window with manufactured bezel and actual emissive geometry.
    panel("gold screen surround", (0, -0.165, 0.807), (0.554, 0.027, 0.334), "gold", 0.061)
    panel("white screen bezel", (0, -0.183, 0.807), (0.531, 0.012, 0.314), "ivory", 0.058)
    panel("recessed black glass screen", (0, -0.192, 0.807), (0.505, 0.013, 0.290), "screen", 0.053)
    for side, x in [("left", -0.105), ("right", 0.105)]:
        sphere(label + " " + side + " emissive cyan oval eye", xyz(x, -0.202, 0.831), dims(0.028, 0.004, 0.050), "pixels", body)
    smile = [(0.075 * math.sin(a), -0.204, 0.800 - 0.069 * math.cos(a)) for a in [(-1.12 + i * 2.24 / 24) for i in range(25)]]
    path("emissive U smile", smile, 0.009, "pixels")
    # Handle is a real telescoping assembly; its upper rails/grip have a dedicated bone.
    for side, x in [("left", -0.204), ("right", 0.204)]:
        b(side + " handle mount", (x, 0.074, 1.027), (0.073, 0.08, 0.048), "gold", 0.012)
        b(side + " lower telescoping sleeve", (x, 0.072, 1.062), (0.036, 0.032, 0.109), "navy", 0.012)
        b(side + " exposed upper handle rail", (x, 0.072, 1.175), (0.026, 0.022, 0.22), "steel", 0.007, handle)
        b(side + " black upper rail", (x, 0.072, 1.24), (0.03, 0.026, 0.09), "navy", 0.008, handle)
    b("black rounded carry grip", (0, 0.072, 1.298), (0.461, 0.062, 0.065), "navy", 0.028, handle)
    b("carry grip rubber inset", (0, 0.045, 1.298), (0.334, 0.018, 0.034), "rubber", 0.012, handle)
    b("handle release button", (0.108, 0.055, 1.331), (0.045, 0.027, 0.007), "steel", 0.005, handle)
    # The crop reveals a second, short top carrying handle below the tall pull grip.
    path("short top carrying handle", [(-0.145, -0.015, 1.05), (-0.123, -0.015, 1.088),
                                      (0.123, -0.015, 1.088), (0.145, -0.015, 1.05)], 0.018, "navy")
    for side, x in [("left", -0.231), ("right", 0.231)]:
        b(side + " upper face travel plaque", (x, -0.173, 1.019), (0.085, 0.02, 0.035), "gold", 0.009)
        for groove in [-0.021, 0, 0.021]:
            b(side + " upper plaque slot " + str(groove), (x + groove, -0.185, 1.019), (0.007, 0.006, 0.016), "navy", 0.002)
    # Source-visible side carrying handle; it is hardware, never a human arm.
    for z in [0.698, 0.482]:
        b("side grip mount " + str(z), (0.338, -0.004, z), (0.047, 0.055, 0.046), "gold", 0.01)
    path("side black carrying grip", [(0.352, -0.008, 0.684), (0.377, -0.008, 0.655), (0.377, -0.008, 0.525), (0.352, -0.008, 0.497)], 0.018, "navy")
    # Twin-wheel swivel castors on the preserved four-corner mechanical convention.
    for side, x in [("L", -0.252), ("R", 0.252)]:
        for front, y in [("F", -0.092), ("B", 0.092)]:
            wb = wheel_prefix + side + front
            cy(wb + " swivel mounting stem", (x, y, 0.126), 0.021, 0.049, "steel")
            b(wb + " black swivel fork", (x, y, 0.101), (0.091, 0.078, 0.055), "navy", 0.014, smooth=True)
            for twin, dx in [("a", -0.029), ("b", 0.029)]:
                cy(wb + " " + twin + " rubber wheel", (x + dx, y, WHEEL_CENTER), 0.064, 0.030, "rubber", wb, "X")
                cy(wb + " " + twin + " alloy hub", (x + dx * 1.53, y, WHEEL_CENTER), 0.030, 0.007, "steel", wb, "X")
                cy(wb + " " + twin + " gold axle cap", (x + dx * 1.68, y, WHEEL_CENTER), 0.009, 0.009, "gold", wb, "X")
    # Solid badge and applied star graphics, positioned from the source-visible face.
    bx, by, bz = xyz(0.012, -0.181, 0.407)
    badge = [(bx + math.cos(math.pi / 8 + i * math.pi / 4) * 0.085 * s, bz + math.sin(math.pi / 8 + i * math.pi / 4) * 0.085 * s) for i in range(8)]
    extruded_shape(label + " central gold compass badge", badge, by, 0.013 * s, "gold", body)
    for which, contour in [
        ("west", [(-0.027, 0.027), (-0.005, 0.039), (0.012, 0.025), (-0.003, 0.011),
                  (0.005, -0.004), (-0.004, -0.027), (-0.018, -0.018), (-0.032, 0.001), (-0.025, 0.014)]),
        ("east", [(0.025, 0.038), (0.039, 0.023), (0.028, 0.012), (0.031, -0.006),
                  (0.018, -0.022), (0.005, -0.031), (0.001, -0.014), (0.015, 0.002), (0.008, 0.012), (0.02, 0.016)])]:
        contour = [(xyz(0.012 + x, 0, 0.407 + z)[0], xyz(0.012 + x, 0, 0.407 + z)[2]) for x, z in contour]
        extruded_shape(label + " " + which + " blue globe land stamp", contour, oy - 0.193 * s, 0.003 * s, "blue", body)
    # Source-visible graphics have rounded colored backing patches and outlined icons.
    def outlined_star_patch(nm, x, z, width, height, backing, outline, radius):
        panel(nm + " rounded patch", (x, -0.178, z), (width, 0.01, height), backing, 0.016)
        outline_pts = [(x + radius * (1 if i % 2 == 0 else 0.46) * math.cos(math.pi / 2 + i * math.pi / 5),
                        -0.188, z + radius * (1 if i % 2 == 0 else 0.46) * math.sin(math.pi / 2 + i * math.pi / 5)) for i in range(10)]
        tube(label + " " + nm + " hollow star icon", [xyz(*p) for p in outline_pts], 0.0045 * s, outline, body, True)
    outlined_star_patch("upper left", -0.203, 0.553, 0.134, 0.132, "sky", "gold enamel", 0.046)
    outlined_star_patch("upper right", 0.209, 0.559, 0.123, 0.139, "coral", "ivory", 0.043)
    panel("blue rounded airplane patch", (0.211, -0.178, 0.439), (0.131, 0.01, 0.078), "blue", 0.014)
    plane = [(0, 0.038), (0.009, 0.01), (0.044, -0.004), (0.047, -0.017), (0.011, -0.009),
             (0.010, -0.024), (0.026, -0.031), (0.024, -0.04), (0, -0.029), (-0.024, -0.04),
             (-0.026, -0.031), (-0.01, -0.024), (-0.011, -0.009), (-0.047, -0.017), (-0.044, -0.004), (-0.009, 0.01)]
    angle = -math.pi / 7
    plane = [(0.211 + x * math.cos(angle) - z * math.sin(angle), 0.439 + x * math.sin(angle) + z * math.cos(angle)) for x, z in plane]
    extruded_shape(label + " white airplane patch silhouette", [(xyz(x, 0, z)[0], xyz(x, 0, z)[2]) for x, z in plane], oy - 0.188 * s, 0.003 * s, "ivory", body)
    outlined_star_patch("lower left", -0.212, 0.30, 0.062, 0.067, "sky", "ivory", 0.022)
    # Angular enamel blocks below the badge are visible in the approved source.
    lower_panel = [(-0.21, 0.156), (0.215, 0.156), (0.215, 0.25), (0.188, 0.324),
                   (0.139, 0.345), (0.102, 0.306), (0.059, 0.356), (0.029, 0.335),
                   (-0.018, 0.384), (-0.066, 0.346), (-0.116, 0.393), (-0.166, 0.359), (-0.21, 0.296)]
    extruded_shape(label + " source-guided gold angular lower panel", [(xyz(x, 0, z)[0], xyz(x, 0, z)[2]) for x, z in lower_panel], oy - 0.171 * s, 0.004 * s, "gold enamel", body)
    for nm, tile in [("left", [(-0.18, 0.36), (-0.18, 0.273), (-0.113, 0.215), (-0.115, 0.16)]),
                     ("middle", [(-0.08, 0.347), (-0.071, 0.261), (-0.012, 0.215), (0.016, 0.16)]),
                     ("right", [(0.127, 0.34), (0.118, 0.265), (0.057, 0.214), (0.059, 0.16)])]:
        path(nm + " lower panel fine tile seam", [(x, -0.175, z) for x, z in tile], 0.0013, "ivory")
    # Broad molded lower-right corner armor is visible in the canonical crop.
    path("broad cyan lower right armor", [(0.158, -0.184, 0.186), (0.214, -0.184, 0.194),
                                           (0.268, -0.176, 0.223), (0.291, -0.153, 0.266),
                                           (0.286, -0.131, 0.312)], 0.032, "sky")
    path("subtle upper panel seam", [(-0.028, -0.176, 0.68), (0, -0.176, 0.641), (0.071, -0.176, 0.677)], 0.0022, "steel")
    path("subtle lower panel seam", [(-0.128, -0.176, 0.246), (-0.022, -0.176, 0.222), (0.081, -0.176, 0.251)], 0.0022, "steel")


def create_clips():
    """Actual mechanical review motion, six separately named clips; choreography unapproved."""
    names = ["Idle", "Walk", "Jump", "Skill", "Win", "Lose"]
    RIG.animation_data_create()
    for name in names:
        action = bpy.data.actions.new("PipReview_" + name)
        RIG.animation_data.action = action
        for frame in [0, 15, 30, 45, 60]:
            phase = frame / 60 * math.tau
            for bone in RIG.pose.bones:
                bone.rotation_mode = "XYZ"
                bone.location = (0, 0, 0)
                bone.rotation_euler = (0, 0, 0)
                if bone.name in ["Body", "Companion"]:
                    bone.location.z = {"Idle": 0.004, "Walk": 0.008, "Jump": 0.09, "Skill": 0.012, "Win": 0.032, "Lose": 0.002}[name] * (0.5 - 0.5 * math.cos(phase))
                    if name == "Win":
                        bone.rotation_euler.y = 0.065 * math.sin(phase)
                    if name == "Lose":
                        bone.rotation_euler.x = -0.055 * (0.5 - 0.5 * math.cos(phase))
                elif bone.name in ["Handle", "CompanionHandle"] and name == "Skill":
                    bone.location.z = -0.14 * (0.5 - 0.5 * math.cos(phase)) * (0.47 if bone.name.startswith("Companion") else 1)
                elif "Wheel." in bone.name and name == "Walk":
                    bone.rotation_euler.x = -phase * 2
                bone.keyframe_insert(data_path="location", frame=frame)
                bone.keyframe_insert(data_path="rotation_euler", frame=frame)
        track = RIG.animation_data.nla_tracks.new()
        track.name = name
        strip = track.strips.new(name, 0, action)
        strip.name = name
        strip.action_frame_start = 0
        strip.action_frame_end = 60
        strip.blend_type = "REPLACE"
        track.mute = True
    RIG.animation_data.action = None
    for bone in RIG.pose.bones:
        bone.location = (0, 0, 0)
        bone.rotation_euler = (0, 0, 0)
    return names


def export_glb(path):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in PARTS + [RIG]:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = RIG
    rna = bpy.ops.export_scene.gltf.get_rna_type()
    properties = {p.identifier: p for p in rna.properties}
    opts = {"filepath": str(path), "export_format": "GLB", "use_selection": True, "use_active_scene": True,
            "export_extras": True, "export_animations": True, "export_force_sampling": True,
            "export_frame_range": False, "export_nla_strips": True, "export_animation_mode": "NLA_TRACKS"}
    opts = {k: v for k, v in opts.items() if k in properties}
    if "export_animation_mode" in opts and "NLA_TRACKS" not in {i.identifier for i in properties["export_animation_mode"].enum_items}:
        opts.pop("export_animation_mode")
    # Export tracks deliberately; candidate pose at rest is reset immediately afterwards.
    for track in RIG.animation_data.nla_tracks:
        track.mute = False
    bpy.ops.export_scene.gltf(**opts)
    for track in RIG.animation_data.nla_tracks:
        track.mute = True
    for bone in RIG.pose.bones:
        bone.location = (0, 0, 0)
        bone.rotation_euler = (0, 0, 0)


def validate_export(path):
    raw = path.read_bytes()
    size, kind = struct.unpack_from("<II", raw, 12)
    if kind != 0x4e4f534a:
        raise AssertionError("GLB JSON chunk missing.")
    doc = json.loads(raw[20:20 + size])
    allowed = {obj.name for obj in PARTS + [RIG]} | {bone.name for bone in RIG.data.bones}
    unexpected = [node.get("name") for node in doc["nodes"] if node.get("name") not in allowed]
    mesh_nodes = [node for node in doc["nodes"] if "mesh" in node]
    clips = [action.get("name") for action in doc.get("animations", [])]
    if unexpected or len(mesh_nodes) != len(PARTS) or any("skin" not in n for n in mesh_nodes):
        raise AssertionError(f"Candidate export containment/skin failed: {unexpected}; {len(mesh_nodes)} mesh nodes.")
    if set(clips) != {"Idle", "Walk", "Jump", "Skill", "Win", "Lose"}:
        raise AssertionError(f"Expected six mechanical clips; got {clips}.")
    return {"candidate_mesh_nodes": len(mesh_nodes), "all_meshes_mechanically_skinned": True,
            "no_original_roster_objects_exported": True, "animation_names": clips,
            "skins": len(doc.get("skins", [])), "material_count": len(doc.get("materials", []))}


def main():
    config = args()
    bpy.ops.wm.open_mainfile(filepath=str(config.source), load_ui=False)
    original_objects = list(bpy.data.objects)
    original_actions = list(bpy.data.actions)
    if not any(o.name == "pip" and o.type == "ARMATURE" for o in original_objects) or not any(o.name == "pip | skinned mesh" for o in original_objects):
        raise ValueError("Pinned source lacks the inspected original Pip armature/mesh.")
    before = original_fingerprint(original_objects)
    scene = bpy.data.scenes.new("Pip Reference Review Candidate")
    bpy.context.window.scene = scene
    scene.render.fps = 30
    scene.frame_start, scene.frame_end = 0, 60
    global COLLECTION
    COLLECTION = bpy.data.collections.new("Pip | reference-guided candidate")
    scene.collection.children.link(COLLECTION)
    material("turquoise", (0.09, 0.50, 0.65), 0.22, 0.28)
    material("sky", (0.19, 0.68, 0.82), 0.12, 0.3)
    material("ivory", (0.91, 0.92, 0.86), 0.04, 0.34)
    material("gold", (0.92, 0.59, 0.13), 0.68, 0.26)
    material("gold enamel", (1.0, 0.71, 0.25), 0.08, 0.4)
    material("navy", (0.011, 0.022, 0.037), 0.15, 0.35)
    material("screen", (0.003, 0.012, 0.024), 0.08, 0.18)
    material("pixels", (0.0, 0.92, 1.0), 0, 1.0, 0.8)
    material("steel", (0.31, 0.39, 0.45), 0.78, 0.26)
    material("rubber", (0.012, 0.016, 0.022), 0, 0.78)
    material("blue", (0.015, 0.32, 0.57), 0.06, 0.4)
    material("coral", (0.91, 0.12, 0.20), 0.01, 0.48)
    create_rig()
    suitcase("Main", (0, 0), 1.0)
    suitcase("Companion", COMPANION_OFFSET, 0.47, companion=True)
    clips = create_clips()
    scene.frame_set(0)
    after = original_fingerprint(original_objects)
    if before != after or any(action not in bpy.data.actions[:] for action in original_actions):
        raise AssertionError("Original roster datablocks changed during candidate creation.")
    if any("Arm." in b.name or "Thigh" in b.name for b in RIG.data.bones):
        raise AssertionError("Humanoid limb accidentally introduced.")
    config.output_dir.mkdir(parents=True, exist_ok=True)
    glb = config.output_dir / "pip-reference-guided-candidate.glb"
    export_glb(glb)
    export_validation = validate_export(glb)
    blend = config.output_dir / "pip-reference-guided-candidate.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    if sha(config.source) != config.expected_source_sha256:
        raise AssertionError("Original source file changed.")
    proof = {"schema": "crwt.pip-reference-guided-candidate.v1", "status": "candidate_for_visual_critique",
             "visual_final_approved": False, "game_assets_replaced": False,
             "source": {"path": str(config.source), "sha256": config.expected_source_sha256, "revision": 10,
                        "original_objects_preserved": len(original_objects), "original_actions_preserved": len(original_actions),
                        "original_fingerprints_unchanged": before == after, "pip_objects": ["pip", "pip | skinned mesh"]},
             "reference": {"path": str(config.reference), "sha256": REFERENCE_SHA, "position": "bottom row column 5",
                           "crop_bbox_pixels_estimate": [1340, 532, 1646, 912], "raster_crop_used_as_model": False},
             "outputs": {"blend": {"filename": blend.name, "sha256": sha(blend), "bytes": blend.stat().st_size},
                         "glb": {"filename": glb.name, "sha256": sha(glb), "bytes": glb.stat().st_size}},
             "geometry": {"mesh_parts": len(PARTS), "vertices": sum(len(o.data.vertices) for o in PARTS),
                          "polygons": sum(len(o.data.polygons) for o in PARTS), "mechanical_bones": [b.name for b in RIG.data.bones],
                          "humanoid_arms_or_legs": False, "front_blender": "-Y", "companion_scale": 0.47,
                          "materials": list(MATERIALS), "parts": [o["part"] for o in PARTS]},
             "palette_policy": "Visible sRGB palette converted to linear shader and diffuse sockets; emissive digital face has black diffuse base.",
             "clip_intent": {"names": clips, "new_mechanical_candidate_motion": True, "choreography_approved": False,
                             "exported_clips_require_actual_glb_validation": True},
             "actual_glb_validation": export_validation,
             "known_inference": ["Rear face and hidden thickness continue simple shell colors; no rear face screen.",
                                 "Four caster stations follow original mechanical rig convention; hidden count is not proven by the master.",
                                 "Globe continents, minute panel seams and rivets are conservative geometric approximations.",
                                 "Fixed normalized dimensions and companion scale require rendered comparison.",
                                 "No board integration, deformation acceptance or visual approval is claimed."]}
    (config.output_dir / "pip-reference-guided-candidate.manifest.json").write_text(json.dumps(proof, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(glb), "sha256": sha(glb), "mesh_parts": len(PARTS), "originals_preserved": True}))


if __name__ == "__main__":
    main()

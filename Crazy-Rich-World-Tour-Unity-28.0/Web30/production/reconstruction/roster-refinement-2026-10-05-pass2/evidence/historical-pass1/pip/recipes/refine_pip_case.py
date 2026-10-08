"""Native rounded casing/seat/bezel pass over the frozen Pip V8 recipe.

Builds a separate candidate scene in the preserved original source blend.
No checkpoint/runtime/source file is overwritten. Hidden rear keeps a plain lid.
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
sys.path.insert(0, str(Path(__file__).resolve().parent))
import pip_v8_frozen_builder as base

HERE = Path(__file__).resolve().parent
V8_SHA = "abef291c518c0ea34625678644910270fc9594e1d107ca80988db2059609fb32"
BUILDER_SHA = "86a073f23cbe9af9f7fc8d690bef458b7338b915a1d07d33bb7f9e5ca5a33be2"
CHANGES = []
PATCH_FRONTS = {}
original_box = base.box
original_panel = base.rounded_prism
original_extruded = base.extruded_shape
original_tube = base.tube


def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()


def outline(width, height, radius, center=(0, 0)):
    radius = min(radius, width/2-.00001, height/2-.00001)
    points = []
    for cx, cz, start in [(width/2-radius, height/2-radius, 0), (-width/2+radius, height/2-radius, 90),
                          (-width/2+radius, -height/2+radius, 180), (width/2-radius, -height/2+radius, 270)]:
        for i in range(13):
            a = math.radians(start + i*90/12)
            points.append((center[0]+cx+radius*math.cos(a), center[1]+cz+radius*math.sin(a)))
    return points


def mesh_part(name, vertices, faces, mat, bone):
    mesh = bpy.data.meshes.new(base.PREFIX + name)
    mesh.from_pydata(vertices, [], faces); mesh.update()
    obj = bpy.data.objects.new(base.PREFIX + name, mesh)
    base.COLLECTION.objects.link(obj)
    return base.finish(obj, name, mat, bone, smooth=True)


def soft_shell(name, location, dimensions, mat, bone):
    x, y, z = location; width, depth, height = dimensions
    profile = [(-.50, .90, .91, .145), (-.44, .97, .976, .152), (-.32, 1, 1, .155),
               (.26, 1, .995, .155), (.43, .97, .971, .150), (.50, .90, .91, .145)]
    vertices, faces = [], []
    for d, ws, hs, r in profile:
        vertices += [(px, y+d*depth, pz) for px,pz in outline(width*ws, height*hs, height*r, (x,z))]
    n = len(vertices)//len(profile)
    for ring in range(len(profile)-1):
        for i in range(n):
            j=(i+1)%n; a=ring*n; b=(ring+1)*n
            faces.append((a+i,b+i,b+j,a+j))
    faces += [tuple(range(n)), tuple(reversed(range((len(profile)-1)*n,len(profile)*n)))]
    CHANGES.append({"part":name,"operation":"convex rounded XZ loft with six depth rings", "profile":profile})
    return mesh_part(name, vertices, faces, mat, bone)


def crowned_panel(name, location, dimensions, radius, mat, bone, front_edge, back_y, bulge):
    x,y,z=location; width,depth,height=dimensions
    vertices,faces=[],[]
    fractions=[1,.92,.75,.55,.32,.12]
    for f in fractions:
        yy=front_edge-bulge*(1-f*f)
        vertices += [(px,yy,pz) for px,pz in outline(width*f,height*f,radius*f,(x,z))]
    n=len(vertices)//len(fractions)
    for ring in range(len(fractions)-1):
        for i in range(n):
            j=(i+1)%n;a=ring*n;b=(ring+1)*n
            faces.append((a+i,a+j,b+j,b+i))
    center=len(vertices);vertices.append((x,front_edge-bulge,z))
    a=(len(fractions)-1)*n
    faces += [(a+i,a+(i+1)%n,center) for i in range(n)]
    rear=len(vertices)
    vertices += [(px,back_y,pz) for px,pz in outline(width*.98,height*.988,radius*.97,(x,z))]
    for i in range(n):
        j=(i+1)%n;faces.append((i,rear+i,rear+j,j))
    faces.append(tuple(reversed(range(rear,rear+n))))
    CHANGES.append({"part":name,"operation":"crowned continuous panel", "front_edge_y":front_edge,"center_y":front_edge-bulge,"back_y":back_y})
    return mesh_part(name, vertices, faces, mat, bone)


def bezel_ring(name, location, dimensions, radius, mat, bone):
    x,y,z=location;w,depth,h=dimensions
    s=h/(.334 if mat=="gold" else .314)
    if mat=="gold":
        front_y=y-.025*s; back_y=y+.020*s; inset_w=.030*s;inset_h=.030*s
    else:
        front_y=y-.025*s; back_y=y+.008*s;inset_w=.032*s;inset_h=.030*s
    contours=[outline(w*.99,h*.99,radius,(x,z)),outline(w,h,radius,(x,z)),
              outline(w-inset_w,h-inset_h,max(.001,radius-.012*s),(x,z)),
              outline(w-inset_w-.002*s,h-inset_h-.002*s,max(.001,radius-.013*s),(x,z))]
    ys=[front_y,back_y,back_y,front_y]
    vertices=[(px,yy,pz) for contour,yy in zip(contours,ys) for px,pz in contour]
    n=len(contours[0]);faces=[]
    for r in range(4):
        nxt=(r+1)%4
        for i in range(n):
            j=(i+1)%n;faces.append((r*n+i,nxt*n+i,nxt*n+j,r*n+j))
    CHANGES.append({"part":name,"operation":"closed annular recessed-screen flange", "front_y":front_y,"back_y":back_y,"hole_width":w-inset_w-.002*s,"hole_height":h-inset_h-.002*s})
    return mesh_part(name,vertices,faces,mat,bone)


def refined_box(name,location,dimensions,mat,radius=.01,bone="Body",rotation=None,smooth=False):
    if name.endswith("rounded turquoise shell"):
        return soft_shell(name,location,dimensions,mat,bone)
    return original_box(name,location,dimensions,mat,radius,bone,rotation,smooth)


def refined_panel(name,location,dimensions,radius,mat,bone="Body"):
    s=.47 if name.startswith("Companion ") else 1
    x,y,z=location
    if name.endswith("ivory front face"):
        return crowned_panel(name,location,dimensions,radius*1.15,mat,bone,y-.022*s,y+.008*s,.018*s)
    if name.endswith("plain rear lid"):
        # Same plain rear design. Mirror only the panel construction direction,
        # not character geometry or any identity-bearing surface.
        # Seat the whole visible lid beyond the shell's rear cap. The first
        # trial intersected that cap and exposed only a rectangular center.
        oy = y-.115*s
        dimensions=(dimensions[0]*.96,dimensions[1],dimensions[2]*.98)
        obj=crowned_panel(name,(x,-y,z),dimensions,radius*2,mat,bone,-oy-.140*s,-oy-.103*s,.025*s)
        for vertex in obj.data.vertices: vertex.co.y *= -1
        for poly in obj.data.polygons: poly.flip()
        obj.data.update()
        CHANGES[-1].update({"front_edge_y":oy+.140*s,"center_y":oy+.165*s,
                            "back_y":oy+.103*s,"construction_direction":"rear +Y"})
        return obj
    if name.endswith("gold screen surround") or name.endswith("white screen bezel"):
        return bezel_ring(name,location,dimensions,radius,mat,bone)
    if name.endswith("recessed black glass screen"):
        return crowned_panel(name,location,dimensions,radius,mat,bone,y-dimensions[1]/2,y+dimensions[1]/2,.0009*s)
    if "rounded" in name and name.endswith("patch"):
        # Planar decals sit just above the closest point on the crowned face;
        # their raised glyphs use this actual surface, never a blind Y shift.
        ox=-.47 if name.startswith("Companion ") else 0
        oy=-.08 if name.startswith("Companion ") else 0
        fx=max(0,abs(x-ox)-dimensions[0]/2)/(.58*base.CASE_WIDTH*s/2)
        fz=max(0,abs(z-.594*s)-dimensions[2]/2)/(.875*s/2)
        f=min(1,max(fx,fz));surface=oy-.153*s-.018*s*(1-f*f)
        location=(x,surface-.0038*s,z);dimensions=(dimensions[0],.006*s,dimensions[2])
        PATCH_FRONTS[name]=location[1]-dimensions[1]/2
        CHANGES.append({"part":name,"operation":"seat thin patch above nearest crowned-face surface",
                        "depth":.006*s,"front_y":PATCH_FRONTS[name],"face_clearance":.0008*s})
    return original_panel(name,location,dimensions,radius,mat,bone)


def bevel_existing(obj,amount):
    bpy.ops.object.select_all(action="DESELECT");obj.select_set(True);bpy.context.view_layer.objects.active=obj
    bevel=obj.modifiers.new("Rounded enamel edge","BEVEL");bevel.width=amount;bevel.segments=4
    bpy.ops.object.modifier_move_to_index(modifier=bevel.name,index=0)
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    # Modifier may append vertices; preserve the rigid mechanical weight contract.
    group=obj.vertex_groups[obj["mechanical_bone"]];group.add(list(range(len(obj.data.vertices))),1,"REPLACE")
    for poly in obj.data.polygons:poly.use_smooth=True
    normal=obj.modifiers.new("Enamel weighted normals","WEIGHTED_NORMAL");normal.keep_sharp=True
    bpy.ops.object.modifier_move_to_index(modifier=normal.name,index=0)
    bpy.ops.object.modifier_apply(modifier=normal.name)
    obj.select_set(False)
    return obj


def refined_extruded(name,points_xz,y,depth,mat,bone="Body"):
    s=.47 if name.startswith("Companion ") else 1
    bevel=0
    if name.endswith("central gold compass badge"):
        depth=.034*s;bevel=.0045*s
        CHANGES.append({"part":name,"operation":"seated thick badge with four-segment bevel","depth":depth,"bevel":bevel})
    elif name.endswith("blue globe land stamp"):
        y-=.010*s;depth=.005*s;bevel=.0007*s
        CHANGES.append({"part":name,"operation":"blue relief stands above seated badge","shift_y":-.010*s,"depth":depth})
    elif name.endswith("white airplane patch silhouette"):
        label=name.split(" ",1)[0]
        y=PATCH_FRONTS[label+" blue rounded airplane patch"]-.0018*s;depth=.0036*s
        CHANGES.append({"part":name,"operation":"seat airplane relief on measured blue patch front",
                        "center_y":y,"depth":depth})
    elif name.endswith("source-guided gold angular lower panel"):
        depth=.033*s;bevel=.002*s
        CHANGES.append({"part":name,"operation":"seat rounded enamel armor into crowned face","depth":depth,"bevel":bevel})
    obj=original_extruded(name,points_xz,y,depth,mat,bone)
    return bevel_existing(obj,bevel) if bevel else obj


def refined_tube(name,points,radius,mat,bone="Body",closed=False):
    s=.47 if name.startswith("Companion ") else 1
    if name.endswith("subtle lower panel seam"):
        CHANGES.append({"part":name,"operation":"omit unsupported dark V crossing lower enamel tiles"})
        return None
    if name.endswith("hollow star icon"):
        patch=name.replace(" hollow star icon"," rounded patch")
        icon_y=PATCH_FRONTS[patch]-.0025*s
        points=[(x,icon_y,z) for x,y,z in points]
    if name.endswith("lower panel fine tile seam"):
        points=[(x,y-.014*s,z) for x,y,z in points]
    if not name.endswith("broad cyan lower right armor"):
        return original_tube(name,points,radius,mat,bone,closed)
    curve=bpy.data.curves.new(base.PREFIX+name,"CURVE");curve.dimensions="3D"
    curve.resolution_u=10;curve.bevel_depth=radius;curve.bevel_resolution=5;curve.use_fill_caps=True
    spline=curve.splines.new("BEZIER");spline.bezier_points.add(len(points)-1)
    for bp,xyz,taper in zip(spline.bezier_points,points,[.65,1.15,1,.8,.30]):
        bp.co=xyz;bp.handle_left_type="AUTO";bp.handle_right_type="AUTO";bp.radius=taper
    obj=bpy.data.objects.new(base.PREFIX+name,curve);base.COLLECTION.objects.link(obj)
    bpy.ops.object.select_all(action="DESELECT");obj.select_set(True);bpy.context.view_layer.objects.active=obj
    bpy.ops.object.convert(target="MESH");obj=bpy.context.view_layer.objects.active;obj.select_set(False)
    CHANGES.append({"part":name,"operation":"smooth manufactured corner strap with tapered ends","radius":radius})
    return base.finish(obj,name,mat,bone,smooth=True)


def glb_doc(path):
    raw=path.read_bytes();n,kind=struct.unpack_from("<II",raw,12)
    if kind!=0x4e4f534a:raise ValueError("GLB JSON missing")
    offset=20+n;size,kind=struct.unpack_from("<II",raw,offset)
    if kind!=0x004e4942:raise ValueError("GLB BIN missing")
    return json.loads(raw[20:20+n]),raw[offset+8:offset+8+size]


def values(doc,binary,index):
    a=doc["accessors"][index];v=doc["bufferViews"][a["bufferView"]]
    width={"SCALAR":1,"VEC3":3,"VEC4":4,"MAT4":16}[a["type"]]
    if a["componentType"]!=5126:raise ValueError("Expected float rig accessor")
    start=v.get("byteOffset",0)+a.get("byteOffset",0);stride=v.get("byteStride",4*width)
    return [struct.unpack_from("<"+"f"*width,binary,start+i*stride) for i in range(a["count"])]


def rig_signature(path):
    doc,binary=glb_doc(path);skin=doc["skins"][0]
    joints={doc["nodes"][i]["name"]:{k:doc["nodes"][i].get(k) for k in ["matrix","translation","rotation","scale"]} for i in skin["joints"]}
    clips={}
    for animation in doc["animations"]:
        rows=[]
        for channel in animation["channels"]:
            sampler=animation["samplers"][channel["sampler"]]
            rows.append({"bone":doc["nodes"][channel["target"]["node"]]["name"],"path":channel["target"]["path"],
                         "interpolation":sampler.get("interpolation","LINEAR"),"input":values(doc,binary,sampler["input"]),"output":values(doc,binary,sampler["output"])})
        clips[animation["name"]]=sorted(rows,key=lambda r:(r["bone"],r["path"]))
    return {"joints":joints,"inverse_bind_matrices":values(doc,binary,skin["inverseBindMatrices"]),"clips":clips}


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--source",type=Path,required=True);ap.add_argument("--reference",type=Path,required=True)
    ap.add_argument("--baseline",type=Path,required=True);ap.add_argument("--output-dir",type=Path,required=True)
    ap.add_argument("--confirm-rounded-case-refinement",action="store_true")
    cfg=ap.parse_args(sys.argv[sys.argv.index("--")+1:])
    if not cfg.confirm_rounded_case_refinement:ap.error("Use --confirm-rounded-case-refinement; visual approval remains false")
    for key in ("source","reference","baseline"):setattr(cfg,key,getattr(cfg,key).resolve(strict=True))
    cfg.output_dir=cfg.output_dir.resolve();cfg.expected_source_sha256=base.SOURCE_SHA
    protected={str(p):sha(p) for p in [cfg.source,cfg.reference,cfg.baseline,HERE/"pip_v8_frozen_builder.py"]}
    if sha(cfg.source)!=base.SOURCE_SHA or sha(cfg.reference)!=base.REFERENCE_SHA or sha(cfg.baseline)!=V8_SHA or sha(HERE/"pip_v8_frozen_builder.py")!=BUILDER_SHA:
        ap.error("Frozen source/reference/V8 recipe identity mismatch")
    if not cfg.output_dir.is_relative_to(HERE) or (cfg.output_dir.exists() and any(cfg.output_dir.iterdir())):
        ap.error("Output must be a new empty directory under this isolated Pip pass")
    baseline_rig=rig_signature(cfg.baseline)
    base.args=lambda:cfg;base.box=refined_box;base.rounded_prism=refined_panel
    base.extruded_shape=refined_extruded;base.tube=refined_tube
    base.main()
    glb=cfg.output_dir/"pip-reference-guided-candidate.glb"
    rig=rig_signature(glb)
    if rig!=baseline_rig or len(rig["joints"])!=13 or set(rig["clips"])!={"Idle","Walk","Jump","Skill","Win","Lose"}:
        raise AssertionError("Frozen 13-joint/six-clip data changed")
    if any(sha(Path(p))!=s for p,s in protected.items()):raise AssertionError("A protected input changed")
    manifest_path=cfg.output_dir/"pip-reference-guided-candidate.manifest.json"
    manifest=json.loads(manifest_path.read_text())
    manifest["refinement"]={"date":"2026-10-05","baseline_glb_sha256":V8_SHA,"geometry_operations":CHANGES,
        "actual_rig_data_matches_v8":True,"palette_unchanged_from_v8_recipe":True,"approval":False,
        "limits":"Casing depth, rear curvature and microdetails remain interpretations of one canonical front image; no runtime change or final approval."}
    manifest_path.write_text(json.dumps(manifest,indent=2)+"\n",encoding="utf-8")
    doc,_=glb_doc(glb)
    proof={"schema":"crwt.pip-rounded-case-refinement.v1","approved":False,"gameIntegrated":False,
        "baseline_sha256":V8_SHA,"candidate_sha256":sha(glb),"bytes":glb.stat().st_size,
        "mesh_parts":len(doc["meshes"]),"triangles":sum(doc["accessors"][p["indices"]]["count"]//3 for m in doc["meshes"] for p in m["primitives"]),
        "joints":13,"clip_names":list(rig["clips"]),"actual_joint_rest_inverse_bind_and_clip_values_identical":True,
        "protected_inputs_unchanged":protected,"original_objects_and_actions_preserved":manifest["source"],
        "operations":CHANGES,"requires_actual_render_comparison":True}
    (cfg.output_dir/"rounded-case-refinement.proof.json").write_text(json.dumps(proof,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({"output":str(glb),"sha256":sha(glb),"meshes":len(doc["meshes"]),"rig_and_clips_identical":True}))


if __name__=="__main__":main()

"""Independent read-only native restore: geometry, colors, normals, UV, shaders, rig."""
import bpy,sys,json,hashlib,importlib.util,argparse,collections
from pathlib import Path
HERE=Path(__file__).resolve().parent
ap=argparse.ArgumentParser();ap.add_argument('--blend',type=Path,required=True);ap.add_argument('--manifest',type=Path,required=True);ap.add_argument('--out',type=Path,required=True);a=ap.parse_args(sys.argv[sys.argv.index('--')+1:]);sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
spec=importlib.util.spec_from_file_location('helper',HERE/'build_fidelity_workspace.py');h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
require=lambda c,t:None if c else (_ for _ in ()).throw(ValueError(t))
require(not a.out.exists(),'Fresh receipt');pin=sha(a.blend);mpin=sha(a.manifest);proof=json.loads(a.blend.with_suffix('.workspace-proof.json').read_bytes());manifest=json.loads(a.manifest.read_bytes());require(pin==proof['output_blend_sha256'],'Native SHA');require(proof['character_count']==10,'Roster count')
def materials():return {m.name:h.material_fingerprint(m) for m in bpy.data.materials if m.node_tree}
def packed():
 out={}
 for im in bpy.data.images:
  if im.source!='FILE':continue
  require(bool(im.packed_file),'Unpacked active image '+im.name);out[im.name]={'sha256':hashlib.sha256(bytes(im.packed_file.data)).hexdigest(),'bytes':im.packed_file.size,'colorspace':im.colorspace_settings.name}
 return out
def rig():
 rs=[o for o in bpy.data.objects if o.type=='ARMATURE'];require(len(rs)==1 and len(rs[0].data.bones)==13,'Pip rig')
 r=rs[0];actions={s.action.name for t in r.animation_data.nla_tracks for s in t.strips};require(actions=={'Idle','Walk','Jump','Skill','Win','Lose'} and len(bpy.data.actions)==6,'Pip actions')
 return {'bones':{b.name:[float(v) for row in b.matrix_local for v in row] for b in r.data.bones},'clips':sorted(actions)}
bpy.ops.wm.open_mainfile(filepath=str(a.blend),load_ui=False);records=[]
for row in proof['characters']:
 c=bpy.data.collections[row['id']];actual={o.data.name:h.mesh_fingerprint(o.data) for o in c.all_objects if o.type=='MESH'};require(actual==row['native_imported_mesh_material_slot_uv_fingerprints'],'Native fingerprint '+row['id'])
 require(list(bpy.data.objects[row['id']+' | review placement'].location)==row['review_translation'],'Placement')
 records.append({'id':row['id'],'geometry_normals_uv_color_attributes_preserved':True,'sha256':row['source_sha256']})
ms=materials();ps=packed();rs=rig();require(sha(a.blend)==pin,'Read-only native')
bpy.ops.wm.read_factory_settings(use_empty=True)
for row in proof['characters']:
 require(sha(Path(row['source_path']))==row['source_sha256'],'GLB hash');bpy.ops.import_scene.gltf(filepath=row['source_path'],merge_vertices=False)
require(materials()==ms,'Saved shaders differ');require(packed()==ps,'Saved packed active images differ');require(rig()==rs,'Pip rest bones/actions differ');require(sha(a.blend)==pin and sha(a.manifest)==mpin,'Inputs changed')
result={'schema':'crwt.fidelity_native_reopen.v1','passed':True,'blend_sha256':pin,'manifest_sha256':mpin,'character_count':10,'characters':records,'packed_active_image_count':len(ps),'images':ps,'material_graphs_equal_fresh_glb_imports':True,'pip':rs,'read_only':True,'approved':False,'gameIntegrated':False,'limits':['Includes active imported image textures; Alexia original unused image bytes remain preserved in its packaged GLB and previous native source archive.','Native restoration and source identity checks do not certify visual precision or runtime integration.']}
a.out.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8');print(json.dumps({'passed':True,'characters':10,'packed_active_images':len(ps),'sha256':sha(a.out)}))

"""Portable read-only restore using only manifest-relative selected GLBs.
Historical absolute source paths in the frozen workspace proof are not used.
"""
import bpy,sys,json,hashlib,importlib.util,argparse,collections
from pathlib import Path
HERE=Path(__file__).resolve().parent
ap=argparse.ArgumentParser();ap.add_argument('--blend',type=Path,required=True);ap.add_argument('--manifest',type=Path,required=True);ap.add_argument('--out',type=Path,required=True);a=ap.parse_args(sys.argv[sys.argv.index('--')+1:]);sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
spec=importlib.util.spec_from_file_location('helper',HERE/'build_fidelity_workspace.py');h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
require=lambda c,t:None if c else (_ for _ in ()).throw(ValueError(t))
require(not a.out.exists(),'Fresh receipt');pin=sha(a.blend);mpin=sha(a.manifest);proof=json.loads(a.blend.with_suffix('.workspace-proof.json').read_bytes());manifest=json.loads(a.manifest.read_bytes());require(pin==proof['output_blend_sha256'],'Native SHA');require(proof['character_count']==10,'Roster count')
require(mpin==proof['manifest_sha256'],'Manifest SHA differs from build proof')
require(manifest.get('approved') is False and manifest.get('gameIntegrated') is False,'Candidate approval flags')
roster={r['id']:r for r in manifest['models']};require(len(roster)==10 and set(roster)=={r['id'] for r in proof['characters']},'Manifest/build roster differs')
base=a.manifest.resolve().parent;portable_sources={}
for id,row in roster.items():
 rel=Path(row['path']);require(not rel.is_absolute() and '..' not in rel.parts and row['path']=='viewer/models/'+id+'.glb','Unsafe/noncanonical manifest model path')
 p=(base/rel).resolve();require(p.is_relative_to(base) and p.is_file() and not p.is_symlink(),'Model outside restore root')
 require(sha(p)==row['sha256'],'Selected manifest model SHA differs');portable_sources[id]=p
require(not a.out.resolve().is_relative_to(base/'viewer'),'Proof output cannot overlap restored model assets')
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
 p=portable_sources[row['id']];require(roster[row['id']]['sha256']==row['source_sha256'] and sha(p)==row['source_sha256'],'GLB hash');bpy.ops.import_scene.gltf(filepath=str(p),merge_vertices=False)
require(materials()==ms,'Saved shaders differ');require(packed()==ps,'Saved packed active images differ');require(rig()==rs,'Pip rest bones/actions differ');require(sha(a.blend)==pin and sha(a.manifest)==mpin,'Inputs changed')
require(all(sha(portable_sources[r['id']])==r['source_sha256'] for r in proof['characters']),'Restored GLB inputs changed')
result={'schema':'crwt.fidelity_native_reopen.v1','passed':True,'blend_sha256':pin,'manifest_sha256':mpin,'character_count':10,'characters':records,'packed_active_image_count':len(ps),'images':ps,'material_graphs_equal_fresh_glb_imports':True,'pip':rs,'read_only':True,'portable_manifest_relative_sources':True,'historical_absolute_source_paths_used':False,'native_color_representation':'Blender imported BYTE_COLOR; original float COLOR_0 preserved in packaged GLB','approved':False,'gameIntegrated':False,'limits':['Includes active imported image textures; Alexia original unused image bytes remain preserved in its packaged GLB and previous native source archive.','Native restoration and source identity checks do not certify visual precision or runtime integration.']}
a.out.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8');print(json.dumps({'passed':True,'characters':10,'packed_active_images':len(ps),'sha256':sha(a.out)}))

"""Reopen a single editable Alexia and compare it to its packaged GLB without writes."""
import argparse, hashlib, importlib.util, json, pathlib, sys
import bpy
HERE=pathlib.Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('workspace',HERE/'build_fidelity_workspace.py')
h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
ap=argparse.ArgumentParser();ap.add_argument('--blend',type=pathlib.Path,required=True);ap.add_argument('--manifest',type=pathlib.Path,required=True);ap.add_argument('--out',type=pathlib.Path,required=True)
a=ap.parse_args(sys.argv[sys.argv.index('--')+1:])
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
require=h.require
require(not a.out.exists(),'Fresh evidence required')
blend=a.blend.resolve(strict=True);manifest=a.manifest.resolve(strict=True);pin=sha(blend);mpin=sha(manifest)
proof=json.loads(blend.with_suffix('.workspace-proof.json').read_bytes())
roster=json.loads(manifest.read_bytes());rows=roster.get('models',roster.get('characters'))
require(proof['character_count']==1 and len(rows)==1 and rows[0]['id']=='alexia','Single Alexia expected')
require(pin==proof['output_blend_sha256'] and mpin==proof['manifest_sha256'],'Native/proof pins')
rel=pathlib.Path(rows[0]['path']);require(not rel.is_absolute() and '..' not in rel.parts,'Manifest-relative model required')
model=(manifest.parent/rel).resolve(strict=True);require(model.is_relative_to(manifest.parent),'Path escape')
sourcepin=sha(model);require(sourcepin==rows[0]['sha256']==proof['characters'][0]['source_sha256'],'GLB pin')
def meshmap():
 return {o.data.name:h.mesh_fingerprint(o.data) for o in bpy.data.collections['alexia'].all_objects if o.type=='MESH'}
def materials():return {m.name:h.material_fingerprint(m) for m in bpy.data.materials if m.node_tree}
def images():
 result={}
 for im in bpy.data.images:
  if im.source=='FILE':
   require(bool(im.packed_file),'Unpacked image '+im.name)
   result[im.name]={'sha256':hashlib.sha256(bytes(im.packed_file.data)).hexdigest(),'bytes':im.packed_file.size,'colorspace':im.colorspace_settings.name}
 return result
bpy.ops.wm.open_mainfile(filepath=str(blend),load_ui=False)
expected=proof['characters'][0]['native_imported_mesh_material_slot_uv_fingerprints'];saved=meshmap()
require(saved==expected,'Saved geometry/UV/normals/colors differ from build')
mats=materials();ims=images()
require(not any(o.type=='ARMATURE' for o in bpy.data.objects) and not bpy.data.actions,'Static review only')
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(model),merge_vertices=False)
fresh={o.data.name:h.mesh_fingerprint(o.data) for o in bpy.data.objects if o.type=='MESH'}
require(fresh==saved,'Fresh mesh/normal/UV/native color fingerprint differs')
require(materials()==mats and images()==ims,'Materials/images differ from fresh import')
require(sha(blend)==pin and sha(manifest)==mpin and sha(model)==sourcepin,'Read-only inputs changed')
result={'schema':'crwt.alexia_profile_native_reopen.v1','passed':True,'blend_sha256':pin,'manifest_sha256':mpin,'candidate_sha256':sourcepin,'character_count':1,'all_mesh_normal_uv_material_fingerprints_equal':True,'color_attribute_fingerprints_equal':True,'native_color_attributes':[row['color_attributes'] for row in saved.values()],'packed_active_image_count':len(ims),'images':ims,'all_file_images_packed':True,'portable_manifest_relative_sources':True,'historical_absolute_source_paths_used':False,'read_only':True,'no_source_or_blend_writes':True,'approved':False,'gameIntegrated':False,'limits':['Blender imported BYTE_COLOR is preserved across save/reopen; packaged GLB keeps its exact float32 COLOR_0.','Unused source image bytes remain in GLB even when no FILE images are active in the editable scene.','Reopen integrity does not certify geometric or visual perfection.']}
a.out.parent.mkdir(parents=True,exist_ok=True);a.out.write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k not in ('native_color_attributes','images','limits')}))


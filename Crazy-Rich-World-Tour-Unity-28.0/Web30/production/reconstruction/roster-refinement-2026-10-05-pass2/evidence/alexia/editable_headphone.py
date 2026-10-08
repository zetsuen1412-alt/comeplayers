"""Save/reopen a packed native review candidate without rewriting any inputs."""
import bpy,sys,pathlib,json,hashlib,struct
R=pathlib.Path(__file__).resolve().parents[3]
args=sys.argv[sys.argv.index('--')+1:];mode=args[0];glb=pathlib.Path(args[1]).resolve(strict=True);blend=pathlib.Path(args[2]).resolve()
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def signature():
 out=[]
 for o in bpy.context.scene.objects:
  if o.type!='MESH':continue
  h=hashlib.sha256();m=o.data
  for v in m.vertices:h.update(struct.pack('<3f',*v.co))
  for p in m.polygons:h.update(struct.pack('<I',len(p.vertices)));h.update(struct.pack('<'+'I'*len(p.vertices),*p.vertices));h.update(struct.pack('<I?',p.material_index,p.use_smooth))
  for uv in m.uv_layers:
   for u in uv.data:h.update(struct.pack('<2f',*u.uv))
  h.update(struct.pack('<16f',*[v for row in o.matrix_world for v in row]))
  out.append({'name':o.name,'vertices':len(m.vertices),'triangles':len(m.polygons),'uv_layers':len(m.uv_layers),'materials':len(m.materials),'mesh_uv_material_transform_sha256':h.hexdigest()})
 return sorted(out,key=lambda q:q['mesh_uv_material_transform_sha256'])
originalsha=sha(glb)
if mode=='build':
 assert not blend.exists();bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(glb));bpy.context.view_layer.update()
 expected=signature();bpy.context.scene['candidate_sha256']=originalsha;bpy.context.scene['approved']=False;bpy.context.scene['gameIntegrated']=False
 bpy.context.scene['scope']='Concentric conforming headphone detail; original blue eyes, hair, hands, clothes and suitcase preserved.'
 bpy.ops.file.pack_all();blend.parent.mkdir(parents=True,exist_ok=True);bpy.ops.wm.save_as_mainfile(filepath=str(blend))
 receipt={'candidate_sha256':originalsha,'blend_sha256':sha(blend),'expected_meshes':expected,'approved':False,'gameIntegrated':False}
 blend.with_suffix('.build-proof.json').write_text(json.dumps(receipt,indent=2)+'\n')
elif mode=='reopen':
 before=sha(blend);receipt=json.loads(blend.with_suffix('.build-proof.json').read_bytes());assert receipt['blend_sha256']==before and receipt['candidate_sha256']==originalsha
 bpy.ops.wm.open_mainfile(filepath=str(blend));bpy.context.view_layer.update();actual=signature();assert actual==receipt['expected_meshes']
 imgs=[{'name':im.name,'bytes':im.packed_file.size,'sha256':hashlib.sha256(im.packed_file.data).hexdigest()} for im in bpy.data.images if im.source=='FILE'];assert len(imgs)==2
 assert not any(o.type=='ARMATURE' for o in bpy.context.scene.objects);assert sha(blend)==before
 bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(glb));bpy.context.view_layer.update();assert signature()==actual
 assert sha(glb)==originalsha and sha(blend)==before
 result={'blend_sha256':before,'candidate_sha256':originalsha,'native_meshes_equal_fresh_glb_import':True,'mesh_fingerprints':actual,'packed_images':imgs,'file_unchanged':True,'approved':False,'gameIntegrated':False}
 blend.with_suffix('.reopen-proof.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
else:raise ValueError(mode)

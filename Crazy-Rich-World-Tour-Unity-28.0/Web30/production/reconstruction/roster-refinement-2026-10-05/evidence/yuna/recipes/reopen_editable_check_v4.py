import bpy, pathlib, hashlib, json, sys
blend=pathlib.Path(sys.argv[sys.argv.index('--')+1]).resolve(strict=True)
out=blend.with_suffix('.reopen-proof.json')
if out.exists():raise ValueError('Receipt must be new')
before=hashlib.sha256(blend.read_bytes()).hexdigest();bpy.ops.wm.open_mainfile(filepath=str(blend))
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
images=[{'name':im.name,'source':im.source,'packed':im.packed_file is not None,'size':list(im.size)} for im in bpy.data.images if im.source=='FILE']
assert len(meshes)==2 and sorted(len(o.data.vertices) for o in meshes)==[3746,21309]
assert len(images)==2 and all(im['packed'] for im in images)
assert not any(o.type=='ARMATURE' for o in bpy.context.scene.objects)
assert hashlib.sha256(blend.read_bytes()).hexdigest()==before
receipt={'editable_blend_reopened_successfully':True,'blend_sha256':before,'mesh_objects':[{'name':o.name,'vertices':len(o.data.vertices),'polygons':len(o.data.polygons)} for o in meshes],'embedded_images':images,'rig':False,'animation':False,'file_unchanged':True,'approved':False,'gameIntegrated':False}
out.write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf-8');print(json.dumps(receipt))

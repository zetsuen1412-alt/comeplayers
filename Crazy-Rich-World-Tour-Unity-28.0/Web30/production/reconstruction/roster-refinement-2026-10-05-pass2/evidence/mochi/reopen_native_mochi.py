"""Independently reopen the packed candidate in a fresh Blender process."""
import bpy, hashlib, json, pathlib, struct, sys

blend=pathlib.Path(sys.argv[sys.argv.index('--')+1]).resolve(strict=True)
receipt_path=blend.parent/'render-editable-receipt.json'
receipt=json.loads(receipt_path.read_bytes())
output=blend.with_suffix('.reopen-proof.json')
if output.exists():raise ValueError('Reopen proof must be a new file')
sha=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()
expected=receipt['blend_sha256']
assert sha(blend)==expected
bpy.ops.wm.open_mainfile(filepath=str(blend))

def signature(obj):
    mesh=obj.data;h=hashlib.sha256()
    for v in mesh.vertices:h.update(struct.pack('<3f',*v.co))
    for face in mesh.polygons:
        h.update(struct.pack('<I',len(face.vertices)))
        h.update(struct.pack('<'+'I'*len(face.vertices),*face.vertices))
        h.update(struct.pack('<I?',face.material_index,face.use_smooth))
    for layer in mesh.uv_layers:
        for datum in layer.data:h.update(struct.pack('<2f',*datum.uv))
    h.update(struct.pack('<16f',*[value for row in obj.matrix_world for value in row]))
    return {'vertices':len(mesh.vertices),'polygons':len(mesh.polygons),'uv_layers':len(mesh.uv_layers),
            'materials':len(mesh.materials),'sha256':h.hexdigest()}

meshes=[obj for obj in bpy.context.scene.objects if obj.type=='MESH']
fingerprints=[signature(obj) for obj in meshes]
assert len(meshes)==2 and sorted(fingerprints,key=lambda row:row['sha256'])==sorted(receipt['candidate_imported_mesh_fingerprints'],key=lambda row:row['sha256'])
assert receipt['source_imported_mesh_fingerprints'][0] in fingerprints
images=[{'name':image.name,'source':image.source,'packed':image.packed_file is not None,'size':list(image.size),
         'packed_bytes':len(image.packed_file.data) if image.packed_file else 0,
         'packed_sha256':hashlib.sha256(image.packed_file.data).hexdigest() if image.packed_file else None}
        for image in bpy.data.images if image.source=='FILE']
assert len(images)==2 and all(image['packed'] and image['size']==[2048,2048] for image in images)
assert not any(obj.type=='ARMATURE' for obj in bpy.context.scene.objects)
assert len(bpy.data.actions)==0 and sha(blend)==expected
result={'schema':'crwt.mochi_packed_native_reopen.v1','editable_blend_reopened_successfully':True,
        'blend_path':str(blend),'blend_sha256':expected,'source_mesh_fingerprint_retained':True,
        'all_imported_mesh_uv_polygon_transform_fingerprints_retained':True,'mesh_fingerprints':fingerprints,
        'embedded_images':images,'armatures':0,'actions':0,'file_unchanged':True,'approved':False,'gameIntegrated':False,
        'limits':'Native fingerprints test coordinates, polygon indices/material indices/smoothing, UV and world matrix. Raw GLB preservation proof also retains normal/image/material records and BIN; native fingerprint does not separately encode every Blender data channel.'}
with output.open('x',encoding='utf-8',newline='\n') as handle:handle.write(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))

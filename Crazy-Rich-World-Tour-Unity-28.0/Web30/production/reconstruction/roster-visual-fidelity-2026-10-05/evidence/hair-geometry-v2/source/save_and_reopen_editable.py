"""Fresh packed editable import, or independent read-only reopen verification."""
import argparse,collections,hashlib,json,pathlib,struct,sys
import bpy
HERE=pathlib.Path(__file__).resolve().parent
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def images_from_glb(path):
    raw=path.read_bytes();n=struct.unpack_from('<I',raw,12)[0];d=json.loads(raw[20:20+n]);binary=raw[28+n:];rows=[]
    for image in d['images']:
        assert 'bufferView' in image and 'uri' not in image
        v=d['bufferViews'][image['bufferView']];b=binary[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']];rows.append({'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b),'mimeType':image['mimeType']})
    return rows
def fingerprint():
    meshes={};triangles=vertices=0
    for obj in bpy.context.scene.objects:
        if obj.type!='MESH':continue
        mesh=obj.data;mesh.calc_loop_triangles();h=hashlib.sha256()
        for v in mesh.vertices:h.update(struct.pack('<3f',*v.co))
        for poly in mesh.polygons:h.update(struct.pack('<I',len(poly.vertices)));h.update(struct.pack('<'+'I'*len(poly.vertices),*poly.vertices))
        for n in mesh.corner_normals:h.update(struct.pack('<3f',*n.vector))
        for uv in mesh.uv_layers:
            h.update(uv.name.encode()+b'\0')
            for v in uv.data:h.update(struct.pack('<2f',*v.uv))
        meshes[obj.name]={'geometry_topology_corner_normal_uv_sha256':h.hexdigest(),'vertices':len(mesh.vertices),'triangles':len(mesh.loop_triangles),'matrix_world':[float(v) for row in obj.matrix_world for v in row],'materials':[m.name if m else None for m in mesh.materials]};triangles+=len(mesh.loop_triangles);vertices+=len(mesh.vertices)
    def value(v):
        if isinstance(v,(int,float,str,bool)):return v
        try:return list(v)
        except TypeError:return str(v)
    materials={}
    for m in bpy.data.materials:
        if not m.use_nodes:continue
        nodes=[]
        for n in m.node_tree.nodes:nodes.append({'name':n.name,'type':n.bl_idname,'image':n.image.name if hasattr(n,'image') and n.image else None,'inputs':{s.identifier:value(s.default_value) for s in n.inputs if hasattr(s,'default_value')}})
        materials[m.name]={'nodes':sorted(nodes,key=lambda n:n['name']),'links':sorted((l.from_node.name,l.from_socket.identifier,l.to_node.name,l.to_socket.identifier) for l in m.node_tree.links)}
    images=[]
    for im in bpy.data.images:
        if im.source!='FILE':continue
        assert im.packed_file and im.packed_files
        b=bytes(im.packed_file.data);images.append({'name':im.name,'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b),'colorspace':im.colorspace_settings.name,'size':list(im.size)})
    return json.loads(json.dumps({'meshes':meshes,'mesh_count':len(meshes),'triangles':triangles,'vertices':vertices,'materials':materials,'images':sorted(images,key=lambda r:r['name']),'armatures':sum(o.type=='ARMATURE' for o in bpy.data.objects),'actions':len(bpy.data.actions)}))
def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--preservation-proof',type=pathlib.Path,required=True);p.add_argument('--source',type=pathlib.Path,required=True);p.add_argument('--candidate',type=pathlib.Path,required=True);p.add_argument('--blend',type=pathlib.Path,required=True);p.add_argument('--proof',type=pathlib.Path,required=True);p.add_argument('--mode',choices=['create','verify'],required=True);p.add_argument('--build-proof',type=pathlib.Path)
    a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);a.source=a.source.resolve(strict=True);a.candidate=a.candidate.resolve(strict=True);a.preservation_proof=a.preservation_proof.resolve(strict=True);a.blend=a.blend.resolve();a.proof=a.proof.resolve()
    provenance=json.loads(a.preservation_proof.read_text());sourcepin=provenance['source_sha256'];candidatepin=provenance['candidate_sha256'];assert sha(a.source)==sourcepin and sha(a.candidate)==candidatepin
    assert a.blend.is_relative_to(HERE) and a.proof.is_relative_to(HERE) and not a.proof.exists() and a.blend not in {a.source,a.candidate,a.proof,a.preservation_proof}
    embedded=images_from_glb(a.candidate);assert len(embedded)==2
    expected_faces=39032;provenance['id']='alexia'
    if a.mode=='create':
        assert not a.blend.exists();bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(a.candidate));s=bpy.context.scene;s.name='Alexia Existing Rear Hair Volume Review';s['approved']=False;s['gameIntegrated']=False;s['source_sha256']=sourcepin;s['candidate_sha256']=candidatepin;bpy.ops.file.pack_all();fp=fingerprint()
        assert fp['mesh_count']==2 and fp['triangles']==expected_faces and fp['armatures']==fp['actions']==0
        assert collections.Counter(i['sha256'] for i in embedded)==collections.Counter(i['sha256'] for i in fp['images'])
        bpy.ops.wm.save_as_mainfile(filepath=str(a.blend));report={'schema':'crwt.packed-editable-build.v1','id':provenance['id'],'source_sha256':sourcepin,'candidate_sha256':candidatepin,'blend_sha256':sha(a.blend),'blend_bytes':a.blend.stat().st_size,'native_fingerprint':fp,'embedded_images':embedded,'packed_images_byte_identical_to_glb':True,'all_file_images_packed':True,'approved':False,'gameIntegrated':False,'blender_version':bpy.app.version_string}
    else:
        assert a.build_proof;a.build_proof=a.build_proof.resolve(strict=True);build=json.loads(a.build_proof.read_text());blendpin=sha(a.blend);assert blendpin==build['blend_sha256'] and sourcepin==build['source_sha256'] and candidatepin==build['candidate_sha256'];bpy.ops.wm.open_mainfile(filepath=str(a.blend),load_ui=False);fp=fingerprint()
        assert fp==build['native_fingerprint'] and sha(a.blend)==blendpin
        assert collections.Counter(i['sha256'] for i in embedded)==collections.Counter(i['sha256'] for i in fp['images'])
        report={'schema':'crwt.packed-editable-readonly-reopen.v1','id':provenance['id'],'source_sha256':sourcepin,'candidate_sha256':candidatepin,'blend_sha256':blendpin,'saved_geometry_normal_uv_transform_material_image_fingerprints_identical':True,'mesh_count':fp['mesh_count'],'triangles':fp['triangles'],'vertices':fp['vertices'],'images':fp['images'],'armatures':fp['armatures'],'actions':fp['actions'],'all_file_images_packed':True,'packed_images_byte_identical_to_glb':True,'no_source_or_blend_writes':True,'approved':False,'gameIntegrated':False,'blender_version':bpy.app.version_string}
    assert sha(a.source)==sourcepin and sha(a.candidate)==candidatepin
    with a.proof.open('x',encoding='utf-8',newline='\n') as f:f.write(json.dumps(report,indent=2)+'\n')
    print(json.dumps({k:v for k,v in report.items() if k not in {'native_fingerprint','images','embedded_images'}}))
if __name__=='__main__':main()

"""Import the frozen reviewed Luna GLB, pack its images, save/reopen a fresh blend."""
from __future__ import annotations
import argparse
import collections
import hashlib
import json
import struct
import sys
from pathlib import Path
import bpy

HERE=Path(__file__).resolve().parent
SOURCE_SHA='33f8426e3a4d13957c854f6da62d0105ed98555134154ab96d8b38e7c5a58fcc'
CANDIDATE_SHA='2dea095cc34c52bcda460633b0062e9036adfd004e2cc9a519a8ef33d21a6381'

def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()

def glb_images(path):
    raw=path.read_bytes();n,kind=struct.unpack_from('<II',raw,12);assert kind==0x4e4f534a
    doc=json.loads(raw[20:20+n]);offset=20+n;n,kind=struct.unpack_from('<II',raw,offset);assert kind==0x004e4942
    binary=raw[offset+8:offset+8+n];result=[]
    for img in doc['images']:
        assert 'bufferView' in img and 'uri' not in img
        view=doc['bufferViews'][img['bufferView']];start=view.get('byteOffset',0)
        payload=binary[start:start+view['byteLength']]
        result.append({'sha256':hashlib.sha256(payload).hexdigest(),'bytes':len(payload),'mimeType':img['mimeType']})
    assert len(result)==2
    return result

def image_fingerprint():
    result=[]
    images=[i for i in bpy.data.images if i.source=='FILE']
    assert len(images)==2
    for img in images:
        assert img.packed_file and img.packed_files,('Missing packed image',img.name)
        raw=bytes(img.packed_file.data)
        result.append({'name':img.name,'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),
                       'colorspace':img.colorspace_settings.name,'size':list(img.size)})
    return sorted(result,key=lambda row:row['name'])

def default_value(value):
    if isinstance(value,(int,float,str,bool)):return value
    try:return list(value)
    except TypeError:return str(value)

def native_fingerprint():
    meshes={};triangles=vertices=0
    for obj in bpy.context.scene.objects:
        if obj.type!='MESH':continue
        mesh=obj.data;mesh.calc_loop_triangles();h=hashlib.sha256()
        for v in mesh.vertices:h.update(struct.pack('<3f',*v.co))
        for p in mesh.polygons:
            h.update(struct.pack('<I',len(p.vertices)));h.update(struct.pack('<'+'I'*len(p.vertices),*p.vertices))
        for normal in mesh.corner_normals:h.update(struct.pack('<3f',*normal.vector))
        for uv in mesh.uv_layers:
            h.update(uv.name.encode()+b'\0')
            for point in uv.data:h.update(struct.pack('<2f',*point.uv))
        meshes[obj.name]={'mesh_position_topology_corner_normal_uv_sha256':h.hexdigest(),
                         'vertices':len(mesh.vertices),'triangles':len(mesh.loop_triangles),
                         'matrix_world':[float(v) for row in obj.matrix_world for v in row],
                         'materials':[m.name if m else None for m in mesh.materials]}
        triangles+=len(mesh.loop_triangles);vertices+=len(mesh.vertices)
    assert len(meshes)==13 and triangles==55274
    materials={}
    for material in bpy.data.materials:
        if not material.use_nodes:continue
        tree=material.node_tree
        nodes=[]
        for node in tree.nodes:
            nodes.append({'name':node.name,'type':node.bl_idname,'image':node.image.name if hasattr(node,'image') and node.image else None,
                          'inputs':{s.identifier:default_value(s.default_value) for s in node.inputs if hasattr(s,'default_value')}})
        materials[material.name]={'nodes':sorted(nodes,key=lambda n:n['name']),
            'links':sorted((l.from_node.name,l.from_socket.identifier,l.to_node.name,l.to_socket.identifier) for l in tree.links)}
    result={'meshes':meshes,'mesh_count':len(meshes),'triangles':triangles,'vertices':vertices,
            'materials':materials,'images':image_fingerprint(),'armatures':sum(o.type=='ARMATURE' for o in bpy.data.objects),
            'actions':len(bpy.data.actions)}
    return json.loads(json.dumps(result))

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source',type=Path,required=True);p.add_argument('--candidate',type=Path,required=True)
    p.add_argument('--blend',type=Path,required=True);p.add_argument('--proof',type=Path,required=True)
    p.add_argument('--mode',choices=['create','verify'],required=True)
    p.add_argument('--build-proof',type=Path)
    a=p.parse_args(sys.argv[sys.argv.index('--')+1:])
    a.source=a.source.resolve(strict=True);a.candidate=a.candidate.resolve(strict=True)
    a.blend=a.blend.resolve();a.proof=a.proof.resolve()
    assert sha(a.source)==SOURCE_SHA and sha(a.candidate)==CANDIDATE_SHA,'Frozen input hash mismatch'
    assert a.blend.is_relative_to(HERE) and a.proof.is_relative_to(HERE)
    assert a.blend not in {a.source,a.candidate,a.proof} and not a.proof.exists()
    images=glb_images(a.candidate)
    if a.mode=='create':
        assert not a.blend.exists(),'Editable output already exists'
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=str(a.candidate))
        bpy.context.scene.name='Luna Staff Head Review Candidate'
        bpy.context.scene['visual_approved']=False;bpy.context.scene['game_integrated']=False
        bpy.context.scene['source_sha256']=SOURCE_SHA;bpy.context.scene['candidate_glb_sha256']=CANDIDATE_SHA
        bpy.ops.file.pack_all()
        fingerprint=native_fingerprint()
        assert collections.Counter(i['sha256'] for i in images)==collections.Counter(i['sha256'] for i in fingerprint['images'])
        bpy.ops.wm.save_as_mainfile(filepath=str(a.blend))
        result={'schema':'crwt.luna-packed-editable-build.v1','mode':'create','approved':False,'gameIntegrated':False,
                'source_sha256':SOURCE_SHA,'candidate_sha256':CANDIDATE_SHA,'blend_sha256':sha(a.blend),
                'blend_bytes':a.blend.stat().st_size,'candidate_glb_bytes_unchanged':True,
                'embedded_glb_images':images,'all_images_packed':True,'packed_image_bytes_match_glb':True,
                'native_fingerprint':fingerprint,'blender_version':bpy.app.version_string,
                'scope':'Faithful editable import of the reviewed GLB; no geometry/material edits and no rig or clips added.'}
    else:
        assert a.build_proof
        a.build_proof=a.build_proof.resolve(strict=True)
        build=json.loads(a.build_proof.read_text(encoding='utf-8'))
        assert build['source_sha256']==SOURCE_SHA and build['candidate_sha256']==CANDIDATE_SHA
        assert sha(a.blend)==build['blend_sha256']
        frozen_blend_sha=sha(a.blend)
        bpy.ops.wm.open_mainfile(filepath=str(a.blend),load_ui=False)
        fingerprint=native_fingerprint()
        assert fingerprint==build['native_fingerprint'],'Saved native data changed on reopen'
        assert collections.Counter(i['sha256'] for i in images)==collections.Counter(i['sha256'] for i in fingerprint['images'])
        assert sha(a.blend)==frozen_blend_sha
        result={'schema':'crwt.luna-packed-editable-reopen.v1','mode':'verify','approved':False,'gameIntegrated':False,
                'source_sha256':SOURCE_SHA,'candidate_sha256':CANDIDATE_SHA,'blend_sha256':frozen_blend_sha,
                'saved_geometry_normal_uv_transform_material_image_fingerprints_identical':True,
                'mesh_count':fingerprint['mesh_count'],'triangles':fingerprint['triangles'],'vertices':fingerprint['vertices'],
                'image_count':len(fingerprint['images']),'all_images_packed':True,'packed_image_bytes_match_glb':True,
                'images':fingerprint['images'],'armatures':fingerprint['armatures'],'actions':fingerprint['actions'],
                'active_scene':bpy.context.scene.name,'blender_version':bpy.app.version_string,
                'read_only_reopen':True,'no_input_or_blend_writes':True}
    assert sha(a.source)==SOURCE_SHA and sha(a.candidate)==CANDIDATE_SHA
    a.proof.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in result.items() if k!='native_fingerprint'}))

if __name__=='__main__':main()

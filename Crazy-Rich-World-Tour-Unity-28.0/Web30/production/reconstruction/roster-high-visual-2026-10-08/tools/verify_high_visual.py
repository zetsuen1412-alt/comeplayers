"""Check actual selected model identity, protected face, rig and clip streams.

The HIGH pass permits documented hair/body triangle replacement. It does not
reuse the earlier gate which required the complete original triangle stream.
"""
import argparse, hashlib, json, pathlib, struct
import numpy as np
sha=lambda b:hashlib.sha256(b).hexdigest()
def read(p):
    raw=p.read_bytes();assert struct.unpack_from('<4sII',raw)==(b'glTF',2,len(raw))
    n,k=struct.unpack_from('<II',raw,12);assert k==0x4e4f534a
    return json.loads(raw[20:20+n]),raw[28+n:],sha(raw)
def acc(d,b,i):
    a=d['accessors'][i];v=d['bufferViews'][a['bufferView']];w={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
    assert 'sparse' not in a and 'byteStride' not in v
    return np.frombuffer(b,{5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']],count=a['count']*w,offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(a['count'],w)
def main():
    p=argparse.ArgumentParser();p.add_argument('--source',required=True,type=pathlib.Path);p.add_argument('--candidate',required=True,type=pathlib.Path);p.add_argument('--masks',required=True,type=pathlib.Path);p.add_argument('--output',required=True,type=pathlib.Path);a=p.parse_args()
    assert not a.output.exists();s,sb,ssha=read(a.source);d,b,dsha=read(a.candidate);assert ssha=='e18cc26d9662d5ec615fa636150b5f4eddaab9c8ca4c2b3b1ea702bf1d50efca'
    assert d['skins']==s['skins'] and d['animations']==s['animations']
    for skin in s['skins']:
        assert np.array_equal(acc(s,sb,skin['inverseBindMatrices']),acc(d,b,skin['inverseBindMatrices']))
        for j in skin['joints']:assert d['nodes'][j]==s['nodes'][j]
    for key in ['images','textures','samplers']:assert d.get(key)==s.get(key)
    for v in s['images']:
        q=s['bufferViews'][v['bufferView']];r=d['bufferViews'][v['bufferView']];assert sb[q['byteOffset']:q['byteOffset']+q['byteLength']]==b[r['byteOffset']:r['byteOffset']+r['byteLength']]
    for clip in s['animations']:
        for q in clip['samplers']:
            for key in ['input','output']:assert np.array_equal(acc(s,sb,q[key]),acc(d,b,q[key]))
    spr=s['meshes'][0]['primitives'][0];pr=d['meshes'][0]['primitives'][0];streams={}
    for key in ['POSITION','NORMAL','TEXCOORD_0','JOINTS_0','WEIGHTS_0']:
        x=acc(s,sb,spr['attributes'][key]);y=acc(d,b,pr['attributes'][key]);assert np.array_equal(x,y),'Core stream '+key
        streams[key]=sha(x.tobytes())
    masks=np.load(a.masks);protected=np.unique(np.concatenate([masks['mandatory_face_indices'],masks['cup_indices']]))
    old=acc(s,sb,spr['attributes']['COLOR_0']);new=acc(d,b,pr['attributes']['COLOR_0']);assert np.array_equal(old[protected],new[protected]),'Protected face/cup colors'
    faceflag=np.zeros(len(old),bool);faceflag[protected]=True;sourcef=acc(s,sb,spr['indices']).reshape(-1,3);keep=sourcef[faceflag[sourcef].any(1)]
    actual=[]
    for q in d['meshes'][0]['primitives']:
        if q['attributes']['POSITION']==spr['attributes']['POSITION']:actual.append(acc(d,b,q['indices']).reshape(-1,3))
    keys=lambda f:set(map(tuple,f.tolist()))
    assert keys(keep).issubset(keys(np.concatenate(actual))), 'Protected face/cup source triangles removed'
    assert d['meshes'][1]==s['meshes'][1],'Existing precision cups changed'
    for i in range(1,5):assert d['materials'][i]==s['materials'][i]
    drawn=[];extra=[];reachable=set();queue=list(d['scenes'][d.get('scene',0)]['nodes'])
    while queue:
        ni=queue.pop()
        if ni in reachable:continue
        reachable.add(ni);queue.extend(d['nodes'][ni].get('children',[]))
    for ni in sorted(reachable):
        node=d['nodes'][ni]
        if 'mesh' not in node:continue
        for q in d['meshes'][node['mesh']]['primitives']:
            n=acc(d,b,q['attributes']['POSITION']);assert np.isfinite(n).all()
            idx=acc(d,b,q['indices']);assert idx.min()>=0 and idx.max()<len(n)
            if 'WEIGHTS_0' in q['attributes']:
                w=acc(d,b,q['attributes']['WEIGHTS_0']);j=acc(d,b,q['attributes']['JOINTS_0']);assert np.isfinite(w).all() and np.max(np.abs(w.sum(1)-1))<1e-5 and w.min()>=0
                assert j.max()<len(d['skins'][node['skin']]['joints'])
            drawn.append({'node':ni,'mesh':node['mesh'],'material':q.get('material'),'vertices':len(n),'triangles':len(idx)//3})
            if q['attributes']['POSITION']>=len(s['accessors']):extra.append(drawn[-1])
    out={'schema':'crwt.alexia_high_visual_selected_gate.v1','passed':True,'source_sha256':ssha,'candidate_sha256':dsha,'original_core_stream_sha256':streams,'protected_face_and_cup_rows':len(protected),'protected_face_cup_rgb_and_original_triangles_exact':True,'existing_precision_cup_mesh_materials_exact':True,'nineteen_shared_joint_nodes_bind_matrices_and_actual_animation_streams_exact':True,'clips':[{'name':q['name'],'channels':len(q['channels'])} for q in d['animations']],'original_embedded_reference_images_exact':True,'drawn_primitives':drawn,'new_drawn_primitives':extra,'finite_attributes_valid_indices_normalized_skin_weights':True,'visual_review_required':True,'production_approved':False,'gameIntegrated':False}
    a.output.parent.mkdir(parents=True,exist_ok=True);a.output.open('x',encoding='utf-8').write(json.dumps(out,indent=2)+'\n');print(json.dumps({'passed':True,'candidate_sha256':dsha,'triangles':sum(q['triangles'] for q in drawn),'new_primitives':len(extra)}))
if __name__=='__main__':main()

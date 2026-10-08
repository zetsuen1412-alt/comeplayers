"""Create a fresh V8 audit and independently bind the frozen hair ROI chain."""
from pathlib import Path
import hashlib,json,struct
here=Path(__file__).resolve().parent
root=here.parents[3]
base=root/'work/reference-fidelity-2026-10-05'
hair=base/'hair-geometry/trial-v2/alexia-rear-hair-control-candidate.glb'
original=root/'outputs/model-review-2026-10-05-pass2/viewer/models/alexia.glb'
roi=base/'hair-geometry/trial-v2/alexia-rear-hair-control-candidate.frozen-roi.json'
out=here/'hair-roi-v8-chain-audit.json'
script=here/'audit_vertex_colors_v8.py'
assert not out.exists() and not script.exists(), 'Fresh audits only'
frozen={p:p.read_bytes() for p in (hair,original,roi)}
sha=lambda raw:hashlib.sha256(raw).hexdigest()
assert sha(frozen[hair])=='588787b28f0344a64c1cce9b944dd2aafc46d9b84c8cb99c49d7e6e901eff06b'
assert sha(frozen[original])=='d9d868ffd4dbd0829a858df953eced16715742fa5f48dd290d3f08339038a0ae'
def glb(raw):
    n,k=struct.unpack_from('<II',raw,12);assert k==0x4e4f534a
    doc=json.loads(raw[20:20+n]);bn,bk=struct.unpack_from('<II',raw,20+n);assert bk==0x004e4942
    return doc,raw[28+n:28+n+bn]
def floats(doc,binary,accessor):
    a=doc['accessors'][accessor];v=doc['bufferViews'][a['bufferView']];assert a['type']=='VEC3' and a['componentType']==5126
    start=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',12)
    return [binary[start+i*stride:start+i*stride+12] for i in range(a['count'])]
old,ob=glb(frozen[original]);new,nb=glb(frozen[hair]);selection=json.loads(frozen[roi])
selected=selection['vertex_ids'];assert len(selected)==3695 and selected==sorted(set(selected))
op=old['meshes'][0]['primitives'][0];np=new['meshes'][0]['primitives'][0]
positions=floats(old,ob,op['attributes']['POSITION']);newpositions=floats(new,nb,np['attributes']['POSITION'])
normals=floats(old,ob,op['attributes']['NORMAL']);newnormals=floats(new,nb,np['attributes']['NORMAL'])
actual_position_changed=[i for i,(a,b) in enumerate(zip(positions,newpositions)) if a!=b]
actual_normal_changed=[i for i,(a,b) in enumerate(zip(normals,newnormals)) if a!=b]
checks={
 'hair_original_bin_prefix_exact':nb[:len(ob)]==ob,
 'position_changed_exact_frozen_3695_roi':actual_position_changed==selected,
 'normal_changed_exact_frozen_3695_roi':actual_normal_changed==selected,
 'source_indices_exact_accessor_reference':op['indices']==np['indices'],
 'source_uv_exact_accessor_reference':op['attributes']['TEXCOORD_0']==np['attributes']['TEXCOORD_0'],
 'headphone_added_mesh_unchanged':old['meshes'][1:]==new['meshes'][1:],
 'node_scene_skin_animation_unchanged':all(old.get(k)==new.get(k) for k in ['nodes','scenes','scene','skins','animations']),
 'image_texture_material_records_unchanged':all(old.get(k)==new.get(k) for k in ['images','textures','materials','samplers']),
}
points=[struct.unpack('<fff',positions[i]) for i in selected]
checks['all_selected_vertices_in_frozen_rear_coordinate_gate']=all(-.115<=y<=.345 and -lz<-.05 and abs(-lx)<.295 for lx,y,lz in points)
assert all(checks.values()),checks
report={'schema':'crwt.alexia.hair_roi_color_chain.readonly.v1','checks':checks,'all_checks_pass':True,
 'source_sha256':sha(frozen[original]),'hair_candidate_sha256':sha(frozen[hair]),
 'final_color_candidate_sha256':'d37527d948b950f51e9074f6c60af2a3de0795a53e6b3fb02eb90add2f36eaa1',
 'roi_vertices':len(selected),'non_roi_vertices_byte_unchanged':len(positions)-len(selected),
 'visual_scope':'Source ROI mask front/back reviewed; no face/body/hand/earcup selection seen. Final V8 front/back/left/right/quarter reviewed.',
 'visual_limits':['Profiles show a real moderate rear-volume increase, but broad merged hair masses and source texture blur remain.',
                  'Separate reference curls in rear color are not separate newly reconstructed hair geometry.'],
 'global_self_intersection_certificate':False,'approved':False,'gameIntegrated':False,
 'inputs':[{'path':str(p),'sha256':sha(raw),'unchanged_after':True} for p,raw in frozen.items()]}
assert all(p.read_bytes()==raw for p,raw in frozen.items())
with out.open('x',encoding='utf-8',newline='\n') as handle:handle.write(json.dumps(report,indent=2)+'\n')
source=(here/'audit_vertex_colors_v7.py').read_text(encoding='utf-8')
source=source.replace("SOURCE = ROOT/'outputs/model-review-2026-10-05-pass2/viewer/models/alexia.glb'", "SOURCE = ROOT/'work/reference-fidelity-2026-10-05/hair-geometry/trial-v2/alexia-rear-hair-control-candidate.glb'")
source=source.replace('trial-v7','trial-v8').replace('vertex-color-v7','vertex-color-v8').replace('front-projection-v7','front-projection-v8')
source=source.replace('d9d868ffd4dbd0829a858df953eced16715742fa5f48dd290d3f08339038a0ae','588787b28f0344a64c1cce9b944dd2aafc46d9b84c8cb99c49d7e6e901eff06b')
source=source.replace('08aba5a3aae75ecb900fd2934abd10c44ccb46dcbfe8a71586f6854483d522f7','d37527d948b950f51e9074f6c60af2a3de0795a53e6b3fb02eb90add2f36eaa1')
source=source.replace("(['front','left','back','render-evidence'] if trial=='trial-v8' else ['front','left','right','back','three-quarter','render-evidence'])", "['front','left','right','back','three-quarter','render-evidence']")
source=source.replace("'visual_scope':'Front, back and left only; V7 right and quarter were not rendered at audit time.'", "'visual_scope':'All five V8 front, back, left, right, quarter views reviewed; moderate real rear hair volume with residual side blur.'")
with script.open('x',encoding='utf-8',newline='\n') as handle:handle.write(source)
print(json.dumps({'hair_chain_checks':len(checks),'roi':len(selected),'audit_script':str(script)}))

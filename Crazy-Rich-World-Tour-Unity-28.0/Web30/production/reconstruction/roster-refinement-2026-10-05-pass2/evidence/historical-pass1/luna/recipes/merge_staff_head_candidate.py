"""Replace only a frozen staff-head face set; keep all source attribute/image bytes."""
import sys,pathlib,json,hashlib,copy,collections,math
root=pathlib.Path(__file__).resolve().parents[3]
sys.path.insert(0,str(root/'work/model-rebuild/Mochi-tail'))
from inspect_components import read_glb,accessor,world_blender
from attach_tail_candidate import append_accessor,write_glb
sys.path.insert(0,str(root/'work/model-rebuild/tools'))
from validate_roster_candidate import validate_model
folder=pathlib.Path(__file__).parent
source=root/'outputs/model-review-2026-10-04/viewer/models/luna.glb'
target=folder/'trial-v1/luna-staff-head-refined-candidate.glb'
assert not target.exists()
raw,doc,binary=read_glb(source);assert hashlib.sha256(raw).hexdigest()=='33f8426e3a4d13957c854f6da62d0105ed98555134154ab96d8b38e7c5a58fcc'
original=copy.deepcopy(doc);source_bin=bytes(binary)
selection=next(r for r in json.loads((folder/'neck-cut-options.json').read_text()) if r['cut']==.045)
removed=set(selection['selected_face_ids']);assert len(removed)==1101
prim=doc['meshes'][0]['primitives'][0];positions=accessor(doc,binary,prim['attributes']['POSITION']);indices=[v[0] for v in accessor(doc,binary,prim['indices'])];faces=[tuple(indices[i:i+3]) for i in range(0,len(indices),3)]
keys=[tuple(round(v,6) for v in p) for p in positions];rep={}
for i,k in enumerate(keys):rep.setdefault(k,i)
edges=collections.defaultdict(list)
for fi,f in enumerate(faces):
    for a,b in zip(f,f[1:]+f[:1]):edges[tuple(sorted((keys[a],keys[b])))].append((fi,a,b))
boundary=[]
for e,rows in edges.items():
    cut=[r for r in rows if r[0] in removed];keep=[r for r in rows if r[0] not in removed]
    if cut and keep:
        assert len(cut)==len(keep)==1
        _,a,b=cut[0];boundary.append((rep[keys[a]],rep[keys[b]]))
next_edge=dict(boundary);assert len(next_edge)==len(boundary)==13
first=min(next_edge);loop=[first];current=next_edge[first]
while current!=first:
    assert current in next_edge and current not in loop
    loop.append(current);current=next_edge[current]
assert len(loop)==13
# Ear clipping in the dominant plane of this small neck loop. Winding follows
# the removed patch, which is opposite the retained mesh boundary.
world=[world_blender(p) for p in positions]
normal=[0.,0.,0.]
for i,a in enumerate(loop):
    p,q=world[a],world[loop[(i+1)%len(loop)]]
    normal[0]+=(p[1]-q[1])*(p[2]+q[2]);normal[1]+=(p[2]-q[2])*(p[0]+q[0]);normal[2]+=(p[0]-q[0])*(p[1]+q[1])
drop=max(range(3),key=lambda j:abs(normal[j]));axes=[j for j in range(3) if j!=drop]
xy={i:(world[i][axes[0]],world[i][axes[1]]) for i in loop}
def cross2(a,b,c):
    p,q,r=xy[a],xy[b],xy[c];return (q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0])
area=sum(xy[a][0]*xy[loop[(i+1)%len(loop)]][1]-xy[loop[(i+1)%len(loop)]][0]*xy[a][1] for i,a in enumerate(loop));sign=1 if area>0 else -1
def inside(p,a,b,c):return min(sign*cross2(a,b,p),sign*cross2(b,c,p),sign*cross2(c,a,p))>=-1e-14
pending=list(loop);caps=[]
while len(pending)>3:
    found=False
    for i,b in enumerate(pending):
        a,c=pending[i-1],pending[(i+1)%len(pending)]
        if sign*cross2(a,b,c)<=1e-14:continue
        if any(inside(p,a,b,c) for p in pending if p not in (a,b,c)):continue
        caps.append((a,b,c));pending.pop(i);found=True;break
    assert found,'Neck cap cannot be triangulated safely'
caps.append(tuple(pending));assert len(caps)==11
kept=[f for i,f in enumerate(faces) if i not in removed]
retained_bin=bytes(binary)
binary=bytearray(binary)
prim['indices']=append_accessor(doc,binary,[(i,) for f in kept+caps for i in f],'SCALAR',5125,34963)
# Append the Blender-produced accessory with offset indices, retaining every
# original node/material/image/accessor record and original BIN as a prefix.
addon_raw,add,add_bin=read_glb(folder/'trial-v1/luna-staff-head-addon.glb')
assert not add.get('images') and not add.get('textures') and not add.get('skins') and not add.get('animations')
while len(binary)%4:binary.extend(b'\0')
bin_offset=len(binary);binary.extend(add_bin)
view_offset=len(doc['bufferViews']);accessor_offset=len(doc['accessors']);mesh_offset=len(doc['meshes']);node_offset=len(doc['nodes']);material_offset=len(doc['materials'])
for view in add['bufferViews']:
    view=copy.deepcopy(view);view['buffer']=0;view['byteOffset']=bin_offset+view.get('byteOffset',0);doc['bufferViews'].append(view)
for access in add['accessors']:
    access=copy.deepcopy(access);assert 'sparse' not in access;access['bufferView']+=view_offset;doc['accessors'].append(access)
doc['materials'].extend(copy.deepcopy(add['materials']))
for mesh in add['meshes']:
    mesh=copy.deepcopy(mesh)
    for p in mesh['primitives']:
        p['attributes']={k:v+accessor_offset for k,v in p['attributes'].items()};p['indices']+=accessor_offset;p['material']+=material_offset
    doc['meshes'].append(mesh)
for node in add['nodes']:
    node=copy.deepcopy(node)
    if 'mesh' in node:node['mesh']+=mesh_offset
    if 'children' in node:node['children']=[i+node_offset for i in node['children']]
    doc['nodes'].append(node)
doc['scenes'][doc.get('scene',0)]['nodes'].extend([i+node_offset for i in add['scenes'][add.get('scene',0)]['nodes']])
doc.setdefault('extras',{}).update({'visual_approved':False,'game_integrated':False,'source_sha256':hashlib.sha256(raw).hexdigest(),'change':'frozen staff-head face replacement only; original attributes and textures preserved'})
write_glb(target,doc,binary)
output=target.read_bytes();result=validate_model(output)
assert source.read_bytes()==raw
_,new_doc,new_bin=read_glb(target);assert new_bin[:len(source_bin)]==source_bin
for k in ['images','textures']:
    assert new_doc[k]==original[k]
for k in ['nodes','materials','accessors','bufferViews']:
    assert new_doc[k][:len(original[k])]==original[k]
assert new_doc['meshes'][0]['primitives'][0]['attributes']==original['meshes'][0]['primitives'][0]['attributes']
out_faces=kept+caps
counts=collections.Counter()
for f in out_faces:
    for a,b in zip(f,f[1:]+f[:1]):counts[tuple(sorted((keys[a],keys[b])))]+=1
assert set(counts.values())=={2},'Original body seam-welded closure changed'
proof={'source_sha256':hashlib.sha256(raw).hexdigest(),'candidate_sha256':hashlib.sha256(output).hexdigest(),'source_triangles':len(faces),'removed_source_faces':sorted(removed),'removed_source_face_count':len(removed),'retained_source_faces':len(kept),'retained_source_face_order_exact':True,'source_positions_normals_uvs_all_preserved':True,'source_materials_textures_images_preserved':True,'original_bin_prefix_identical':True,'neck_cap_triangles':caps,'neck_boundary_source_vertices':loop,'retained_body_welded_edge_multiplicity_all_two':True,'new_accessory_glb_sha256':hashlib.sha256(addon_raw).hexdigest(),'structural_validation':result,'hidden_accessory_depth':'inferred from single front reference','visual_approved':False,'game_integrated':False}
(target.with_suffix('.source-preservation.json')).write_text(json.dumps(proof,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'path':str(target),'sha256':proof['candidate_sha256'],'removed':len(removed),'retained':len(kept),'neck_cap':len(caps),'validation':result}))

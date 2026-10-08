"""Verify an incremental Alexia side-quality GLB against the frozen animated baseline.

Existing shape/UV/rig/animation/image streams stay exact. Only bounded hair and
upper-side garment RGB may change. Added side locks and an optional fitted
headphone bridge use the existing Head skin.
"""
import argparse, hashlib, json, pathlib, struct
import numpy as np

BASELINE = '6502a072d375d6a63fe52a3974027f4d9aa5263709579583775fd85a98a4deb9'
SEMANTIC_MASK = '10618a926e013a8a8f9f8d932412f17170197bba2cecd3217c838bdc02ba3649'
GARMENT_MASK = 'b517b0f7b8437284206c1ee4f8bf0b4864b02add0ee835d398b54823ae7be511'

def require(value, message):
    if not value: raise ValueError(message)

def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()

def glb(path):
    raw = path.read_bytes()
    require(struct.unpack_from('<4sII', raw) == (b'glTF', 2, len(raw)), 'Invalid GLB header')
    n, kind = struct.unpack_from('<II', raw, 12)
    require(kind == 0x4e4f534a, 'GLB JSON required')
    document = json.loads(raw[20:20+n])
    nb, kind = struct.unpack_from('<II', raw, 20+n)
    require(kind == 0x004e4942 and 28+n+nb == len(raw), 'GLB BIN required')
    return document, raw[28+n:]

def array(d, b, index):
    a = d['accessors'][index]; v = d['bufferViews'][a['bufferView']]
    require('sparse' not in a and v.get('buffer', 0) == 0, 'Simple embedded accessors required')
    width = {'SCALAR':1, 'VEC2':2, 'VEC3':3, 'VEC4':4, 'MAT4':16}[a['type']]
    dtype = np.dtype({5126:'<f4', 5125:'<u4', 5123:'<u2', 5121:'u1'}[a['componentType']])
    return np.ndarray((a['count'], width), dtype=dtype, buffer=b,
        offset=v.get('byteOffset', 0)+a.get('byteOffset', 0),
        strides=(v.get('byteStride', width*dtype.itemsize), dtype.itemsize)).copy()

def mask_indices(data, name, size):
    values = np.asarray(data[name])
    require(values.ndim == 1 and values.dtype.kind in 'iu' and len(np.unique(values)) == len(values)
            and (not len(values) or (values.min() >= 0 and values.max() < size)), 'Invalid mask '+name)
    result = np.zeros(size, bool); result[values] = True
    return result

def transform(node):
    if 'matrix' in node: return np.asarray(node['matrix'], float).reshape(4,4).T
    x,y,z,w = node.get('rotation', [0,0,0,1])
    r = np.array([[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)],
                  [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)],
                  [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]])
    m = np.eye(4); m[:3,:3] = r @ np.diag(node.get('scale', [1,1,1]))
    m[:3,3] = node.get('translation', [0,0,0]); return m

def world_matrices(d):
    parents = {c:i for i,n in enumerate(d['nodes']) for c in n.get('children', [])}; cache = {}
    def get(i):
        if i not in cache: cache[i] = (get(parents[i]) if i in parents else np.eye(4)) @ transform(d['nodes'][i])
        return cache[i]
    return [get(i) for i in range(len(d['nodes']))]

def verify(baseline, candidate, semantic_mask, garment_mask):
    paths = [baseline, candidate, semantic_mask, garment_mask]
    before = {str(p):(digest(p), p.stat().st_mtime_ns) for p in paths}
    require(digest(baseline) == BASELINE and digest(semantic_mask) == SEMANTIC_MASK
            and digest(garment_mask) == GARMENT_MASK, 'Frozen input SHA differs')
    s, sb = glb(baseline); d, db = glb(candidate)
    require(db[:len(sb)] == sb, 'Original animated BIN prefix changed')
    require(d['accessors'][:len(s['accessors'])] == s['accessors'] and
            d['bufferViews'][:len(s['bufferViews'])] == s['bufferViews'], 'Original accessor/view prefix changed')
    permitted = {'accessors','bufferViews','buffers','meshes','materials','extensionsUsed','extensionsRequired'}
    for key in set(s) | set(d):
        if key not in permitted: require(s.get(key) == d.get(key), 'Original metadata changed: '+key)
    for key in ['extensionsUsed','extensionsRequired']:
        require(set(s.get(key, [])) <= set(d.get(key, [])), 'Original extension removed')
    require(d['materials'][:len(s['materials'])] == s['materials'], 'Original materials changed')
    require(len(d['meshes']) == len(s['meshes']) == 3 and d['meshes'][1:] == s['meshes'][1:], 'Original accessory meshes changed')
    sp = s['meshes'][0]['primitives']; dp = d['meshes'][0]['primitives']
    require(1 <= len(dp)-len(sp) <= 2, 'One or two real hair primitives required')
    expected_core = json.loads(json.dumps(s['meshes'][0])); expected_core['primitives'][0]['attributes']['COLOR_0'] = dp[0]['attributes']['COLOR_0']
    expected_core['primitives'] += dp[len(sp):]
    require(d['meshes'][0] == expected_core, 'Existing core fields except RGB replacement changed')
    attrs = sp[0]['attributes']; pos = array(s,sb,attrs['POSITION']).astype(float)*[-1,1,-1]
    old = array(s,sb,attrs['COLOR_0']); new = array(d,db,dp[0]['attributes']['COLOR_0'])
    size = len(old)
    with np.load(semantic_mask, allow_pickle=False) as m:
        hair = mask_indices(m,'hair_indices',size); protected = mask_indices(m,'protected_critical_indices',size)
        cup = mask_indices(m,'cup_indices',size); cuff = mask_indices(m,'cuff_indices',size)
    with np.load(garment_mask, allow_pickle=False) as m:
        garment = mask_indices(m,'allowed_color_indices',size)
    require(int(hair.sum()) == 99032 and int(garment.sum()) == 5174, 'Frozen semantic counts differ')
    require(not np.any(garment & (hair|protected|cup|cuff)), 'Garment mask overlaps protected regions')
    require(new.shape == old.shape and np.isfinite(new).all() and new.min() >= 0 and new.max() <= 1,
            'Existing color stream is invalid')
    changed = np.any(old[:,:3] != new[:,:3], axis=1)
    require(np.array_equal(new[:,3],old[:,3]) and not np.any(changed & protected), 'Protected color/alpha changed')
    require(np.all((hair|garment)[changed]) and np.array_equal(new[~(hair|garment)],old[~(hair|garment)]),
            'Color escaped explicit hair/upper garment scope')
    nodes = [i for i,n in enumerate(d['nodes']) if n.get('mesh') == 0]
    require(len(nodes) == 1, 'One original core mesh instance required')
    mesh_node = nodes[0]; skin = d['skins'][d['nodes'][mesh_node]['skin']]
    heads = [i for i,j in enumerate(skin['joints']) if d['nodes'][j].get('name') == 'AlexiaPrototype_Head']
    require(len(heads) == 1 and len(d['skins']) == 2 and len(skin['joints']) == 19, 'Existing 19-joint/two-skin Head required')
    head = heads[0]; worlds = world_matrices(d)
    ibms = array(d,db,skin['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1)
    bind = np.linalg.inv(worlds[mesh_node]) @ worlds[skin['joints'][head]] @ ibms[head]
    added = []; total_vertices = total_faces = 0
    for prim in dp[len(sp):]:
        require(prim.get('mode',4) == 4 and prim.get('material',-1) >= len(s['materials']), 'New hair requires appended real material')
        a = prim['attributes']; require({'POSITION','NORMAL','JOINTS_0','WEIGHTS_0'} <= set(a), 'Skinned smooth hair attributes missing')
        p = array(d,db,a['POSITION']); n = array(d,db,a['NORMAL']); j = array(d,db,a['JOINTS_0']); w = array(d,db,a['WEIGHTS_0'])
        idx = array(d,db,prim['indices']).reshape(-1)
        require(0 < len(p) <= 20000 and len(p) == len(n) == len(j) == len(w) and len(idx)%3 == 0,
                'Hair primitive counts invalid')
        require(np.isfinite(p).all() and np.isfinite(n).all() and np.isfinite(w).all()
                and idx.min() >= 0 and idx.max() < len(p), 'Hair attributes/index are invalid')
        require(np.max(np.abs(np.linalg.norm(n,axis=1)-1)) < 1e-4, 'New smooth normals are not normalized')
        head_weight = np.sum(np.where(j == head,w,0),axis=1)
        require(np.array_equal(head_weight,np.ones(len(p))) and np.array_equal(w.sum(axis=1),np.ones(len(p)))
                and w.min() >= 0 and j.max() < 19, 'All added hair must use actual Head skin exclusively')
        homogeneous = np.column_stack((p,np.ones(len(p))))
        rest_error = float(np.abs((bind @ homogeneous.T).T[:,:3]-p).max())
        require(rest_error < 2e-7, 'Actual Head inverse-bind does not preserve added rest shape')
        wp = p.astype(float)*[-1,1,-1]; ax = np.abs(wp[:,0]+.006)
        material = d['materials'][prim['material']]
        is_band = material.get('name') == 'Alexia charcoal gold headband'
        if is_band:
            require(ax.max() < .24 and wp[:,1].min() > .25 and wp[:,1].max() < .52
                    and wp[:,2].min() > .015 and wp[:,2].max() < .14
                    and np.all(wp[ax < .12,1] > .43), 'New bridge escaped the upper headphone envelope')
        else:
            require(ax.min() > .085 and ax.max() < .34 and wp[:,1].min() > -.14 and wp[:,1].max() < .44
                    and wp[:,2].min() > -.29 and wp[:,2].max() < .065, 'New hair escaped side/rear envelope')
        triangles = p[idx.reshape(-1,3)].astype(float)
        crosses = np.cross(triangles[:,1]-triangles[:,0],triangles[:,2]-triangles[:,0])
        areas = np.linalg.norm(crosses,axis=1)*.5
        require(areas.min() > 1e-12, 'Degenerate added hair triangle')
        average_normals = n[idx.reshape(-1,3)].astype(float).sum(axis=1)
        require(np.all(np.sum(crosses*average_normals,axis=1) > 0), 'New face disagrees with smooth outward normals')
        edges = np.sort(np.concatenate([idx.reshape(-1,3)[:,[0,1]],idx.reshape(-1,3)[:,[1,2]],idx.reshape(-1,3)[:,[2,0]]]),axis=1)
        _, incidence = np.unique(edges,axis=0,return_counts=True)
        require(np.all(incidence == 2), 'Added hair volume is not closed edge-manifold geometry')
        total_vertices += len(p); total_faces += len(idx)//3
        added.append({'kind':'headphone_bridge' if is_band else 'layered_side_hair',
                      'material_name':material.get('name'),'vertices':len(p),'faces':len(idx)//3,'all_vertices_Head_rigid':True,
                      'rest_inverse_bind_max_error':rest_error,'bounds_world':[wp.min(0).tolist(),wp.max(0).tolist()]})
    require(before == {str(p):(digest(p),p.stat().st_mtime_ns) for p in paths}, 'Input changed during verification')
    require(sum(r['kind']=='layered_side_hair' for r in added)==1 and sum(r['kind']=='headphone_bridge' for r in added)<=1,
            'Exactly one side-hair component and at most one fitted bridge required')
    return {'schema':'crwt.alexia_side_quality_source_gate.v2_fitted_bridge','passed':True,'baseline_sha256':BASELINE,
            'candidate_sha256':digest(candidate),'candidate_bytes':candidate.stat().st_size,
            'semantic_mask_sha256':SEMANTIC_MASK,'garment_mask_sha256':GARMENT_MASK,
            'changed_hair_color_vertices':int((changed&hair).sum()),'changed_garment_color_vertices':int((changed&garment).sum()),
            'original_POSITION_NORMAL_UV_indices_weights_exact':True,'original_nodes_skins_bones_clips_materials_images_exact':True,
            'protected_face_hands_cup_cuff_color_and_all_alpha_exact':True,'original_BIN_accessor_view_prefix_exact':True,
            'added_primitives':added,'added_vertices':total_vertices,'added_faces':total_faces,
            'original_mesh_count':3,'existing_skin_count':2,'joint_count':19,'clips':['IdleBreath','Walk'],
            'all_inputs_unchanged':True,'approved':False,'gameIntegrated':False,
            'limits':['Additional tapered side hair is a manual approximation of the reference, with no physical hair simulation.',
                      'Protected original geometry and gait stay exact; existing lower garment/shoe texture and gait-contact limitations remain.']}

def main():
    p = argparse.ArgumentParser(description=__doc__)
    for name in ['baseline','candidate','semantic-mask','garment-mask','receipt']:p.add_argument('--'+name,type=pathlib.Path,required=True)
    a = p.parse_args(); r = verify(a.baseline,a.candidate,a.semantic_mask,a.garment_mask)
    with a.receipt.open('x',encoding='utf8',newline='\n') as f:json.dump(r,f,indent=2);f.write('\n')
    print(json.dumps(r))

if __name__ == '__main__': main()

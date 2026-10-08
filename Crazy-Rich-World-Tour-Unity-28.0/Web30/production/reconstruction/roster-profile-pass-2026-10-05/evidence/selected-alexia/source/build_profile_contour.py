"""Append bounded Z-only hair controls to a frozen, genuine Alexia GLB.

No original record or BIN byte is rewritten. Only the main POSITION/NORMAL
references point to new arrays. X/Y, topology, UV, images and headphones remain.
"""
import argparse, collections, copy, hashlib, json, math, pathlib, struct

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SOURCE = ROOT/'work/reference-fidelity-2026-10-05/hair-geometry/trial-v2/alexia-rear-hair-control-candidate.glb'
ROI = SOURCE.with_suffix('.frozen-roi.json')
REFERENCE = ROOT/'outputs/model-review-2026-10-05-pass2/references/alexia-blue-v2-turnaround.png'
PIN = '588787b28f0344a64c1cce9b944dd2aafc46d9b84c8cb99c49d7e6e901eff06b'
REFERENCE_PIN = '935b1f8f7d2be4a6a453a089041844f2cd4470eb64be17d9d72568efb3708933'
sha = lambda b: hashlib.sha256(b).hexdigest()

def require(ok, message):
    if not ok: raise ValueError(message)

def read(path):
    raw = path.read_bytes()
    require(struct.unpack_from('<4sII', raw) == (b'glTF', 2, len(raw)), 'Bad GLB')
    n, kind = struct.unpack_from('<II', raw, 12)
    require(kind == 0x4e4f534a, 'JSON chunk')
    d = json.loads(raw[20:20+n])
    count, kind = struct.unpack_from('<II', raw, 20+n)
    require(kind == 0x004e4942 and 28+n+count == len(raw), 'BIN chunk')
    return raw, d, raw[28+n:]

def acc(d, binary, index):
    a = d['accessors'][index]; v = d['bufferViews'][a['bufferView']]
    width = {'VEC2': 2, 'VEC3': 3, 'SCALAR': 1}[a['type']]
    s = struct.Struct('<'+{5126:'f',5125:'I',5123:'H'}[a['componentType']]*width)
    offset = v.get('byteOffset',0)+a.get('byteOffset',0)
    return [s.unpack_from(binary, offset+i*v.get('byteStride',s.size)) for i in range(a['count'])]

def smooth(lo, hi, v):
    t = max(0., min(1., (v-lo)/(hi-lo)))
    return t*t*(3-2*t)

def dot(a,b): return sum(x*y for x,y in zip(a,b))
def cross(a,b): return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])
def sub(a,b): return tuple(x-y for x,y in zip(a,b))
def length(v): return math.sqrt(dot(v,v))
def world(v): return (-v[0], v[1], -v[2])
def packed(v): return struct.pack('<3f',*v)

def base_delta(v):
    x,y,z = v
    # Broad reference-supported bends, rather than further uniform expansion.
    upper_return = .027*math.exp(-.5*((y-.235)/.080)**2)
    middle_roll = -.016*math.exp(-.5*((y-.042)/.053)**2)
    lower_return = .031*math.exp(-.5*((y+.054)/.032)**2)
    weight = (smooth(.057,.135,-z)*smooth(-.115,-.084,y)
              *(1-smooth(.285,.345,y))*(1-smooth(.260,.295,abs(x))))
    # A slight continuous X modulation avoids a uniform lower shelf; XY never moves.
    lower_return *= .88+.12*math.cos(18*x+.35)**2
    return weight*(upper_return+middle_roll+lower_return)

def derivative(fun, v, eps=1e-6):
    values = []
    for k in range(3):
        plus=list(v); minus=list(v); plus[k]+=eps; minus[k]-=eps
        values.append((fun(plus)-fun(minus))/(2*eps))
    return tuple(values)

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source',type=pathlib.Path,default=SOURCE)
    p.add_argument('--roi',type=pathlib.Path,default=ROI)
    p.add_argument('--reference',type=pathlib.Path,default=REFERENCE)
    p.add_argument('--output',type=pathlib.Path,required=True)
    p.add_argument('--strength',type=float,default=1.)
    a=p.parse_args()
    source=a.source.resolve(strict=True); roi_path=a.roi.resolve(strict=True); ref=a.reference.resolve(strict=True)
    out=a.output.resolve(); proof=out.with_suffix('.preservation-proof.json')
    require(out.is_relative_to(HERE) and not out.exists() and not proof.exists(), 'Fresh owned files required')
    require(.4<=a.strength<=1., 'Bounded strength .4..1 required')
    raw,original,oldbin=read(source); roi_raw=roi_path.read_bytes(); ref_raw=ref.read_bytes()
    require(sha(raw)==PIN and sha(ref_raw)==REFERENCE_PIN, 'Pinned source/reference mismatch')
    frozen=json.loads(roi_raw); selected=frozen['vertex_ids']; selectedset=set(selected)
    require(len(selected)==len(selectedset)==3695 and selected==sorted(selected), 'Frozen ROI membership')
    require(frozen['source_sha256']=='d9d868ffd4dbd0829a858df953eced16715742fa5f48dd290d3f08339038a0ae', 'ROI ancestry')
    d=copy.deepcopy(original); binary=bytearray(oldbin); prim=d['meshes'][0]['primitives'][0]
    oldp=acc(original,oldbin,prim['attributes']['POSITION']); oldn=acc(original,oldbin,prim['attributes']['NORMAL'])
    indices=[r[0] for r in acc(original,oldbin,prim['indices'])]; pos=[world(v) for v in oldp]
    require(max(selected)<len(pos) and len(pos)==23425, 'ROI source vertex count')
    # Preserve the inherited affine neighborhood around an existing needle triangle.
    needle_ids=indices[21598*3:21599*3]
    center=tuple(sum(pos[i][k] for i in needle_ids)/3 for k in range(3))
    center_delta=base_delta(center); center_gradient=derivative(base_delta,center)
    def delta(v):
        w=1-smooth(.019,.048,math.dist(v,center))
        affine=center_delta+dot(center_gradient,sub(v,center))
        return a.strength*((1-w)*base_delta(v)+w*affine)
    def mapping(v): return (v[0],v[1],v[2]+delta(v))
    def jacobian(v):
        gx,gy,gz=derivative(delta,v)
        return ((1.,0.,gx),(0.,1.,gy),(0.,0.,1.+gz))
    def cofactor(cols): return (cross(cols[1],cols[2]),cross(cols[2],cols[0]),cross(cols[0],cols[1]))
    newp=list(oldp); newn=list(oldn); determinants=[]; displacements=[]
    for i in selected:
        v=pos[i]; q=mapping(v); cols=jacobian(v); cof=cofactor(cols); determinant=dot(cols[0],cof[0])
        require(determinant>.35 and math.isfinite(determinant), 'Unsafe finite Jacobian')
        determinants.append(determinant); displacements.append(abs(q[2]-v[2]))
        # Repack Z alone so X/Y are exactly the source float32 values.
        newp[i]=(oldp[i][0],oldp[i][1],struct.unpack('<f',struct.pack('<f',-q[2]))[0])
        n=world(oldn[i]); transformed=tuple(sum(cof[j][k]*n[j] for j in range(3)) for k in range(3))
        transformed=tuple(v/length(transformed) for v in transformed)
        newn[i]=struct.unpack('<3f',packed(world(transformed)))
    require(max(displacements)<.030, 'Displacement bound')
    outside=[i for i in range(len(pos)) if i not in selectedset]
    require(all(packed(oldp[i])==packed(newp[i]) and packed(oldn[i])==packed(newn[i]) for i in outside), 'Non-ROI mutation')
    require(all(packed(v)[:8]==packed(newp[i])[:8] for i,v in enumerate(oldp)), 'X/Y changed')
    # Duplicated UV-seam positions must have identical membership and displacement.
    groups=collections.defaultdict(list)
    for i,v in enumerate(oldp): groups[packed(v)].append(i)
    for ids in groups.values():
        require(len({i in selectedset for i in ids})==1, 'Mixed frozen seam selection')
        require(len({packed(newp[i]) for i in ids})==1, 'UV-seam displacement mismatch')
    changed_faces=frozen['incident_face_ids']
    require(changed_faces==[fi for fi in range(len(indices)//3) if any(i in selectedset for i in indices[3*fi:3*fi+3])], 'Frozen face incidence')
    area_ratios=[]; predicted_cosines=[]; old_new_cosines=[]; slivers=[]; face_determinants=[]
    for fi in changed_faces:
        ids=indices[fi*3:fi*3+3]; va,vb,vc=[pos[i] for i in ids]; qa,qb,qc=[world(newp[i]) for i in ids]
        old_normal=cross(sub(vb,va),sub(vc,va)); new_normal=cross(sub(qb,qa),sub(qc,qa))
        old_area=length(old_normal)/2; new_area=length(new_normal)/2
        require(new_area>0. and math.isfinite(new_area), 'Degenerate changed face')
        cosine=dot(old_normal,new_normal)/(length(old_normal)*length(new_normal)); area_ratios.append(new_area/old_area)
        if old_area<1e-10:
            slivers.append({'face_id':fi,'source_area':old_area,'candidate_area':new_area,'actual_normal_cosine':cosine})
            require(cosine>0. and new_area/old_area>.5, 'Pre-existing sliver reversed/collapsed')
        else:
            c=tuple((va[k]+vb[k]+vc[k])/3 for k in range(3)); cols=jacobian(c); cof=cofactor(cols)
            det=dot(cols[0],cof[0]); face_determinants.append(det); require(det>.35, 'Unsafe face-centroid Jacobian')
            expected=tuple(sum(cof[j][k]*old_normal[j] for j in range(3)) for k in range(3))
            value=dot(expected,new_normal)/(length(expected)*length(new_normal)); predicted_cosines.append(value); old_new_cosines.append(cosine)
            require(value>.15 and cosine>0., f'Changed face orientation unsafe: {fi} {value} {cosine}')
    def edge_histogram(values):
        keys=[packed(v) for v in values]; edges=collections.Counter()
        for j in range(0,len(indices),3):
            f=[keys[i] for i in indices[j:j+3]]
            for u,v in zip(f,f[1:]+f[:1]): edges[tuple(sorted((u,v)))]+=1
        return dict(collections.Counter(edges.values()))
    before=edge_histogram(oldp); after=edge_histogram(newp)
    require(before==after=={2:41268}, 'Welded topology changed')
    def append(values):
        while len(binary)%4: binary.append(0)
        offset=len(binary); binary.extend(b''.join(packed(v) for v in values))
        view=len(d['bufferViews']); d['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':len(values)*12,'target':34962})
        accessor=len(d['accessors']); d['accessors'].append({'bufferView':view,'componentType':5126,'type':'VEC3','count':len(values),'min':[min(v[k] for v in values) for k in range(3)],'max':[max(v[k] for v in values) for k in range(3)]})
        return accessor
    prim['attributes']['POSITION']=append(newp); prim['attributes']['NORMAL']=append(newn)
    clone=copy.deepcopy(original); clone['meshes'][0]['primitives'][0]['attributes']=copy.deepcopy(prim['attributes'])
    preserved={k:d.get(k)==original.get(k) for k in ('nodes','scenes','scene','materials','images','textures','samplers','skins','animations')}
    require(all(preserved.values()) and d['meshes']==clone['meshes'] and d['accessors'][:len(original['accessors'])]==original['accessors'] and d['bufferViews'][:len(original['bufferViews'])]==original['bufferViews'] and binary[:len(oldbin)]==oldbin, 'Unexpected source change')
    d['buffers'][0]['byteLength']=len(binary)
    js=json.dumps(d,separators=(',',':')).encode(); js+=b' '*((-len(js))%4); binary+=b'\0'*((-len(binary))%4)
    result=struct.pack('<4sII',b'glTF',2,28+len(js)+len(binary))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(binary),0x004e4942)+binary
    def bands(values):
        return [{'world_y':[lo,lo+.05],'rear_world_z':min(world(values[i])[2] for i in selected if lo<=values[i][1]<lo+.05)} for lo in [-.115,-.065,-.015,.035,.085,.135,.185,.235,.285]]
    report={'schema':'crwt.alexia-profile-contour.v1','approved':False,'gameIntegrated':False,
            'source_path':str(source),'source_sha256':PIN,'roi_path':str(roi_path),'roi_sha256':sha(roi_raw),
            'reference_path':str(ref),'reference_sha256':REFERENCE_PIN,'candidate_path':str(out),'candidate_sha256':sha(result),'candidate_bytes':len(result),
            'recipe_path':str(pathlib.Path(__file__).resolve()),'recipe_sha256':sha(pathlib.Path(__file__).read_bytes()),'strength':a.strength,
            'selected_vertices':len(selected),'actually_position_changed_vertices':sum(packed(oldp[i])!=packed(newp[i]) for i in selected),
            'unchanged_vertices':len(outside),'incident_faces':len(changed_faces),'main_faces':len(indices)//3,'maximum_displacement':max(displacements),
            'minimum_selected_vertex_jacobian_determinant':min(determinants),'minimum_face_centroid_jacobian_determinant':min(face_determinants),
            'minimum_predicted_actual_face_normal_cosine':min(predicted_cosines),'minimum_actual_source_candidate_normal_cosine_non_sliver':min(old_new_cosines),
            'minimum_changed_face_area_ratio':min(area_ratios),'preexisting_slivers':slivers,
            'source_bin_prefix_byte_identical':True,'all_original_accessors_bufferViews_preserved':True,'source_json_records_preserved':preserved,
            'non_roi_positions_normals_byte_identical':True,'all_XY_floatbytes_identical':True,'seam_equivalent_positions_identical':True,
            'indices_UV_images_materials_headphones_preserved':True,'added_vertices':0,'added_triangles':0,'welded_edge_histogram_before':before,'welded_edge_histogram_after':after,
            'rear_bands_before':bands(oldp),'rear_bands_after':bands(newp),
            'needle_affine_control':{'face_id':21598,'center_world':center,'inner_radius':.019,'outer_radius':.048},
            'scope':'Z-only upper return, shallow middle roll and lower taper of inherited 3695-vertex hair ROI. Original front, XY, face, UV, images, body and headphones retained.',
            'limits':['Reference-guided contour experiment; merged clumps and original UV atlas remain.','X/Y preservation prevents staggered hem-height changes or separate curled strands.','Finite Jacobian and face/seam/topology audits are local integrity checks, not exhaustive self-intersection certification.','No rig, game integration, quality approval or perfect-match claim.']}
    require(sha(source.read_bytes())==PIN and sha(roi_path.read_bytes())==sha(roi_raw) and sha(ref.read_bytes())==REFERENCE_PIN,'Input changed')
    out.parent.mkdir(parents=True,exist_ok=True)
    with out.open('xb') as f: f.write(result)
    with proof.open('x',encoding='utf-8',newline='\n') as f: f.write(json.dumps(report,indent=2)+'\n')
    print(json.dumps({k:report[k] for k in ('candidate_path','candidate_sha256','maximum_displacement','minimum_predicted_actual_face_normal_cosine','minimum_selected_vertex_jacobian_determinant')}))

if __name__=='__main__': main()

"""Deform only a frozen existing rear-hair vertex ROI; no added hair meshes.

Original BIN remains a byte-identical prefix. Only main-mesh POSITION/NORMAL
accessor references change; indices, UV, images, materials, headphones and all
other nodes stay exactly unchanged. New attributes retain non-ROI float bytes.
"""
import argparse,collections,copy,hashlib,json,math,pathlib,struct
from inspect_hair_roi import read,acc,PIN,SOURCE
HERE=pathlib.Path(__file__).resolve().parent
sha=lambda b:hashlib.sha256(b).hexdigest()
def require(ok,text):
    if not ok:raise ValueError(text)
def smooth(lo,hi,v):
    t=max(0,min(1,(v-lo)/(hi-lo)));return t*t*(3-2*t)
def dot(a,b):return sum(x*y for x,y in zip(a,b))
def cross(a,b):return(a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])
def sub(a,b):return tuple(x-y for x,y in zip(a,b))
def norm(v):
    n=math.sqrt(dot(v,v));require(n>1e-12,'Zero normal');return tuple(x/n for x in v)
def deform_base(v,strength=1):
    x,y,z=v;w=smooth(.05,.115,-z)*smooth(-.115,-.075,y)*(1-smooth(.275,.345,y))*(1-smooth(.26,.295,abs(x)))
    lower=1-smooth(-.105,.145,y)
    boundaries=[-.168,-.104,-.038,.030,.099,.166]
    groove=max(math.exp(-.5*((x-c-.0075*math.sin(2*math.pi*(y+.065)/.28+j*.43))/.014)**2) for j,c in enumerate(boundaries))
    # Shallow curved valleys and staggered/tapered lower ends are controlled
    # within the existing rear volume. They do not grow new strand curtains.
    dx=(-x*.055*lower+.0035*math.sin(2*math.pi*(y+.06)/.23+x*12)*lower)*w*strength
    dy=(.016*groove*lower+.0035*lower*math.sin(x*24+.4)**2)*w*strength
    bulk=.80+.20*math.exp(-.5*((y-.13)/.13)**2)
    dz=(-.062*bulk+.013*groove*(.45+.55*lower)+.005*math.sin(2*math.pi*(y+.05)/.19)*(1-.5*groove))*w*strength
    return(x+dx,y+dy,z+dz)
AFFINE_CENTER=(.015656570593516,.0-.009423434734344,-.126589655876160)
AFFINE_DELTA=sub(deform_base(AFFINE_CENTER),AFFINE_CENTER)
AFFINE_COLUMNS=[]
for _k in range(3):
    _p=list(AFFINE_CENTER);_m=list(AFFINE_CENTER);_p[_k]+=1e-6;_m[_k]-=1e-6;_dp=sub(deform_base(_p),_p);_dm=sub(deform_base(_m),_m);AFFINE_COLUMNS.append(tuple((a-b)/2e-6 for a,b in zip(_dp,_dm)))
def deform(v,strength=1):
    delta=sub(deform_base(v),v);w=1-smooth(.019,.048,math.dist(v,AFFINE_CENTER));q=sub(v,AFFINE_CENTER);affine=tuple(AFFINE_DELTA[k]+sum(AFFINE_COLUMNS[j][k]*q[j] for j in range(3)) for k in range(3))
    return tuple(v[k]+strength*((1-w)*delta[k]+w*affine[k]) for k in range(3))
def controlled_positions(original_positions,original_normals,positions,indices,keys,hairkeys,tiny_keys,strength):
    selected=[i for i,(x,y,z) in enumerate(positions) if (y>.04 or keys[i] in hairkeys) and -.115<y<.345 and z<-.05 and abs(x)<.295];selectedset=set(selected);feather={keys[i]:1 for i in selected};newp=list(original_positions);newn=list(original_normals);deltas=[];determinants=[]
    for i in selected:
        v=positions[i];q=deform(v,strength);newp[i]=struct.unpack('<3f',struct.pack('<3f',-q[0],q[1],-q[2]));deltas.append(math.dist(v,q));eps=1e-6;cols=[]
        for k in range(3):
            vp=list(v);vm=list(v);vp[k]+=eps;vm[k]-=eps;cols.append(tuple((x-y)/(2*eps) for x,y in zip(deform(vp,strength),deform(vm,strength))))
        c0,c1,c2=cross(cols[1],cols[2]),cross(cols[2],cols[0]),cross(cols[0],cols[1]);det=dot(cols[0],c0);require(det>.20,'Deformation Jacobian lost positive orientation');determinants.append(det)
        nn=original_normals[i];nn=(-nn[0],nn[1],-nn[2]);normal=norm(tuple(c0[k]*nn[0]+c1[k]*nn[1]+c2[k]*nn[2] for k in range(3)));newn[i]=(-normal[0],normal[1],-normal[2])
    changed_faces=[fi for fi in range(len(indices)//3) if any(i in selectedset for i in indices[fi*3:fi*3+3])];areas=[];orientation=[];slivers=[];rotations=[];bad=[]
    for fi in changed_faces:
        ids=indices[3*fi:3*fi+3];oa,ob,oc=[original_positions[i] for i in ids];na,nb,nc=[newp[i] for i in ids];on=cross(sub(ob,oa),sub(oc,oa));nn=cross(sub(nb,na),sub(nc,na));area=math.sqrt(dot(nn,nn))/2;areas.append(area);oldarea=math.sqrt(dot(on,on))/2;cosine=dot(on,nn)/math.sqrt(max(1e-40,dot(on,on)*dot(nn,nn)))
        if oldarea<1e-10:slivers.append({'face_id':fi,'old_area':oldarea,'new_area':area,'old_new_normal_cosine':cosine})
        else:
            rotations.append(cosine);center=tuple(sum(positions[i][k] for i in ids)/3 for k in range(3));eps=1e-6;cols=[]
            for k in range(3):
                vp=list(center);vm=list(center);vp[k]+=eps;vm[k]-=eps;cols.append(tuple((x-y)/(2*eps) for x,y in zip(deform(vp,strength),deform(vm,strength))))
            cof=(cross(cols[1],cols[2]),cross(cols[2],cols[0]),cross(cols[0],cols[1]));wn=(-on[0],on[1],-on[2]);expected=tuple(sum(cof[j][k]*wn[j] for j in range(3)) for k in range(3));expected=(-expected[0],expected[1],-expected[2]);value=dot(expected,nn)/math.sqrt(dot(expected,expected)*dot(nn,nn));orientation.append(value)
            if value<.12:bad.append({'face':fi,'oldarea':oldarea,'cosine':value,'selected':[i in selectedset for i in ids],'world_points':[positions[i] for i in ids]})
    require(min(areas)>1e-15 and min(orientation)>.12,f'Continuous control creates degenerate/flipped substantial face: area{min(areas)} cosine{min(orientation)} examples{bad[:3]} count{len(bad)}')
    return selected,newp,newn,deltas,determinants,feather,changed_faces,areas,orientation,[{'mode':'continuous-coordinate-control-no-internal-pinned-islands','quantization_sensitive_source_slivers':slivers,'minimum_deformation_predicted_actual_face_normal_cosine':min(orientation),'minimum_original_deformed_face_normal_cosine':min(rotations),'orientation_method':'Cofactor Jacobian transforms old face normal at source centroid, compared with actual new float32 triangle normal. Old/new normal rotation alone is not an inversion test.'}]
def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--source',type=pathlib.Path,default=SOURCE);p.add_argument('--inspection',type=pathlib.Path,default=HERE/'source-roi-inspection.json');p.add_argument('--output',type=pathlib.Path,required=True);p.add_argument('--strength',type=float,default=1)
    a=p.parse_args();source=a.source.resolve(strict=True);inspection=a.inspection.resolve(strict=True);out=a.output.resolve();proof=out.with_suffix('.preservation-proof.json');selection=out.with_suffix('.frozen-roi.json');require(out.is_relative_to(HERE) and not any(p.exists() for p in (out,proof,selection)) and .1<=a.strength<=1,'Fresh owned outputs and bounded strength required')
    raw,original,oldbin=read(source);require(sha(raw)==PIN,'Source SHA mismatch');report=json.loads(inspection.read_text());require(report['source_sha256']==PIN,'Inspection pin');d=copy.deepcopy(original);binary=bytearray(oldbin);prim=d['meshes'][0]['primitives'][0]
    original_positions=acc(original,oldbin,prim['attributes']['POSITION']);original_normals=acc(original,oldbin,prim['attributes']['NORMAL']);positions=[(-x,y,-z) for x,y,z in original_positions];indices=[v[0] for v in acc(d,oldbin,prim['indices'])]
    # Union UV seams by exact packed float32 position. Frozen diagnostic color
    # picks are additionally gated to back-only geometry below the crown.
    keys=[tuple(round(v,6) for v in p) for p in original_positions]
    tiny_faces=[];tiny_keys=set()
    for j in range(0,len(indices),3):
        aa,bb,cc=[original_positions[i] for i in indices[j:j+3]];n=cross(sub(bb,aa),sub(cc,aa))
        if math.sqrt(dot(n,n))/2<1e-8:tiny_faces.append(j//3);tiny_keys.update(keys[i] for i in indices[j:j+3])
    hairkeys={keys[row['vertex']] for row in report['rows'] if row['color_rgb'][2]>=row['color_rgb'][0]*.92 and row['color_rgb'][2]>=row['color_rgb'][1] and min(row['color_rgb'])>25}
    selected,newp,newn,deltas,determinants,feather,changed_faces,areas,orientation,steps=controlled_positions(original_positions,original_normals,positions,indices,keys,hairkeys,tiny_keys,a.strength)
    selectedset=set(selected)
    require(len(selected)>1000 and max(deltas)<.070,'Scope/count bound exceeded')
    def append(values):
        while len(binary)%4:binary.append(0)
        offset=len(binary);binary.extend(struct.pack('<'+'f'*len(values)*3,*[v for q in values for v in q]));vi=len(d['bufferViews']);d['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':len(values)*12,'target':34962});ai=len(d['accessors']);d['accessors'].append({'bufferView':vi,'componentType':5126,'type':'VEC3','count':len(values),'min':[min(v[k] for v in values) for k in range(3)],'max':[max(v[k] for v in values) for k in range(3)]});return ai
    prim['attributes']['POSITION']=append(newp);prim['attributes']['NORMAL']=append(newn)
    packedp=acc(d,binary,prim['attributes']['POSITION']);packedn=acc(d,binary,prim['attributes']['NORMAL']);outside=[i for i in range(len(newp)) if i not in selectedset]
    require(all(struct.pack('<3f',*packedp[i])==struct.pack('<3f',*original_positions[i]) and struct.pack('<3f',*packedn[i])==struct.pack('<3f',*original_normals[i]) for i in outside),'Non-ROI attributes changed')
    require(min(areas)>1e-15 and min(orientation)>.05,f'Changed face became degenerate or inverted: area {min(areas)}, cosine {min(orientation)}')
    # A topology-preserving continuous vertex deformation neither opens nor
    # closes source seams. Audit welded incidence before/after explicitly.
    def edges(values):
        keys=[struct.pack('<3f',*v) for v in values];c=collections.Counter()
        for j in range(0,len(indices),3):
            f=[keys[i] for i in indices[j:j+3]]
            for u,v in zip(f,f[1:]+f[:1]):c[tuple(sorted((u,v)))]+=1
        return collections.Counter(c.values())
    before_edges=edges(original_positions);after_edges=edges(packedp);require(before_edges==after_edges,'Welded source incidence changed')
    original_clone=copy.deepcopy(original);original_clone['meshes'][0]['primitives'][0]['attributes']=copy.deepcopy(prim['attributes'])
    preserved={k:d.get(k,[])[:len(original.get(k,[]))]==original.get(k,[]) for k in ('nodes','materials','images','textures','samplers','skins','animations','accessors','bufferViews')};require(all(preserved.values()) and d['meshes']==original_clone['meshes'] and d['scenes']==original['scenes'] and bytes(binary[:len(oldbin)])==oldbin,'Unexpected source mutation')
    d['buffers'][0]['byteLength']=len(binary);js=json.dumps(d,separators=(',',':')).encode();js+=b' '*((-len(js))%4);binary+=b'\0'*((-len(binary))%4);result=struct.pack('<4sII',b'glTF',2,28+len(js)+len(binary))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(binary),0x004e4942)+binary
    roi={'schema':'crwt.alexia-rear-hair-frozen-roi.v2','source_sha256':PIN,'inspection_sha256':sha(inspection.read_bytes()),'vertex_ids':selected,'incident_face_ids':changed_faces,'coordinate_contract':{'world_gltf_Y':[-.115,.345],'world_gltf_Z_max':-.05,'world_gltf_absX_max':.295},'semantic_gate':'Upper rear spatial hair region; lower rear additionally frozen atlas sample colors B>=.92R,B>=G,minRGB>25. Continuous coordinate feather to all ROI boundaries, no internal pinned islands. Crown/front/added headphone mesh unchanged.','vertex_boundary_feather_weights':[feather[keys[i]] for i in selected],'source_vertex_positions_sha256':sha(b''.join(struct.pack('<3f',*original_positions[i]) for i in selected))}
    info={'schema':'crwt.alexia-rear-hair-control.v1','approved':False,'gameIntegrated':False,'source_path':str(source),'source_sha256':PIN,'candidate_path':str(out),'candidate_sha256':sha(result),'candidate_bytes':len(result),'scope':'Existing rear-hair reference-supported depth volume, shallow S-valleys, modest lower taper and staggered tips; no new hair meshes','selected_vertices':len(selected),'unchanged_vertices':len(outside),'incident_changed_faces':len(changed_faces),'source_main_mesh_faces':len(indices)//3,'preexisting_tiny_faces_frozen':tiny_faces,'strength':a.strength,'maximum_vertex_displacement':max(deltas),'minimum_jacobian_determinant_at_selected_vertices':min(determinants),'minimum_changed_face_area':min(areas),'minimum_old_new_face_normal_cosine':min(orientation),'source_bin_prefix_byte_identical':True,'source_json_prefix_records_identical':preserved,'source_indices_uv_images_materials_nodes_mesh_count_preserved':True,'all_non_roi_positions_normals_floatbytes_identical':True,'headphone_added_mesh_preserved_exact':True,'source_welded_edge_incidence_histogram':dict(before_edges),'candidate_welded_edge_incidence_histogram':dict(after_edges),'topology_unchanged':True,'added_vertices':0,'added_triangles':0,'limits':['Rear hair semantic ROI is pinned from actual source UV/color and coordinate inspection; it is not a complete character segmentation.','Reference-supported rear clump control is modest; original UV atlas, grid texture, merged clumps, face and anatomy remain.','Local Jacobian/face orientation and welded-edge tests do not certify every self-intersection or aesthetic fidelity.','No rig, clips or approval added.']}
    info['continuous_control_face_orientation_audit']=steps;info['preexisting_tiny_faces_frozen']=False;info['minimum_deformation_predicted_actual_face_normal_cosine']=info.pop('minimum_old_new_face_normal_cosine');info['face_orientation_scope']='Jacobian-predicted vs actual new normal for source face area>=1e-10; smaller pre-existing sliver triangles separately reported due float32 quantization sensitivity; no global collision certificate.';info['source_needle_face_local_affine_control']={'face_id':21598,'center_world_gltf':AFFINE_CENTER,'full_affine_radius':.019,'smooth_blend_outer_radius':.048,'intent':'The skinny source triangle and neighborhood retain full field displacement through a local affine tangent, without zero-pinned dents or new topology.'}
    require(sha(source.read_bytes())==PIN,'Source changed');out.parent.mkdir(parents=True,exist_ok=True)
    with out.open('xb') as f:f.write(result)
    for path,value in ((proof,info),(selection,roi)):
        with path.open('x',encoding='utf-8',newline='\n') as f:f.write(json.dumps(value,indent=2)+'\n')
    print(json.dumps({k:info[k] for k in ('candidate_path','candidate_sha256','selected_vertices','unchanged_vertices','incident_changed_faces','maximum_vertex_displacement','minimum_deformation_predicted_actual_face_normal_cosine','source_welded_edge_incidence_histogram')}))
if __name__=='__main__':main()

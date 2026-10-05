"""Add only thin closed gold rim beads, seated on a pinned existing goggle surface.

Stdlib recipe. Original goggle/hair/body geometry, atlas, transforms and BIN bytes
stay unchanged. No lens, strap, second goggle pair, rig, or animation is added.
"""
import argparse,collections,copy,hashlib,json,math,pathlib,struct

PINS={'kairo':('8a3a8ddeb2b095e1ee179deffedfe03e091f965517384b06ea8dd9e1cda532fc','8411bc47f221e7e48cd58545068c1ff162f9b9997aa565c0ddbb15a7de595bc8'),
      'zeno':('b79dd20f263f29cf6c9f368d2094cd997567c7ae359339511af0875becbeb7e9','4f3409d6e7dde581ceb022af100d4ce221bf44437148cd8dedc0375153852bcb')}
sha=lambda raw:hashlib.sha256(raw).hexdigest()
def require(ok,message):
    if not ok:raise ValueError(message)
def parse(raw):
    require(struct.unpack_from('<4sII',raw)==(b'glTF',2,len(raw)),'Invalid GLB header')
    n,k=struct.unpack_from('<II',raw,12);require(k==0x4e4f534a,'JSON first');d=json.loads(raw[20:20+n]);o=20+n
    n,k=struct.unpack_from('<II',raw,o);require(k==0x004e4942 and o+8+n==len(raw),'One BIN required');return d,raw[o+8:]
def accessor(d,b,i):
    a=d['accessors'][i];v=d['bufferViews'][a['bufferView']];require('sparse' not in a,'Sparse unsupported')
    n={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];code={5126:'f',5125:'I',5123:'H',5121:'B'}[a['componentType']];s=struct.Struct('<'+code*n);o=v.get('byteOffset',0)+a.get('byteOffset',0)
    return [s.unpack_from(b,o+j*v.get('byteStride',s.size)) for j in range(a['count'])]
def sub(a,b):return tuple(x-y for x,y in zip(a,b))
def dot(a,b):return sum(x*y for x,y in zip(a,b))
def cross(a,b):return(a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])
def norm(v):
    n=math.sqrt(dot(v,v));require(n>1e-12,'Degenerate vector');return tuple(x/n for x in v)
def linear(v):
    v=v/255;return v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4
def solve3(matrix,values):
    rows=[list(row)+[v] for row,v in zip(matrix,values)]
    for j in range(3):
        pivot=max(range(j,3),key=lambda i:abs(rows[i][j]));rows[j],rows[pivot]=rows[pivot],rows[j];require(abs(rows[j][j])>1e-14,'Singular fitted lens plane')
        q=rows[j][j];rows[j]=[v/q for v in rows[j]]
        for i in range(3):
            if i!=j:
                q=rows[i][j];rows[i]=[a-q*b for a,b in zip(rows[i],rows[j])]
    return [r[-1] for r in rows]

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--id',choices=sorted(PINS),required=True);p.add_argument('--source',type=pathlib.Path,required=True);p.add_argument('--reference',type=pathlib.Path,required=True);p.add_argument('--fit',type=pathlib.Path,required=True);p.add_argument('--output',type=pathlib.Path,required=True)
    a=p.parse_args();source=a.source.resolve(strict=True);reference=a.reference.resolve(strict=True);fitpath=a.fit.resolve(strict=True);out=a.output.resolve();proof=out.with_suffix('.preservation-proof.json')
    owned=pathlib.Path(__file__).resolve().parent
    require(out.is_relative_to(owned) and proof.is_relative_to(owned),'Output outside recipe folder');require(not out.exists() and not proof.exists() and out not in {source,reference,fitpath},'Fresh distinct output required')
    raw=source.read_bytes();refr=reference.read_bytes();sourcepin,refpin=PINS[a.id];require(sha(raw)==sourcepin and sha(refr)==refpin,'Pinned input mismatch')
    original,oldbin=parse(raw);require(len(original['meshes'])==1 and original['nodes'][2]['rotation']==[0,1,0,0],'Pinned single mesh/root orientation required')
    d=copy.deepcopy(original);binary=bytearray(oldbin);prim=original['meshes'][0]['primitives'][0]
    pts=[(-x,y,-z) for x,y,z in accessor(original,oldbin,prim['attributes']['POSITION'])];ids=[i[0] for i in accessor(original,oldbin,prim['indices'])];faces=[ids[i:i+3] for i in range(0,len(ids),3)]
    triangles=[]
    for fi,face in enumerate(faces):
        aa,bb,cc=[pts[i] for i in face];den=(bb[1]-cc[1])*(aa[0]-cc[0])+(cc[0]-bb[0])*(aa[1]-cc[1])
        if abs(den)>1e-14:triangles.append((fi,aa,bb,cc,den,min(aa[0],bb[0],cc[0]),max(aa[0],bb[0],cc[0]),min(aa[1],bb[1],cc[1]),max(aa[1],bb[1],cc[1])))
    def hit(x,y):
        result=[]
        for fi,aa,bb,cc,den,x0,x1,y0,y1 in triangles:
            if not(x0-1e-10<=x<=x1+1e-10 and y0-1e-10<=y<=y1+1e-10):continue
            u=((bb[1]-cc[1])*(x-cc[0])+(cc[0]-bb[0])*(y-cc[1]))/den;v=((cc[1]-aa[1])*(x-cc[0])+(aa[0]-cc[0])*(y-cc[1]))/den;w=1-u-v
            if min(u,v,w)>=-1e-8:result.append((u*aa[2]+v*bb[2]+w*cc[2],fi,(u,v,w)))
        require(result,f'No source surface at {x},{y}');return max(result)
    fit=json.loads(fitpath.read_text(encoding='utf-8'));require(fit['id']==a.id and fit['source_sha256']==sourcepin and len(fit['rims'])==2,'Fit/source contract mismatch')
    def append_acc(values,component,kind,target):
        while len(binary)%4:binary.append(0)
        offset=len(binary);flat=[x for row in values for x in row] if kind!='SCALAR' else values;fmt='f' if component==5126 else 'I';data=struct.pack('<'+fmt*len(flat),*flat);binary.extend(data)
        vi=len(d['bufferViews']);d['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':len(data),'target':target});ac={'bufferView':vi,'componentType':component,'count':len(values),'type':kind}
        if kind=='VEC3':ac.update(min=[min(v[k] for v in values) for k in range(3)],max=[max(v[k] for v in values) for k in range(3)])
        ai=len(d['accessors']);d['accessors'].append(ac);return ai
    mi=len(d['materials']);d['materials'].append({'name':a.id+' fitted warm-gold rim bead only','pbrMetallicRoughness':{'baseColorFactor':[linear(v) for v in (234,175,66)]+[1],'metallicFactor':.72,'roughnessFactor':.27},'doubleSided':False})
    rims=[];totalverts=totalfaces=0
    for specification in fit['rims']:
        count=specification.get('segments',128);sides=specification.get('tube_sides',12);radius=specification['tube_radius'];cx,cy=specification['center_xy_gltf'];rx,ry=specification['ellipse_radii'];angle=math.radians(specification['angle_degrees']);lift=specification['surface_lift']
        require(0<radius<.003 and 0<=lift<=.003 and count>=64 and sides>=8,'Only a thin rim bead is permitted')
        centers=[];anchors=[]
        for j in range(count):
            t=2*math.pi*j/count;u,v=rx*math.cos(t),ry*math.sin(t);x=cx+u*math.cos(angle)-v*math.sin(angle);y=cy+u*math.sin(angle)+v*math.cos(angle);z,fi,bary=hit(x,y);centers.append((x,y,z+lift));anchors.append({'source_face_id':fi,'barycentric':bary,'source_hit_world_gltf':[x,y,z]})
        plane=None
        if specification.get('depth_mode')=='fitted-plane':
            excluded=set(specification.get('exclude_depth_samples',[]));samples=[a['source_hit_world_gltf'] for j,a in enumerate(anchors) if j not in excluded];basis=[(1,x-cx,y-cy) for x,y,z in samples]
            coeff=solve3([[sum(row[i]*row[j] for row in basis) for j in range(3)] for i in range(3)],[sum(row[i]*sample[2] for row,sample in zip(basis,samples)) for i in range(3)])
            centers=[(x,y,coeff[0]+coeff[1]*(x-cx)+coeff[2]*(y-cy)+lift) for x,y,z in centers]
            residuals=[c[2]-lift-a['source_hit_world_gltf'][2] for c,a in zip(centers,anchors)]
            kept_max=max(abs(v) for j,v in enumerate(residuals) if j not in excluded)
            occlusion=specification.get('depth_occlusion')=='preserved-touching-fingers'
            if occlusion:
                require(a.id=='zeno' and 32<=len(excluded)<=60 and kept_max<.006 and min(residuals)>-.052 and max(residuals)<.007,'Touching-finger depth fit outside scoped bounds')
            else:require(kept_max<.01 and max(abs(v) for v in residuals)<.025,'Plane is too far from existing rim surface')
            plane={'coefficients_z_constant_dx_dy':coeff,'excluded_source_depth_samples':sorted(excluded),'source_depth_residuals':residuals,'max_absolute_source_depth_residual':max(abs(v) for v in residuals),'max_retained_fit_depth_residual':kept_max,'touching_finger_occlusion_preserved':occlusion,'depth_intent':'regular physical rim plane fitted to retained original visible frame; excluded front rays hit the retained touching fingers, so the bead remains behind those rays. Hidden rim segment depth inferred, not a perfect seating/intersection certificate.' if occlusion else 'regular physical rim plane fitted to retained original front frame; excluded lower-edge rays land on recessed hair, so that short bead segment has inferred supported depth, not an exact seat certificate'}
        positions=[];normals=[];indices=[]
        for j,c in enumerate(centers):
            tangent=norm(sub(centers[(j+1)%count],centers[(j-1)%count]));u=norm(cross(tangent,(0,0,1)));v=norm(cross(tangent,u))
            for k in range(sides):
                t=2*math.pi*k/sides;n=tuple(u[i]*math.cos(t)+v[i]*math.sin(t) for i in range(3));positions.append(tuple(c[i]+radius*n[i] for i in range(3)));normals.append(n)
        for j in range(count):
            for k in range(sides):
                a0=j*sides+k;b0=((j+1)%count)*sides+k;c0=((j+1)%count)*sides+(k+1)%sides;e0=j*sides+(k+1)%sides;indices.extend((a0,b0,c0,a0,c0,e0))
        # Flip only if the packed mesh's signed volume demands it; then exact
        # edge incidence, opposite winding and all triangle areas are audited.
        pa=append_acc(positions,5126,'VEC3',34962);na=append_acc(normals,5126,'VEC3',34962);packed=accessor(d,binary,pa)
        signed=sum(dot(packed[indices[j]],cross(packed[indices[j+1]],packed[indices[j+2]]))/6 for j in range(0,len(indices),3))
        if signed<0:
            for j in range(0,len(indices),3):indices[j+1],indices[j+2]=indices[j+2],indices[j+1]
            signed=-signed
        edges=collections.Counter();directions=collections.Counter();areas=[]
        for j in range(0,len(indices),3):
            f=indices[j:j+3];aa,bb,cc=[packed[k] for k in f];areas.append(math.sqrt(dot(cross(sub(bb,aa),sub(cc,aa)),cross(sub(bb,aa),sub(cc,aa))))/2)
            for aa,bb in zip(f,f[1:]+f[:1]):edges[tuple(sorted((aa,bb)))]+=1;directions[(aa,bb)]+=1
        require(set(edges.values())=={2} and all(directions[(u,v)]==directions[(v,u)]==1 for u,v in edges) and min(areas)>1e-12 and signed>0,'New bead not closed/oriented/nondegenerate')
        ia=append_acc(indices,5125,'SCALAR',34963);mesh=len(d['meshes']);d['meshes'].append({'name':a.id+' existing '+specification['name']+' fitted thin bead','primitives':[{'attributes':{'POSITION':pa,'NORMAL':na},'indices':ia,'material':mi,'mode':4}]});node=len(d['nodes']);d['nodes'].append({'name':d['meshes'][-1]['name'],'mesh':mesh,'extras':{'approved':False,'gameIntegrated':False,'scope':'single narrow trim bead on original rim; original lens and frame retained'}});d['scenes'][d.get('scene',0)]['nodes'].append(node)
        rims.append({'name':specification['name'],'fit':specification,'anchors':anchors,'fitted_depth_plane':plane,'vertices':len(positions),'triangles':len(indices)//3,'closed_edges_all_two':True,'opposite_edge_winding':True,'minimum_triangle_area':min(areas),'signed_volume':signed,'world_gltf_bounds':[[min(v[k] for v in packed) for k in range(3)],[max(v[k] for v in packed) for k in range(3)]],'tube_radius':radius,'frontprojection_centerline_exact':True});totalverts+=len(positions);totalfaces+=len(indices)//3
    frozen=('accessors','bufferViews','meshes','nodes','materials','textures','images','samplers','skins','animations');preserved={k:d.get(k,[])[:len(original.get(k,[]))]==original.get(k,[]) for k in frozen};require(all(preserved.values()),'Original JSON record changed');require(bytes(binary[:len(oldbin)])==oldbin,'BIN prefix changed')
    require(d['scenes'][d.get('scene',0)]['nodes'][:len(original['scenes'][original.get('scene',0)]['nodes'])]==original['scenes'][original.get('scene',0)]['nodes'],'Root transforms changed')
    d['buffers'][0]['byteLength']=len(binary);j=json.dumps(d,separators=(',',':'),ensure_ascii=False).encode();j+=b' '*((-len(j))%4);binary+=b'\0'*((-len(binary))%4);result=struct.pack('<4sII',b'glTF',2,28+len(j)+len(binary))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(binary),0x004e4942)+binary
    require(sha(source.read_bytes())==sourcepin and sha(reference.read_bytes())==refpin,'Input changed');out.parent.mkdir(parents=True,exist_ok=True)
    with out.open('xb') as f:f.write(result)
    report={'schema':'crwt.fitted-goggle-rim-beads.v1','id':a.id,'approved':False,'gameIntegrated':False,'source_path':str(source),'source_sha256':sourcepin,'reference_path':str(reference),'reference_sha256':refpin,'candidate_path':str(out),'candidate_sha256':sha(result),'candidate_bytes':len(result),'fit_sha256':sha(fitpath.read_bytes()),'source_bin_prefix_byte_identical':True,'source_bin_bytes':len(oldbin),'original_json_prefix_records_identical':preserved,'original_positions_normals_uv_indices_images_materials_nodes_unchanged':True,'source_triangles':len(faces),'source_vertices':len(pts),'added_triangles':totalfaces,'added_vertices':totalverts,'added_meshes':2,'added_materials':1,'added_images':0,'source_rig_animation_unchanged':True,'rims':rims,'scope':'Only a narrow real volumetric warm-gold trim bead on each existing goggle rim. No additional opaque lenses, full frames, straps, hair, anatomy or scarf.','limits':['Existing reconstructed lenses, hair, anatomy, texture and rear are unchanged.','Tube thickness/seat depth inferred for a physical trim from the front reference.','Beads intentionally seat slightly into the original rim surface; closedness audit applies to each new bead, not every pre-existing source component or bead/source contact.','Front-ray anchors prove seat on the actual source surface, not a bitmap or perfect aesthetic match.']}
    with proof.open('x',encoding='utf-8',newline='\n') as f:f.write(json.dumps(report,indent=2)+'\n')
    print(json.dumps({k:report[k] for k in ('candidate_path','candidate_sha256','candidate_bytes','source_triangles','added_triangles','added_vertices')}))
if __name__=='__main__':main()

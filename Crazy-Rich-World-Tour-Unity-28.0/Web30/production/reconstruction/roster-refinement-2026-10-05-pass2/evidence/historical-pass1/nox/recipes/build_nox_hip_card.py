"""Append one real volumetric hip card; leave all existing glTF objects/BIN bytes intact."""
import argparse, copy, hashlib, importlib.util, json, math, pathlib, struct

SOURCE_SHA='a7dcf1688b7d6c5131549dd23ebdd2a61e3b3281b6a48f073a961cfdc1cc81c0'
REFERENCE_SHA='185cc0261d0fb8ecba92e0e14fe6398eeda31fd61a594ab9ce9947ae7b1d96d1'
ROOT=pathlib.Path(__file__).resolve().parents[3]
sha=lambda b:hashlib.sha256(b).hexdigest()
def require(ok,msg):
    if not ok: raise ValueError(msg)
def parse(raw):
    require(struct.unpack_from('<4sII',raw)==(b'glTF',2,len(raw)),'Invalid GLB header')
    size,kind=struct.unpack_from('<II',raw,12);require(kind==0x4e4f534a,'JSON first')
    doc=json.loads(raw[20:20+size]);p=20+size
    size,kind=struct.unpack_from('<II',raw,p);require(kind==0x004e4942 and p+8+size==len(raw),'One BIN required')
    return doc,raw[p+8:p+8+size]
def accessor(doc,blob,idx):
    a=doc['accessors'][idx];v=doc['bufferViews'][a['bufferView']]
    fmt={5126:'f',5125:'I',5123:'H',5121:'B'}[a['componentType']];arity={'VEC3':3,'SCALAR':1}[a['type']]
    s=struct.Struct('<'+fmt*arity);offset=v.get('byteOffset',0)+a.get('byteOffset',0)
    return [s.unpack_from(blob,offset+i*v.get('byteStride',s.size)) for i in range(a['count'])]
def area(a,b,c):return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
def triangulate(poly):
    require(sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(poly,poly[1:]+poly[:1]))>0,'CCW polygon required')
    ids=list(range(len(poly)));out=[]
    while len(ids)>3:
        for k,b in enumerate(ids):
            a,c=ids[k-1],ids[(k+1)%len(ids)]
            if area(poly[a],poly[b],poly[c])<=1e-15:continue
            if any(all(area(poly[u],poly[v],poly[j])>=-1e-15 for u,v in ((a,b),(b,c),(c,a))) for j in ids if j not in (a,b,c)):continue
            out.append((a,b,c));ids.pop(k);break
        else:raise ValueError('Polygon triangulation failed')
    out.append(tuple(ids));return out
def rounded_rect(w,h,r,segments=8):
    out=[]
    for cx,cy,start in ((w/2-r,h/2-r,0),(-w/2+r,h/2-r,90),(-w/2+r,-h/2+r,180),(w/2-r,-h/2+r,270)):
        for i in range(segments+1):
            t=math.radians(start+i*90/segments);out.append((cx+r*math.cos(t),cy+r*math.sin(t)))
    return out
def heart(w,h):
    raw=[(16*math.sin(t)**3,13*math.cos(t)-5*math.cos(2*t)-2*math.cos(3*t)-math.cos(4*t)) for t in [2*math.pi*i/64 for i in range(64)]]
    xs=[x for x,y in raw];ys=[y for x,y in raw];yc=(min(ys)+max(ys))/2
    return [(x*w/(max(xs)-min(xs)),(y-yc)*h/(max(ys)-min(ys))) for x,y in reversed(raw)]
def circle(r,n=20):return [(r*math.cos(2*math.pi*i/n),r*math.sin(2*math.pi*i/n)) for i in range(n)]

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--source',type=pathlib.Path,default=ROOT/'outputs/model-review-2026-10-04/viewer/models/nox.glb')
    p.add_argument('--reference',type=pathlib.Path,default=ROOT/'outputs/model-review-2026-10-04/viewer/references/nox.png')
    p.add_argument('--out',type=pathlib.Path,required=True);a=p.parse_args()
    source=a.source.resolve(strict=True);ref=a.reference.resolve(strict=True);out=a.out.resolve();proof=out.with_suffix('.preservation-proof.json')
    require(out!=source and out!=ref and not out.exists() and not proof.exists(),'Only a new output and proof permitted')
    raw=source.read_bytes();require(sha(raw)==SOURCE_SHA,'Source hash mismatch');require(sha(ref.read_bytes())==REFERENCE_SHA,'Reference hash mismatch')
    original,oldbin=parse(raw);d=copy.deepcopy(original);binary=bytearray(oldbin)
    # World glTF +Y up, +Z front. Existing root Y180 is untouched; new card is a distinct world-root node.
    center=(.210,-.010,.185);angle=math.radians(-35);tilt=math.radians(-10)
    def rot(v):
        x,y,z=v;x,y=x*math.cos(angle)-y*math.sin(angle),x*math.sin(angle)+y*math.cos(angle)
        return (x*math.cos(tilt)+z*math.sin(tilt),y,-x*math.sin(tilt)+z*math.cos(tilt))
    def world(v):return tuple(center[i]+rot(v)[i] for i in range(3))
    pools=[{'pos':[],'norm':[],'idx':[]} for _ in range(3)];volumes=[]
    def prism(name,poly,z0,z1,mat,xy=(0,0),reverse=False):
        if reverse:poly=[(-x,-y) for x,y in poly]
        poly=[(x+xy[0],y+xy[1]) for x,y in poly];tri=triangulate(poly);pool=pools[mat]
        def face(coords,n):
            start=len(pool['pos']);pool['pos'].extend(world(c) for c in coords);pool['norm'].extend([rot(n)]*len(coords))
            for i in range(1,len(coords)-1):pool['idx'].extend((start,start+i,start+i+1))
        for a,b,c in tri:
            face([(poly[k][0],poly[k][1],z1) for k in (a,b,c)],(0,0,1))
            face([(poly[k][0],poly[k][1],z0) for k in (c,b,a)],(0,0,-1))
        for i,(x,y) in enumerate(poly):
            xx,yy=poly[(i+1)%len(poly)];dx,dy=xx-x,yy-y;L=math.hypot(dx,dy)
            face([(x,y,z0),(xx,yy,z0),(xx,yy,z1),(x,y,z1)],(dy/L,-dx/L,0))
        volumes.append({'name':name,'material':mat,'boundary_vertices':len(poly),'triangles':2*len(tri)+2*len(poly),'z_thickness':z1-z0})
    prism('Rounded white card, front/back and physical edge',rounded_rect(.052,.078,.0028),-.00175,.00175,0)
    prism('Central raised heart ink',heart(.023,.029),.00176,.00228,1,xy=(0,.001))
    prism('Upper corner heart',heart(.0067,.0082),.00176,.00208,1,xy=(-.018,.026))
    prism('Lower corner heart',heart(.0067,.0082),.00176,.00208,1,xy=(.018,-.026),reverse=True)
    prism('Central white heart spot',circle(.0020),.00230,.00254,0,xy=(0,.005))
    prism('Upper corner black registration pip',circle(.0008,12),.00176,.00205,2,xy=(-.018,.033))
    prism('Lower corner black registration pip',circle(.0008,12),.00176,.00205,2,xy=(.018,-.033))
    matbase=len(d.get('materials',[]));d.setdefault('materials',[]).extend([
        {'name':'Nox new hip card warm white','pbrMetallicRoughness':{'baseColorFactor':[.95,.925,.90,1],'metallicFactor':0,'roughnessFactor':.55}},
        {'name':'Nox new hip card crimson geometric ink','pbrMetallicRoughness':{'baseColorFactor':[.66,.012,.035,1],'metallicFactor':0,'roughnessFactor':.5}},
        {'name':'Nox new hip card black corner pips','pbrMetallicRoughness':{'baseColorFactor':[.012,.008,.013,1],'metallicFactor':0,'roughnessFactor':.5}}])
    def append_acc(values,component,kind,target):
        while len(binary)%4:binary.append(0)
        offset=len(binary);fmt='f' if component==5126 else 'I';flatten=[x for row in values for x in row] if kind=='VEC3' else values
        data=struct.pack('<'+fmt*len(flatten),*flatten);binary.extend(data)
        vi=len(d['bufferViews']);d['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':len(data),'target':target})
        acc={'bufferView':vi,'componentType':component,'count':len(values),'type':kind}
        if kind=='VEC3':acc.update(min=[min(v[k] for v in values) for k in range(3)],max=[max(v[k] for v in values) for k in range(3)])
        ai=len(d['accessors']);d['accessors'].append(acc);return ai
    prim=[];new_points=[];new_faces=[]
    for mi,pool in enumerate(pools):
        pa=append_acc(pool['pos'],5126,'VEC3',34962);na=append_acc(pool['norm'],5126,'VEC3',34962);ia=append_acc(pool['idx'],5125,'SCALAR',34963)
        prim.append({'attributes':{'POSITION':pa,'NORMAL':na},'indices':ia,'material':matbase+mi,'mode':4})
        # Use actual packed float32 output for geometric evidence.
        q=accessor(d,binary,pa);new_points.extend(q);new_faces.extend([tuple(q[pool['idx'][i+k]] for k in range(3)) for i in range(0,len(pool['idx']),3)])
    mesh_index=len(d['meshes']);d['meshes'].append({'name':'Nox missing hip card, volumetric manual candidate','primitives':prim})
    node_index=len(d['nodes']);d['nodes'].append({'name':'Nox new viewer-right hip card, unapproved accessory','mesh':mesh_index,'extras':{'manual_geometry_addition':True,'approved':False,'gameIntegrated':False,'back_design':'plain white; reference exposes front only'}})
    scene_index=d.get('scene',0);d['scenes'][scene_index]['nodes'].append(node_index)
    d['buffers'][0]['byteLength']=len(binary)
    js=json.dumps(d,separators=(',',':'),ensure_ascii=False).encode();js+=b' '*((-len(js))%4);binary+=b'\0'*((-len(binary))%4)
    result=struct.pack('<4sII',b'glTF',2,12+8+len(js)+8+len(binary))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(binary),0x004e4942)+binary
    frozen=('accessors','bufferViews','meshes','nodes','materials','textures','images','samplers','skins','animations')
    preserved={k:d.get(k,[])[:len(original.get(k,[]))]==original.get(k,[]) for k in frozen};require(all(preserved.values()),'Existing JSON object changed')
    require(bytes(binary[:len(oldbin)])==oldbin,'Original BIN prefix changed')
    for k,scene in enumerate(original['scenes']):require(d['scenes'][k]['nodes'][:len(scene['nodes'])]==scene['nodes'],'Original scene roots changed')
    # All original world triangles vs whole new-card AABB. If zero overlap this is a strict conservative separation certificate.
    op=original['meshes'][0]['primitives'][0];points=[(-x,y,-z) for x,y,z in accessor(original,oldbin,op['attributes']['POSITION'])];ids=[x[0] for x in accessor(original,oldbin,op['indices'])]
    lo=[min(v[k] for v in new_points) for k in range(3)];hi=[max(v[k] for v in new_points) for k in range(3)];overlap=[];gaps=[]
    for i in range(0,len(ids),3):
        q=[points[j] for j in ids[i:i+3]];ql=[min(v[k] for v in q) for k in range(3)];qh=[max(v[k] for v in q) for k in range(3)]
        gap=max(max(lo[k]-qh[k],ql[k]-hi[k]) for k in range(3));gaps.append(gap)
        if gap<=0:overlap.append(i//3)
    require(not overlap,'New card bounding box may cross retained source geometry')
    validation_path=ROOT/'work/model-rebuild/tools/validate_roster_candidate.py';spec=importlib.util.spec_from_file_location('roster_validate',validation_path);validator=importlib.util.module_from_spec(spec);spec.loader.exec_module(validator)
    actual=validator.validate_model(result)
    source_pos=accessor(original,oldbin,op['attributes']['POSITION']);welded={}
    # Exact float32 welded edge incidence for new closed volumes (decorations intentionally touch the face, each is a separate solid).
    from collections import Counter
    edges=Counter();signed=0
    for tri in new_faces:
        vv=[]
        for v in tri:
            key=struct.pack('<3f',*v);vv.append(welded.setdefault(key,len(welded)))
        for u,v in zip(vv,vv[1:]+vv[:1]):edges[tuple(sorted((u,v)))]+=1
        aa,bb,cc=tri;signed+=(aa[0]*(bb[1]*cc[2]-bb[2]*cc[1])-aa[1]*(bb[0]*cc[2]-bb[2]*cc[0])+aa[2]*(bb[0]*cc[1]-bb[1]*cc[0]))/6
    require(all(n==2 for n in edges.values()) and signed>0,'New volumes not closed/oriented')
    require(sha(source.read_bytes())==SOURCE_SHA and sha(ref.read_bytes())==REFERENCE_SHA,'Inputs changed')
    report={'schema':'crwt.nox_hip_card_candidate.v1','status':'manual-volumetric-accessory-candidate-unapproved','source_path':str(source),'source_sha256':SOURCE_SHA,'reference_path':str(ref),'reference_sha256':REFERENCE_SHA,'output_sha256':sha(result),'output_bytes':len(result),'source_files_preserved':True,'source_bin_prefix_byte_identical':True,'source_bin_bytes':len(oldbin),'original_json_prefix_records_identical':preserved,'original_source_positions_indices_normals_uv_images_unchanged':True,'original_scene_root_nodes_retained_in_order':True,'source_faces':len(ids)//3,'source_vertices':len(source_pos),'new_faces':len(new_faces),'new_vertices_accessor_count':len(new_points),'new_meshes':1,'new_materials':3,'card_center_world_gltf':center,'card_dimensions':{'width':.052,'height':.078,'thickness':.0035,'corner_radius':.0028},'card_rotations_degrees':{'z':-35,'y':-10},'new_mesh_bounds':{'min':lo,'max':hi},'all_source_triangle_aabbs_checked':len(ids)//3,'whole_accessory_aabb_source_overlap_count':len(overlap),'minimum_separating_axis_gap':min(gaps),'new_welded_edges_count':len(edges),'new_welded_edge_incidence_two':True,'new_total_signed_volume':signed,'volumes':volumes,'actual_glb_validation':actual,'images_added':0,'billboard_added':False,'rig_added':False,'animation_added':False,'approved':False,'gameIntegrated':False,'limits':['Existing reconstruction anatomy/material artifacts remain.','Reference specifies only front card placement/decoration; depth, thickness, rounded edge and plain back are manual inferred construction.','Welded closed-volume check does not certify aesthetic quality or every decoration/card contact; raised ink and white spot are intentionally adjacent physical solids.']}
    out.parent.mkdir(parents=True,exist_ok=True)
    with out.open('xb') as f:f.write(result)
    with proof.open('x',encoding='utf-8',newline='\n') as f:f.write(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'output':str(out),'sha256':sha(result),'source_faces':len(ids)//3,'new_faces':len(new_faces),'bounds':report['new_mesh_bounds'],'source_preserved':True,'validated':actual}))
if __name__=='__main__':main()

"""Append narrow real Yuna palette/brush details, preserving every source GLB geometry/image byte."""
import argparse,copy,hashlib,importlib.util,json,math,pathlib,struct
from collections import Counter
ROOT=pathlib.Path(__file__).resolve().parents[3]
SOURCE_SHA='bf8bcd2c18be7b95ac6725219ac510792b14110d0445827262ade05fb374638e'
REF_SHA='3f4c951ef5efbb00d885cd5e20da6083dcb81ec08034a9e2d1b03b5dd38ef1f4'
sha=lambda b:hashlib.sha256(b).hexdigest()
def require(ok,msg):
    if not ok:raise ValueError(msg)
def parse(b):
    require(struct.unpack_from('<4sII',b)==(b'glTF',2,len(b)),'GLB header')
    size,kind=struct.unpack_from('<II',b,12);require(kind==0x4e4f534a,'JSON first');d=json.loads(b[20:20+size]);o=20+size;n,t=struct.unpack_from('<II',b,o)
    require(t==0x004e4942 and o+n+8==len(b),'One embedded BIN required');return d,b[o+8:o+8+n]
def acc(d,b,i):
    a=d['accessors'][i];v=d['bufferViews'][a['bufferView']];f={5126:'f',5125:'I',5123:'H'}[a['componentType']];n={'VEC3':3,'SCALAR':1}[a['type']];s=struct.Struct('<'+f*n);off=v.get('byteOffset',0)+a.get('byteOffset',0)
    return [s.unpack_from(b,off+j*v.get('byteStride',s.size)) for j in range(a['count'])]
def add(a,b):return tuple(a[i]+b[i] for i in range(3))
def sub(a,b):return tuple(a[i]-b[i] for i in range(3))
def mul(a,s):return tuple(x*s for x in a)
def dot(a,b):return sum(a[i]*b[i] for i in range(3))
def cross(a,b):return (a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])
def unit(v):return mul(v,1/math.sqrt(dot(v,v)))
def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--out',type=pathlib.Path,required=True);a=p.parse_args()
    src=ROOT/'outputs/model-review-2026-10-04/viewer/models/yuna.glb';ref=ROOT/'outputs/model-review-2026-10-04/viewer/references/yuna.png';out=a.out.resolve();proof=out.with_suffix('.preservation-proof.json')
    require(not out.exists() and not proof.exists() and out not in (src,ref),'New outputs only')
    raw=src.read_bytes();require(sha(raw)==SOURCE_SHA and sha(ref.read_bytes())==REF_SHA,'Pinned input hash mismatch')
    old,oldbin=parse(raw);d=copy.deepcopy(old);binary=bytearray(oldbin)
    op=old['meshes'][0]['primitives'][0];points=[(-x,y,-z) for x,y,z in acc(old,oldbin,op['attributes']['POSITION'])];ids=[q[0] for q in acc(old,oldbin,op['indices'])]
    source_triangles=[tuple(points[j] for j in ids[i:i+3]) for i in range(0,len(ids),3)]
    palette_triangles=[q for q in source_triangles if max(v[0] for v in q)<-.145 and min(v[1] for v in q)>-.225 and max(v[1] for v in q)<.055]
    def front_depth(x,y):
        depths=[]
        for aa,bb,cc in palette_triangles:
            if not min(aa[0],bb[0],cc[0])-1e-10<=x<=max(aa[0],bb[0],cc[0])+1e-10 or not min(aa[1],bb[1],cc[1])-1e-10<=y<=max(aa[1],bb[1],cc[1])+1e-10:continue
            den=(bb[1]-cc[1])*(aa[0]-cc[0])+(cc[0]-bb[0])*(aa[1]-cc[1])
            if abs(den)<1e-14:continue
            u=((bb[1]-cc[1])*(x-cc[0])+(cc[0]-bb[0])*(y-cc[1]))/den;v=((cc[1]-aa[1])*(x-cc[0])+(aa[0]-cc[0])*(y-cc[1]))/den;w=1-u-v
            if min(u,v,w)>=-1e-8:depths.append(u*aa[2]+v*bb[2]+w*cc[2])
        require(depths,'Palette paint footprint left existing surface');return max(depths)
    palette_n=unit((-.36,.413,1));palette_w=unit((1,0,.36));palette_v=unit(cross(palette_n,palette_w))
    palettes=[('Warm wood edge',(0.82,.57,.32,1),0,.58),('Brush ferrule satin brass',(.72,.46,.20,1),.72,.30),('Brush collar dark brass',(.48,.24,.065,1),.78,.35),('Palette coral paint',(.68,.075,.12,1),0,.52),('Palette blue paint',(.035,.31,.60,1),0,.52),('Palette mint paint',(.06,.58,.40,1),0,.52),('Palette pale blue paint',(.06,.37,.69,1),0,.52),('Palette red paint',(.72,.065,.12,1),0,.52),('Palette golden paint',(.91,.48,.055,1),0,.52)]
    pools=[{'pos':[],'norm':[],'idx':[]} for _ in palettes];shapes=[]
    def shape(name,mat,verts,faces,normals):
        vol=sum(dot(verts[a],cross(verts[b],verts[c]))/6 for a,b,c in faces)
        if vol<0:faces=[(a,c,b) for a,b,c in faces];vol=-vol
        require(vol>0,'Non-volumetric detail');edges=Counter();directed=Counter()
        for f in faces:
            for u,v in zip(f,f[1:]+f[:1]):edges[tuple(sorted((u,v)))]+=1;directed[(u,v)]+=1
        require(all(x==2 for x in edges.values()),'Detail must be a closed volume')
        require(all(directed[(u,v)]==directed[(v,u)]==1 for u,v in edges),'Closed detail must have consistent outward orientation')
        pool=pools[mat];offset=len(pool['pos']);pool['pos'].extend(verts);pool['norm'].extend(normals);pool['idx'].extend(offset+i for f in faces for i in f)
        shapes.append({'name':name,'material':mat,'vertices':len(verts),'triangles':len(faces),'closed_index_edge_incidence_two':True,'directed_index_edges_balanced':True,'signed_volume_positive':vol,'bounds':[[min(v[k] for v in verts) for k in range(3)],[max(v[k] for v in verts) for k in range(3)]]})
    # Partial wood rim leaves the upper-right grip/finger region free. A real tube capped at both ends, not a drawn contour.
    rim=[];rn=[];segs=100;sides=12;center=(-.278,-.081,.040);radii=(.118,.125);tube=.00235
    for i in range(segs+1):
        t=math.radians(95+240*i/segs);ct,st=math.cos(t),math.sin(t)
        c=add(center,add(mul(palette_w,radii[0]*ct),mul(palette_v,radii[1]*st)));c=add(c,mul(palette_n,.0025))
        radial=unit(add(mul(palette_w,ct/radii[0]),mul(palette_v,st/radii[1])))
        for j in range(sides):
            f=2*math.pi*j/sides;n=add(mul(radial,math.cos(f)),mul(palette_n,math.sin(f)));rim.append(add(c,mul(n,tube)));rn.append(n)
    rf=[]
    for i in range(segs):
        for j in range(sides):
            a0=i*sides+j;a1=i*sides+(j+1)%sides;b0=(i+1)*sides+j;b1=(i+1)*sides+(j+1)%sides;rf.extend(((a0,b0,b1),(a0,b1,a1)))
    for start in (0,segs):
        base=start*sides;c=tuple(sum(rim[base+j][k] for j in range(sides))/sides for k in range(3));idx=len(rim);rim.append(c)
        t=math.radians(95+240*start/segs);tangent=unit(add(mul(palette_w,-radii[0]*math.sin(t)),mul(palette_v,radii[1]*math.cos(t))));rn.append(mul(tangent,-1 if start==0 else 1))
        for j in range(sides):rf.append((idx,base+j,base+(j+1)%sides) if start==0 else (idx,base+(j+1)%sides,base+j))
    shape('Partial 240-degree palette wood edge, upper-right grip left free',0,rim,rf,rn)
    def cylinder(name,start,end,r0,r1,mat,segments=40):
        axis=unit(sub(end,start));u=unit(cross(axis,(0,0,1)));v=unit(cross(axis,u));verts=[];norm=[];faces=[]
        for center,radius in ((start,r0),(end,r1)):
            for i in range(segments):
                t=2*math.pi*i/segments;n=add(mul(u,math.cos(t)),mul(v,math.sin(t)));verts.append(add(center,mul(n,radius)));norm.append(n)
        for i in range(segments):
            j=(i+1)%segments;faces.extend(((i,j,segments+j),(i,segments+j,segments+i)))
        for center,base,n in ((start,0,mul(axis,-1)),(end,segments,axis)):
            idx=len(verts);verts.append(center);norm.append(n)
            for i in range(segments):faces.append((idx,base+(i+1)%segments,base+i) if base==0 else (idx,base+i,base+(i+1)%segments))
        shape(name,mat,verts,faces,norm)
    selection_path=pathlib.Path(__file__).with_name('ferrule-source-face-selection.json');selection_raw=selection_path.read_bytes()
    require(sha(selection_raw)=='3999842cdbaa37929722a21a80fd329f4b6a33dfb15c79873f5a9c7ab1447d2c','Frozen ferrule selection hash changed')
    selection=json.loads(selection_raw);require(selection['source_sha256']==SOURCE_SHA and selection['selection_count']==68,'Ferrule selection provenance mismatch')
    selected=selection['source_face_ids'];require(selected==sorted(set(selected)) and all(type(i) is int and 0<=i<len(source_triangles) for i in selected),'Invalid ferrule membership')
    source_normals=[unit((-x,y,-z)) for x,y,z in acc(old,oldbin,op['attributes']['NORMAL'])]
    for face_id,record in zip(selected,selection['records']):
        q=source_triangles[face_id];vertex_ids=ids[face_id*3:face_id*3+3]
        require(record['source_face']==face_id and record['source_vertex_ids']==vertex_ids and all(list(q[i])==record['world_vertices'][i] for i in range(3)),'Ferrule source face mapping changed')
        fn=unit(cross(sub(q[1],q[0]),sub(q[2],q[0])));top_normals=[source_normals[i] for i in vertex_ids]
        require(min(dot(fn,n) for n in top_normals)>.15,'Ferrule normals disagree with source winding')
        verts=[add(v,mul(fn,.00005)) for v in q]+[add(v,mul(fn,.00050)) for v in q]
        faces=[(0,2,1),(3,4,5)]
        for i in range(3):
            j=(i+1)%3;faces.extend(((i,j,j+3),(i,j+3,i+3)))
        shape('Conforming ferrule closed metal prism, source face '+str(face_id),1,verts,faces,[mul(fn,-1)]*3+top_normals)
    # Small genuine paint volumes conform to the preserved palette at sampled XY points; original albedo is never altered.
    paint=[('Upper-left coral',(-.326,-.018),(.012,.013),3),('Large blue',(-.339,-.062),(.0135,.015),4),('Central mint',(-.276,-.085),(.013,.015),5),('Lower-left pale blue',(-.343,-.119),(.011,.014),6),('Lower coral',(-.311,-.162),(.0135,.016),7),('Lower-right golden',(-.251,-.149),(.0115,.014),8)]
    for label,(cx,cy),(rx,ry),mat in paint:
        verts=[];norm=[];faces=[];half_rings=6;sides=32;lift=.00075;thick=.00055
        # Matched front/back XY triangulation gives a positive-thickness graph over the preserved surface.
        verts.append((cx,cy,front_depth(cx,cy)+lift+thick));norm.append(palette_n)
        for k in range(1,half_rings+1):
            a=(math.pi/2)*k/half_rings
            for j in range(sides):
                t=2*math.pi*j/sides;irregular=1+.045*math.sin(3*t)+.02*math.cos(5*t);x=cx+rx*irregular*math.sin(a)*math.cos(t);y=cy+ry*irregular*math.sin(a)*math.sin(t);z=front_depth(x,y)+lift+thick*math.cos(a)
                verts.append((x,y,z));norm.append(unit((math.sin(a)*math.cos(t)/rx,math.sin(a)*math.sin(t)/ry,math.cos(a)/thick)))
        upper=[]
        for j in range(sides):upper.append((0,1+j,1+(j+1)%sides))
        for k in range(half_rings-1):
            s=1+k*sides
            for j in range(sides):
                q=(j+1)%sides;upper.extend(((s+j,s+sides+j,s+sides+q),(s+j,s+sides+q,s+q)))
        require(all((verts[b][0]-verts[a][0])*(verts[c][1]-verts[a][1])-(verts[b][1]-verts[a][1])*(verts[c][0]-verts[a][0])>0 for a,b,c in upper),'Paint XY graph folded')
        equator=1+(half_rings-1)*sides;mapping={}
        for i in range(len(verts)):
            if i>=equator:mapping[i]=i;continue
            x,y,z=verts[i];mapping[i]=len(verts);verts.append((x,y,2*(front_depth(x,y)+lift)-z));n=norm[i];norm.append((n[0],n[1],-n[2]) if i else mul(palette_n,-1))
        faces=upper+[(mapping[a],mapping[c],mapping[b]) for a,b,c in upper]
        shape('Raised paint: '+label,mat,verts,faces,norm)
        shapes[-1]['matched_front_back_xy_triangles']=True
        shapes[-1]['unfolded_positive_xy_graph']=True
    matbase=len(d.get('materials',[]));d.setdefault('materials',[]).extend([{'name':'Yuna accessory detail · '+name,'pbrMetallicRoughness':{'baseColorFactor':rgba,'metallicFactor':metal,'roughnessFactor':rough}} for name,rgba,metal,rough in palettes])
    def append(values,component,kind,target):
        while len(binary)%4:binary.append(0)
        off=len(binary);flat=[x for row in values for x in row] if kind=='VEC3' else values;data=struct.pack('<'+('f' if component==5126 else 'I')*len(flat),*flat);binary.extend(data)
        view=len(d['bufferViews']);d['bufferViews'].append({'buffer':0,'byteOffset':off,'byteLength':len(data),'target':target});record={'bufferView':view,'componentType':component,'count':len(values),'type':kind}
        if kind=='VEC3':record.update(min=[min(v[k] for v in values) for k in range(3)],max=[max(v[k] for v in values) for k in range(3)])
        index=len(d['accessors']);d['accessors'].append(record);return index
    primitives=[]
    for i,pool in enumerate(pools):
        if not pool['pos']:continue
        pos=append(pool['pos'],5126,'VEC3',34962);norm=append(pool['norm'],5126,'VEC3',34962);indices=append(pool['idx'],5125,'SCALAR',34963);primitives.append({'attributes':{'POSITION':pos,'NORMAL':norm},'indices':indices,'material':matbase+i,'mode':4})
    mi=len(d['meshes']);d['meshes'].append({'name':'Yuna palette edge, raised paint and brush ferrule manual candidate','primitives':primitives})
    ni=len(d['nodes']);d['nodes'].append({'name':'Yuna additive accessory details, unapproved','mesh':mi,'extras':{'approved':False,'gameIntegrated':False,'manual_geometry_only':True,'grip_hole_cut':False}});d['scenes'][d.get('scene',0)]['nodes'].append(ni);d['buffers'][0]['byteLength']=len(binary)
    js=json.dumps(d,separators=(',',':'),ensure_ascii=False).encode();js+=b' '*((-len(js))%4);binary+=b'\0'*((-len(binary))%4)
    result=struct.pack('<4sII',b'glTF',2,12+8+len(js)+8+len(binary))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(binary),0x004e4942)+binary
    keep={k:d.get(k,[])[:len(old.get(k,[]))]==old.get(k,[]) for k in ('accessors','bufferViews','meshes','nodes','materials','textures','images','samplers','skins','animations')};require(all(keep.values()) and bytes(binary[:len(oldbin)])==oldbin,'Original source records changed')
    require(all(d['scenes'][i]['nodes'][:len(s['nodes'])]==s['nodes'] for i,s in enumerate(old['scenes'])),'Scene roots changed')
    spec=importlib.util.spec_from_file_location('validate_roster',ROOT/'work/model-rebuild/tools/validate_roster_candidate.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);actual=module.validate_model(result)
    require(sha(src.read_bytes())==SOURCE_SHA and sha(ref.read_bytes())==REF_SHA,'Inputs changed')
    report={'schema':'crwt.yuna_accessory_refinement.v1','status':'manual-additive-accessory-candidate-unapproved','source_sha256':SOURCE_SHA,'reference_sha256':REF_SHA,'output_sha256':sha(result),'output_bytes':len(result),'source_files_preserved':True,'source_bin_prefix_byte_identical':True,'source_bin_bytes':len(oldbin),'original_json_prefix_records_identical':keep,'all_original_source_positions_indices_normals_uv_images_materials_unchanged':True,'all_original_scene_roots_retained_in_order':True,'all_source_faces_retained':len(ids)//3,'all_source_vertices_retained':len(points),'new_faces':sum(len(x['idx'])//3 for x in pools),'new_vertices':sum(len(x['pos']) for x in pools),'new_meshes':1,'shapes':shapes,'paint_front_depth_from_source_triangles':True,'partial_rim_grip_exclusion_degrees':[335,95],'grip_hole_cut':False,'source_faces_removed':0,'source_vertices_moved':0,'ferrule_selection_sha256':sha(selection_raw),'ferrule_source_face_ids':selected,'ferrule_source_face_mapping_verified':True,'ferrule_coating_mode':'68 closed triangular prisms extruded parallel to exact selected source triangles by0.05..0.50mm; no inferred axis offset','actual_glb_validation':actual,'images_added':0,'billboard_added':False,'approved':False,'gameIntegrated':False,'rig_added':False,'animation_added':False,'limits':['Only additive palette edge, six raised paint spots and brush ferrule are refined.','The existing grip region and holding fingers are unchanged; this does not certify a true thumb hole.','Rim/paint/ferrule contact with accessory surface is intentional; no global intersection certificate is asserted.','Existing character anatomy, hairstyle, face and back texture artifacts remain.','Added physical thickness, paint height and unseen accessory details are manual inference from the visible reference.']}
    out.parent.mkdir(parents=True,exist_ok=True)
    with out.open('xb') as f:f.write(result)
    with proof.open('x',encoding='utf-8',newline='\n') as f:f.write(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'out':str(out),'sha256':sha(result),'bytes':len(result),'new_faces':report['new_faces'],'actual':actual}))
if __name__=='__main__':main()

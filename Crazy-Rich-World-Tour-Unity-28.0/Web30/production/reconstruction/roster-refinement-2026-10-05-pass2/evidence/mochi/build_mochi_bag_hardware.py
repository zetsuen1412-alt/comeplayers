"""Add reference-supported closed bag hardware; retain every source GLB byte channel."""
import argparse, collections, copy, hashlib, importlib.util, json, math, pathlib, struct
from inspect_accessories import ROOT, SOURCE, REFERENCE, EXPECTED, REF_EXPECTED, accessor, load, parse, visible_surface

sha=lambda raw:hashlib.sha256(raw).hexdigest()

def require(ok,message):
    if not ok:raise ValueError(message)

def rounded_rect(w,h,r,segments=8):
    return [(cx+r*math.cos(math.radians(start+i*90/segments)),cy+r*math.sin(math.radians(start+i*90/segments)))
            for cx,cy,start in ((w/2-r,h/2-r,0),(-w/2+r,h/2-r,90),(-w/2+r,-h/2+r,180),(w/2-r,-h/2+r,270)) for i in range(segments+1)]

def area(a,b,c):return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])

def triangulate(poly):
    ids=list(range(len(poly)));result=[]
    while len(ids)>3:
        for k,b in enumerate(ids):
            a,c=ids[k-1],ids[(k+1)%len(ids)]
            if area(poly[a],poly[b],poly[c])<=1e-15:continue
            if any(all(area(poly[u],poly[v],poly[j])>=-1e-15 for u,v in ((a,b),(b,c),(c,a))) for j in ids if j not in (a,b,c)):continue
            result.append((a,b,c));ids.pop(k);break
        else:raise ValueError('Invalid polygon triangulation')
    result.append(tuple(ids));return result

def cross(a,b):return (a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--out',required=True,type=pathlib.Path);args=parser.parse_args()
    output=args.out.resolve();proof=output.with_suffix('.preservation-proof.json')
    owned=pathlib.Path(__file__).resolve().parent
    require(output.is_relative_to(owned) and output not in (SOURCE,REFERENCE) and not output.exists() and not proof.exists(),'New own output only; no overwrite')
    raw,original,oldbin,source_points,source_indices,triangles,texture=load()
    reference_raw=REFERENCE.read_bytes();require(sha(reference_raw)==REF_EXPECTED,'Reference pin differs')
    document=copy.deepcopy(original);binary=bytearray(oldbin)
    pools=[{'pos':[],'norm':[],'idx':[]} for _ in range(2)];solids=[];all_new_triangles=[];support_hits={};source_support_faces=set()

    def surface(x,y):
        key=(x,y)
        if key not in support_hits:
            hit=visible_surface(triangles,x,y);support_hits[key]=hit
            source_support_faces.add(hit['face_id'])
        return support_hits[key]['z']

    def posed(poly,center,angle):
        c,s=math.cos(math.radians(angle)),math.sin(math.radians(angle))
        return [(center[0]+c*x-s*y,center[1]+s*x+c*y) for x,y in poly]

    def add_solid(name,front_faces,back_faces,side_faces,material,parameters):
        pool=pools[material];faces=front_faces+back_faces+side_faces
        start=len(all_new_triangles)
        for face in faces:
            for k in range(1,len(face)-1):
                tri=(face[0],face[k],face[k+1]);a,b,c=tri
                normal=cross(tuple(b[j]-a[j] for j in range(3)),tuple(c[j]-a[j] for j in range(3)))
                length=math.sqrt(sum(x*x for x in normal));require(length>1e-14,'Degenerate added face')
                n=tuple(x/length for x in normal);first=len(pool['pos'])
                pool['pos'].extend(tri);pool['norm'].extend([n]*3);pool['idx'].extend((first,first+1,first+2))
                all_new_triangles.append(tuple(struct.unpack('<3f',struct.pack('<3f',*v)) for v in tri))
        face_range=(start,len(all_new_triangles))
        solids.append({'name':name,'material':material,'triangle_range':list(face_range),'parameters_world_gltf':parameters})

    def ring(name,center,angle,outer,inner,z0,z1,material=0):
        outer=posed(outer,center,angle);inner=posed(inner,center,angle);require(len(outer)==len(inner),'Matched ring loops required')
        loops=[]
        for poly,depth in ((outer,z0),(outer,z1),(inner,z0),(inner,z1)):
            loops.append([(x,y,surface(x,y)+depth) for x,y in poly])
        ob,of,ib,iff=loops;front=[];back=[];sides=[];n=len(outer)
        for i in range(n):
            j=(i+1)%n
            front.append((of[i],of[j],iff[j],iff[i]));back.append((ob[j],ob[i],ib[i],ib[j]))
            sides.append((ob[i],ob[j],of[j],of[i]));sides.append((ib[j],ib[i],iff[i],iff[j]))
        add_solid(name,front,back,sides,material,{'center_xy':list(center),'rotation_z_degrees':angle,'rear_offset_from_sampled_source':z0,'front_offset_from_sampled_source':z1,'perimeter_samples':n,'physical_open_center':True})

    def plaque(name,center,angle,poly,z0,z1,material):
        poly=posed(poly,center,angle);front=[(x,y,surface(x,y)+z1) for x,y in poly];back=[(x,y,surface(x,y)+z0) for x,y in poly]
        tris=triangulate(poly);ff=[tuple(front[i] for i in t) for t in tris];bb=[tuple(back[i] for i in reversed(t)) for t in tris]
        sides=[(back[i],back[(i+1)%len(poly)],front[(i+1)%len(poly)],front[i]) for i in range(len(poly))]
        add_solid(name,ff,bb,sides,material,{'center_xy':list(center),'rotation_z_degrees':angle,'rear_offset_from_sampled_source':z0,'front_offset_from_sampled_source':z1,'matched_xy_front_back':True})

    ring('Shoulder strap buckle: real rounded brass frame with open center',(-.0704,-.0847),-43,
         rounded_rect(.032,.034,.0037),rounded_rect(.0257,.0277,.0020),.0006,.0034)
    ring('Bag flap clasp: brass frame with physical opening',(.1357,-.1741),-7,
         rounded_rect(.026,.034,.0030),rounded_rect(.0196,.0276,.0020),.0006,.0038)
    plaque('Bag clasp inset: teal leather enamel face',(.1357,-.1741),-7,
           rounded_rect(.0190,.0270,.0018),.0007,.0024,1)
    plaque('Small brass central clasp stud: inferred simple hardware, no invented logo',(.1357,-.1741),-7,
           rounded_rect(.0062,.0068,.0013),.0025,.0033,0)
    ring('Lower clasp keeper: thin brass loop around existing teal strap',(.1278,-.2085),-7,
         rounded_rect(.0205,.0205,.0040),rounded_rect(.0155,.0155,.0020),.0006,.0030)

    # Prove each actual packed-float32 added solid is closed and consistently oriented.
    for solid in solids:
        edges=collections.Counter();directed=collections.Counter();welded={};signed=0.;first,last=solid['triangle_range']
        for tri in all_new_triangles[first:last]:
            ids=[welded.setdefault(struct.pack('<3f',*v),len(welded)) for v in tri]
            for a,b in zip(ids,ids[1:]+ids[:1]):edges[tuple(sorted((a,b)))]+=1;directed[(a,b)]+=1
            a,b,c=tri;normal=cross(b,c);signed+=sum(a[j]*normal[j] for j in range(3))/6
        require(all(count==2 for count in edges.values()),'New solid has a boundary/nonmanifold edge')
        require(all(directed[(a,b)]==directed[(b,a)]==1 for a,b in edges),'New solid has inconsistent winding')
        require(signed>1e-12,'New solid has nonpositive volume')
        solid.update(triangles=last-first,welded_vertices=len(welded),welded_edges=len(edges),edge_incidence_two=True,directed_edges_balanced=True,signed_volume=signed)

    material_base=len(document['materials']);document['materials'].extend([
        {'name':'Mochi manual brass bag hardware, candidate','pbrMetallicRoughness':{'baseColorFactor':[.58,.31,.070,1],'metallicFactor':.65,'roughnessFactor':.38}},
        {'name':'Mochi manual teal clasp inset, candidate','pbrMetallicRoughness':{'baseColorFactor':[.020,.22,.25,1],'metallicFactor':.10,'roughnessFactor':.44}}])

    def append_accessor(values,component,kind,target):
        while len(binary)%4:binary.append(0)
        offset=len(binary);flat=[x for row in values for x in row] if kind=='VEC3' else values
        payload=struct.pack('<'+('f' if component==5126 else 'I')*len(flat),*flat);binary.extend(payload)
        view=len(document['bufferViews']);document['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':len(payload),'target':target})
        acc={'bufferView':view,'componentType':component,'count':len(values),'type':kind}
        if kind=='VEC3':acc.update(min=[min(p[k] for p in values) for k in range(3)],max=[max(p[k] for p in values) for k in range(3)])
        index=len(document['accessors']);document['accessors'].append(acc);return index

    primitives=[]
    for material,pool in enumerate(pools):
        primitives.append({'attributes':{'POSITION':append_accessor(pool['pos'],5126,'VEC3',34962),'NORMAL':append_accessor(pool['norm'],5126,'VEC3',34962)},
                           'indices':append_accessor(pool['idx'],5125,'SCALAR',34963),'mode':4,'material':material_base+material})
    mesh=len(document['meshes']);document['meshes'].append({'name':'Mochi reference-supported bag hardware, 5 closed new solids','primitives':primitives})
    node=len(document['nodes']);document['nodes'].append({'name':'Mochi brass buckles and teal clasp, additive unapproved','mesh':mesh,
        'extras':{'approved':False,'gameIntegrated':False,'manual_geometry_addition':True,'scope':'Shoulder strap buckle and bag flap clasp only; all source appendages/body preserved'}})
    document['scenes'][document.get('scene',0)]['nodes'].append(node);document['buffers'][0]['byteLength']=len(binary)
    js=json.dumps(document,separators=(',',':'),ensure_ascii=False).encode();js+=b' '*(-len(js)%4);binary+=b'\0'*(-len(binary)%4)
    result=struct.pack('<4sII',b'glTF',2,12+8+len(js)+8+len(binary))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(binary),0x004e4942)+binary
    parsed,newbin=parse(result)
    keys=('accessors','bufferViews','meshes','nodes','materials','textures','images','samplers','skins','animations')
    preserved={key:parsed.get(key,[])[:len(original.get(key,[]))]==original.get(key,[]) for key in keys}
    require(all(preserved.values()) and newbin[:len(oldbin)]==oldbin,'Existing geometry/material/image/node/BIN changed')
    for i,scene in enumerate(original['scenes']):require(parsed['scenes'][i]['nodes'][:len(scene['nodes'])]==scene['nodes'],'Source scene roots changed')
    validator_path=ROOT/'work/model-rebuild/tools/validate_roster_candidate.py';spec=importlib.util.spec_from_file_location('roster_validate',validator_path);validator=importlib.util.module_from_spec(spec);spec.loader.exec_module(validator)
    validation=validator.validate_model(result)
    positions=[p for pool in pools for p in accessor(parsed,newbin,primitives[pools.index(pool)]['attributes']['POSITION'])]
    source_bounds=[[min(p[k] for p in source_points) for k in range(3)],[max(p[k] for p in source_points) for k in range(3)]]
    added_bounds=[[min(p[k] for p in positions) for k in range(3)],[max(p[k] for p in positions) for k in range(3)]]
    require(all(source_bounds[0][k]<added_bounds[0][k] and added_bounds[1][k]<source_bounds[1][k] for k in range(3)),'New hardware unexpectedly expands overall bounds')
    require(sha(SOURCE.read_bytes())==EXPECTED and REFERENCE.read_bytes()==reference_raw,'Frozen source/reference changed')
    report={'schema':'crwt.mochi_bag_hardware_candidate.v1','status':'manual-reference-supported-accessory-candidate-unapproved',
        'source_path':str(SOURCE),'source_sha256':EXPECTED,'reference_path':str(REFERENCE),'reference_sha256':REF_EXPECTED,
        'output_sha256':sha(result),'output_bytes':len(result),'source_files_preserved':True,'source_bin_prefix_byte_identical':True,'source_bin_bytes':len(oldbin),
        'original_json_prefix_records_identical':preserved,'source_positions_indices_normals_uv_images_unchanged':True,
        'original_scene_root_nodes_retained_in_order':True,'source_active_triangles':len(source_indices)//3,'source_position_accessor_count':len(source_points),
        'source_faces_removed':0,'source_vertices_moved':0,'source_appendages_and_oct04_connector_preserved':True,
        'new_faces':len(all_new_triangles),'new_vertices_accessor_count':sum(len(pool['pos']) for pool in pools),'new_meshes':1,'new_materials':2,
        'new_solid_count':len(solids),'new_solids':solids,'source_support_method':'Visible front +Z barycentric hit on unchanged source world triangles at each added boundary sample',
        'source_support_face_ids':sorted(source_support_faces),'source_support_sample_count':len(support_hits),'source_bounds_world_gltf':source_bounds,'new_hardware_bounds_world_gltf':added_bounds,
        'overall_bounds_unchanged':True,'actual_glb_validation':validation,'images_added':0,'billboard_added':False,'rig_added':False,'animation_added':False,
        'approved':False,'gameIntegrated':False,'global_self_intersection_certified':False,
        'limitations':['Source body, face, paws, hat, both original appendages and Oct04 connector are unchanged; existing surface/texture softness remains.',
          'Front reference supports buckle/clasp placement and brass/teal colors; edge depth, precise hardware thickness and simple central stud are manually inferred.',
          'Each new solid is individually closed and consistently oriented. Hardware follows source surface and intentional surface contacts are not a global intersection-free certificate.',
          'Structural preservation and topology checks do not certify visual approval, deformation or game runtime readiness.']}
    output.parent.mkdir(parents=True,exist_ok=True)
    with output.open('xb') as handle:handle.write(result)
    with proof.open('x',encoding='utf-8',newline='\n') as handle:handle.write(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'output':str(output),'sha256':sha(result),'bytes':len(result),'new_faces':report['new_faces'],'solids':len(solids),'source_preserved':True,'validation':validation},indent=2))

if __name__=='__main__':main()

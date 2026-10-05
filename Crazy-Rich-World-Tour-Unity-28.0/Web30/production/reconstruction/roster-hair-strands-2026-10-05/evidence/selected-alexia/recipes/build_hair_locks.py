"""Append two capped, flattened 3-D curl locks to a pinned Alexia mesh.

All original GLB BIN bytes/accessors/meshes/materials remain untouched. New
curves use genuine elliptical volume with triangles and normals, no image
planes. Manual reference-supported XY guides are provisional, not camera solves.
"""
import argparse,collections,copy,hashlib,io,json,math,pathlib,struct
from PIL import Image

HERE=pathlib.Path(__file__).resolve().parent
ROOT=HERE.parents[2]
SOURCE=ROOT/'outputs/model-review-2026-10-05-profile-pass/viewer/models/alexia.glb'
REFERENCE=ROOT/'outputs/model-review-2026-10-05-profile-pass/references/alexia-blue-v2-turnaround.png'
SOURCE_PIN='7ad88d0117c667e01877763e301b5cde8cca27985151cbb21be7b076b37b5cf3'
REF_PIN='935b1f8f7d2be4a6a453a089041844f2cd4470eb64be17d9d72568efb3708933'
sha=lambda b:hashlib.sha256(b).hexdigest()

def require(value,message):
    if not value:raise ValueError(message)

def read_glb(raw):
    require(struct.unpack_from('<4sII',raw)==(b'glTF',2,len(raw)),'GLB header')
    n,k=struct.unpack_from('<II',raw,12);require(k==0x4e4f534a,'GLB JSON')
    d=json.loads(raw[20:20+n]);nb,k=struct.unpack_from('<II',raw,20+n)
    require(k==0x004e4942 and len(raw)==28+n+nb,'GLB BIN')
    return d,raw[28+n:]

def add(a,b):return tuple(x+y for x,y in zip(a,b))
def sub(a,b):return tuple(x-y for x,y in zip(a,b))
def mul(a,t):return tuple(x*t for x in a)
def dot(a,b):return sum(x*y for x,y in zip(a,b))
def cross(a,b):return (a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])
def length(a):return math.sqrt(dot(a,a))
def norm(a):return mul(a,1/length(a))
def local(a):return (-a[0],a[1],-a[2])
def f32(a):return struct.unpack('<'+'f'*len(a),struct.pack('<'+'f'*len(a),*a))
def smooth(lo,hi,x):
    t=max(0,min(1,(x-lo)/(hi-lo)));return t*t*(3-2*t)

# Full widths .046-.050; half depth .0055-.006. The illustrated rear tips
# are manually traced (not claimed exact). Depth and roots are inferred.
LOCKS=[
 {'id':'rear-inner-plus','half_width':.025,'half_depth':.006,'points':[
  [.066,.157,-.164],[.109,.117,-.193],[.129,.070,-.215],[.134,.030,-.219],
  [.096,-.015,-.204],[.055,-.041,-.177],[.045,-.084,-.151],[.063,-.091,-.142]]},
 {'id':'rear-inner-minus','half_width':.023,'half_depth':.0055,'points':[
  [-.034,.153,-.170],[-.051,.113,-.196],[-.077,.069,-.219],[-.089,.024,-.224],
  [-.052,-.019,-.199],[-.022,-.049,-.170],[-.020,-.090,-.147],[-.046,-.103,-.137]]}
]

def catmull(points,t):
    n=len(points)-1;s=min(n-1,int(t*n));u=t*n-s
    p0=points[max(0,s-1)];p1=points[s];p2=points[s+1];p3=points[min(n,s+2)]
    return tuple(.5*((2*p1[k])+(-p0[k]+p2[k])*u+(2*p0[k]-5*p1[k]+4*p2[k]-p3[k])*u*u+(-p0[k]+3*p1[k]-3*p2[k]+p3[k])*u*u*u) for k in range(3))

def sample_rgb(im,x,y):
    x=max(0,min(im.width-1.001,x));y=max(0,min(im.height-1.001,y))
    ix,iy=int(x),int(y);fx,fy=x-ix,y-iy
    return tuple(sum(im.getpixel((ix+dx,iy+dy))[k]*wx*wy for dx,wx in [(0,1-fx),(1,fx)] for dy,wy in [(0,1-fy),(1,fy)])/255 for k in range(3))

def purple(c):return c[2]-c[1]>.04 and c[2]-c[0]>.018 and min(c)>.28
def linear(c):return tuple(x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4 for x in c)

def color(im,p,n):
    x,y,z=p;nx,ny,nz=n
    back=sample_rgb(im,1287+(-.006-x)*494.4,503+(.479059-y)*494.4)
    if nx>=0:side=sample_rgb(im,1268-(z-.092)*484.69,18+(.479059-y)*484.69)
    else:side=sample_rgb(im,236+(z-.062)*491.19,507+(.479059-y)*491.19)
    base=back if purple(back) else (212/255,195/255,239/255)
    w=smooth(.35,.92,abs(nx))*.55
    if purple(side):base=tuple((1-w)*a+w*b for a,b in zip(base,side))
    # Conservative fixed shading matches the existing unlit baked reference.
    # This is a volume mesh color attribute, not a texture rectangle.
    shade=.95+.05*max(0,-nz)
    return f32((*linear(tuple(v*shade for v in base)),1.))

def build_lock(spec,variant,im):
    count=81;radial=16;points=copy.deepcopy(spec['points'])
    # Milder variant retains the same silhouette guides, and retracts inferred
    # depth by <=.006. Both candidates remain within -.24 rear depth.
    if variant=='mild':
        for j,p in enumerate(points):p[2]+=.006*smooth(0,2,j)*(1-smooth(6,7,j))
    centers=[catmull(points,j/(count-1)) for j in range(count)]
    pos=[];uv=[];faces=[]
    for j,c in enumerate(centers):
        t=j/(count-1)
        tang=norm(sub(catmull(points,min(1,t+.0001)),catmull(points,max(0,t-.0001))))
        # Depth axis toward rear, projected perpendicular to the tangent.
        depth=norm(sub((0,0,-1),mul(tang,dot((0,0,-1),tang))))
        width=norm(cross(depth,tang))
        # Broad attached ribbon above; narrow hooked curl and fine rounded tip.
        taper=(.28+.72*smooth(0,.13,t))*(1-.965*smooth(.69,1,t))
        hw=spec['half_width']*taper;hd=spec['half_depth']*taper
        for k in range(radial):
            angle=2*math.pi*k/radial
            p=add(c,add(mul(width,hw*math.cos(angle)),mul(depth,hd*math.sin(angle))))
            pos.append(f32(p));uv.append(f32((k/radial,t)))
    for j in range(count-1):
        for k in range(radial):
            a=j*radial+k;b=j*radial+(k+1)%radial;c=(j+1)*radial+k;d=(j+1)*radial+(k+1)%radial
            faces.extend([(a,b,c),(b,d,c)])
    root=len(pos);pos.append(f32(centers[0]));uv.append((.5,0))
    tip=len(pos);pos.append(f32(centers[-1]));uv.append((.5,1))
    for k in range(radial):
        faces.append((root,(k+1)%radial,k))
        faces.append((tip,(count-1)*radial+k,(count-1)*radial+(k+1)%radial))
    volume=sum(dot(pos[a],cross(pos[b],pos[c]))/6 for a,b,c in faces)
    if volume<0:faces=[(a,c,b) for a,b,c in faces];volume=-volume
    normals=[(0,0,0)]*len(pos);areas=[];edges=collections.Counter();directed=collections.Counter()
    for a,b,c in faces:
        n=cross(sub(pos[b],pos[a]),sub(pos[c],pos[a]));area=length(n)/2;areas.append(area)
        require(area>1e-12 and math.isfinite(area),'New degenerate triangle')
        for i in (a,b,c):normals[i]=add(normals[i],n)
        for u,v in [(a,b),(b,c),(c,a)]:edges[tuple(sorted((u,v)))]+=1;directed[(u,v)]+=1
    require(set(edges.values())=={2} and all(directed[(u,v)]==directed[(v,u)]==1 for u,v in edges),'Capped volume not consistently closed')
    require(volume>1e-6,'Expected a nonzero true enclosed volume')
    normals=[f32(norm(n)) for n in normals]
    colors=[color(im,p,n) for p,n in zip(pos,normals)]
    bounds=[[min(p[k] for p in pos) for k in range(3)],[max(p[k] for p in pos) for k in range(3)]]
    require(bounds[0][1]>-.115 and bounds[1][1]<.19 and bounds[0][2]>-.240 and bounds[1][2]<-.10 and max(abs(bounds[j][0]) for j in [0,1])<.28,'Lock outside provisional rear/lower hair envelope')
    stats={'id':spec['id'],'control_points_world_y_up':points,'world_bounds':bounds,'vertices':len(pos),'triangles':len(faces),'minimum_triangle_area':min(areas),'closed_edge_histogram':dict(collections.Counter(edges.values())),'signed_enclosed_volume':volume,'cap_vertices':[root,tip],'full_maximum_width':2*spec['half_width'],'full_maximum_depth':2*spec['half_depth']}
    return pos,normals,uv,colors,faces,stats

def main():
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--variant',choices=['mild','moderate'],required=True);ap.add_argument('--out',type=pathlib.Path,required=True);a=ap.parse_args()
    out=a.out.resolve();proof=out.with_suffix('.geometry-proof.json')
    require(out.is_relative_to(HERE) and not out.exists() and not proof.exists(),'Fresh owned output path required')
    raw=SOURCE.read_bytes();ref_raw=REFERENCE.read_bytes()
    require(sha(raw)==SOURCE_PIN and sha(ref_raw)==REF_PIN,'Pinned input mismatch')
    original,oldbin=read_glb(raw);d=copy.deepcopy(original);binary=bytearray(oldbin)
    im=Image.open(io.BytesIO(ref_raw)).convert('RGB')
    require(d['nodes'][2].get('rotation')==[0,1,0,0] and d['nodes'][0]['children']==[1] and len(d['meshes'])==2,'Pinned source orientation/topology contract')
    allp=[];alln=[];alluv=[];allc=[];alli=[];stats=[]
    for spec in LOCKS:
        p,n,u,c,faces,s=build_lock(spec,a.variant,im);offset=len(allp)
        allp.extend(local(v) for v in p);alln.extend(local(v) for v in n);alluv.extend(u);allc.extend(c);alli.extend(i+offset for f in faces for i in f);stats.append(s)
    def append(values,kind,width,target):
        while len(binary)%4:binary.append(0)
        offset=len(binary);code='f' if kind==5126 else 'I';flat=[v for row in values for v in row] if width>1 else values
        data=struct.pack('<'+code*len(flat),*flat);binary.extend(data)
        vi=len(d['bufferViews']);d['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':len(data),'target':target})
        ai=len(d['accessors']);ac={'bufferView':vi,'componentType':kind,'count':len(values),'type':{1:'SCALAR',2:'VEC2',3:'VEC3',4:'VEC4'}[width]}
        if width==3:ac.update(min=[min(v[k] for v in values) for k in range(3)],max=[max(v[k] for v in values) for k in range(3)])
        d['accessors'].append(ac);return ai
    at={'POSITION':append(allp,5126,3,34962),'NORMAL':append(alln,5126,3,34962),'TEXCOORD_0':append(alluv,5126,2,34962),'COLOR_0':append(allc,5126,4,34962)}
    index=append(alli,5125,1,34963)
    material=len(d['materials']);d['materials'].append({'name':'Alexia rear curl locks - original reference sampled colors','pbrMetallicRoughness':{'baseColorFactor':[1,1,1,1],'metallicFactor':0,'roughnessFactor':1},'extensions':{'KHR_materials_unlit':{}}})
    mesh=len(d['meshes']);d['meshes'].append({'name':'Two genuine flattened lower rear S curl locks','primitives':[{'attributes':at,'indices':index,'material':material,'mode':4}],'extras':{'approved':False,'gameIntegrated':False,'provisional_reference_guides':True,'curve_locks':stats}})
    node=len(d['nodes']);d['nodes'].append({'name':'Alexia added volumetric rear curl locks','mesh':mesh,'extras':{'approved':False,'gameIntegrated':False}});d['nodes'][0]['children'].append(node)
    d['buffers'][0]['byteLength']=len(binary)
    require(binary[:len(oldbin)]==oldbin and d['meshes'][:len(original['meshes'])]==original['meshes'],'Original mesh/BIN mutation')
    require(d['accessors'][:len(original['accessors'])]==original['accessors'] and d['bufferViews'][:len(original['bufferViews'])]==original['bufferViews'],'Original accessor mutation')
    require(d['materials'][:len(original['materials'])]==original['materials'],'Original material mutation')
    expected_nodes=copy.deepcopy(original['nodes']);expected_nodes[0]['children'].append(node)
    require(d['nodes'][:len(original['nodes'])]==expected_nodes,'Unexpected existing node change')
    for key in ('scene','scenes','images','textures','samplers','skins','animations','extensionsUsed','extensionsRequired'):
        require(d.get(key)==original.get(key),'Unexpected source field change: '+key)
    js=json.dumps(d,separators=(',',':')).encode();js+=b' '*((-len(js))%4);binary+=b'\0'*((-len(binary))%4)
    result=struct.pack('<4sII',b'glTF',2,28+len(js)+len(binary))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(binary),0x004e4942)+binary
    guide=ROOT/'work/alexia-hair-strands-next/independent/strand-shape-landmarks.json'
    guide_raw=guide.read_bytes();require(sha(guide_raw)=='b7e3a8676940f4e49b4180b65c358442bb2d81fc514aa105318656721674ba60','Independent landmark guide pin')
    report={'schema':'crwt.alexia.appended_rear_hair_locks.v1','approved':False,'gameIntegrated':False,'variant':a.variant,'source_path':str(SOURCE.resolve()),'source_sha256':SOURCE_PIN,'reference_path':str(REFERENCE.resolve()),'reference_sha256':REF_PIN,'reference_pixels_unchanged':True,'landmark_guide_sha256':sha(guide_raw),'candidate_path':str(out),'candidate_sha256':sha(result),'candidate_bytes':len(result),'recipe_sha256':sha(pathlib.Path(__file__).read_bytes()),'source_BIN_byte_prefix_identical':True,'all_original_positions_normals_uv_colors_indices_images_materials_byte_identical':True,'all_original_mesh_records_identical':True,'original_accessors_and_bufferViews_identical':True,'original_node_change':'Append one new child node to world.children; all existing node properties/transforms/ancestry retain their values.','original_mesh_vertices_changed':0,'original_mesh_triangles_changed':0,'added_meshes':1,'added_nodes':1,'added_materials':1,'added_vertices':len(allp),'added_triangles':len(alli)//3,'added_closed_locks':len(stats),'locks':stats,'scope':'Two actual capped elliptical ribbon S curl volumes at lower rear hair. Existing merged source hair remains; face, eyes, crown, headphones, body and case mesh data untouched.','color_method':'New COLOR_0 only: linear original-atlas back samples with conservative side-normal blend and purple-only fallback. No raster editing, rectangles, billboards or replacement source colors.','limits':['Manual XY anchors ±4–6 pixels and inferred depth/roots; no camera calibration or match percentage.','Additive accents cannot erase the inherited merged rear hair mass or repair original profile anatomy.','Root intersections with existing hair are intentional attachments; no exhaustive global collision certification.','New locks are closed separate volumes with source topology untouched, not welded into rig-ready hair.','Fixed unlit reference colors retain baked lighting; no rig, game integration, production approval or perfect-match claim.']}
    require(sha(SOURCE.read_bytes())==SOURCE_PIN and sha(REFERENCE.read_bytes())==REF_PIN,'Input changed')
    out.parent.mkdir(parents=True,exist_ok=True)
    with out.open('xb') as f:f.write(result)
    with proof.open('x',encoding='utf-8',newline='\n') as f:f.write(json.dumps(report,indent=2)+'\n')
    print(json.dumps({k:report[k] for k in ['candidate_path','candidate_sha256','candidate_bytes','added_vertices','added_triangles','added_closed_locks','original_mesh_vertices_changed']}))

if __name__=='__main__':main()

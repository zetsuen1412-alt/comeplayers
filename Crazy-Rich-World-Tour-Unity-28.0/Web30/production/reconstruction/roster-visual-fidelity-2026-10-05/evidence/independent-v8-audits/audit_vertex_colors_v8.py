"""Independent read-only audit of the frozen V7 reference-color experiment."""
from pathlib import Path
import hashlib, io, json, math, struct
from PIL import Image

ROOT = Path(__file__).resolve().parents[4]
OUT = Path(__file__).resolve().parent
SOURCE = ROOT/'work/reference-fidelity-2026-10-05/hair-geometry/trial-v2/alexia-rear-hair-control-candidate.glb'
BASE = ROOT/'work/reference-fidelity-2026-10-05'
CANDIDATE = BASE/'trial-v8/alexia-blended-reference.glb'
PROOF = BASE/'trial-v8/alexia-blended-reference.proof.json'
TARGET = OUT/'vertex-color-v8-independent-audit.json'
assert not TARGET.exists(), 'New audit only'
sha = lambda data: hashlib.sha256(data).hexdigest()
frozen = {p:p.read_bytes() for p in [SOURCE,CANDIDATE,PROOF]}
proof = json.loads(frozen[PROOF]); cfg = proof['config']
assert sha(frozen[SOURCE]) == proof['source_sha256'] == '588787b28f0344a64c1cce9b944dd2aafc46d9b84c8cb99c49d7e6e901eff06b'
assert sha(frozen[CANDIDATE]) == proof['candidate_sha256'] == 'd37527d948b950f51e9074f6c60af2a3de0795a53e6b3fb02eb90add2f36eaa1'
for p in [BASE/'build_blended_vertex_reference.py',ROOT/cfg['reference'],ROOT/cfg['back_projection']['reference']]:
    frozen[p] = p.read_bytes()

def glb(raw):
    assert struct.unpack_from('<4sII',raw) == (b'glTF',2,len(raw))
    doc = binary = None; offset = 12
    while offset<len(raw):
        n,k = struct.unpack_from('<II',raw,offset); part=raw[offset+8:offset+8+n]
        if k==0x4e4f534a: doc=json.loads(part)
        elif k==0x004e4942: binary=part
        else: raise AssertionError('Unexpected GLB chunk')
        offset += 8+n
    assert offset==len(raw) and doc is not None and binary is not None
    return doc,binary

def values(doc,binary,index):
    a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']]
    assert not a.get('sparse') and not a.get('normalized')
    width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]
    fmt='<'+{5126:'f',5125:'I',5123:'H',5121:'B'}[a['componentType']]*width
    start=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',struct.calcsize(fmt))
    return [struct.unpack_from(fmt,binary,start+i*stride) for i in range(a['count'])]

old,oldbin=glb(frozen[SOURCE]);new,newbin=glb(frozen[CANDIDATE])
checks = {}
checks['original_bin_prefix_bytes_identical'] = newbin[:len(oldbin)] == oldbin
for key in ['nodes','scenes','scene','skins','animations']:
    checks[key+'_unchanged'] = old.get(key)==new.get(key)
for key in ['accessors','bufferViews','materials','images','textures','samplers']:
    checks[key+'_original_records_unchanged'] = new.get(key,[])[:len(old.get(key,[]))]==old.get(key,[])
checks['accepted_accessory_mesh_definitions_unchanged'] = new['meshes'][1:] == old['meshes'][1:]
assert all(checks.values()),checks
op=old['meshes'][0]['primitives'][0];np=new['meshes'][0]['primitives'][0]
pos=values(old,oldbin,op['attributes']['POSITION']);norm=values(old,oldbin,op['attributes']['NORMAL']);uv=values(old,oldbin,op['attributes']['TEXCOORD_0'])
inds=[q[0] for q in values(old,oldbin,op['indices'])]
vertices=list(zip(pos,norm,uv));count=len(vertices)
faces=[tuple(inds[i:i+3]) for i in range(0,len(inds),3)]
for turn in range(2):
    edge_map={};next_faces=[]
    def midpoint(i,j):
        edge=tuple(sorted((i,j)))
        if edge not in edge_map:
            a,b=vertices[i],vertices[j]
            edge_map[edge]=len(vertices)
            vertices.append(tuple(tuple((v+w)/2 for v,w in zip(a[channel],b[channel])) for channel in range(3)))
        return edge_map[edge]
    for i,j,k in faces:
        ij,jk,ki=midpoint(i,j),midpoint(j,k),midpoint(k,i)
        next_faces.extend([(i,ij,ki),(ij,j,jk),(ki,jk,k),(ij,jk,ki)])
    faces=next_faces

newpos=values(new,newbin,np['attributes']['POSITION']);newuv=values(new,newbin,np['attributes']['TEXCOORD_0'])
newnorm=values(new,newbin,np['attributes']['NORMAL']);newcolors=values(new,newbin,np['attributes']['COLOR_0'])
newids=[q[0] for q in values(new,newbin,np['indices'])]
def f32(x):return struct.unpack('<f',struct.pack('<f',x))[0]
expected_pos=[tuple(f32(v) for v in row[0]) for row in vertices]
checks['active_original_positions_exact'] = newpos[:count]==pos
checks['active_original_uvs_exact'] = newuv[:count]==uv
checks['all_midpoints_linear_and_packed_float32_exact'] = newpos==expected_pos
checks['all_active_uvs_interpolated_exact'] = newuv==[tuple(f32(v) for v in row[2]) for row in vertices]
checks['all_subdivision_indices_exact_and_source_order_preserved'] = newids==[i for face in faces for i in face]
checks['source_face_count_times_16'] = len(faces)==len(inds)//3*16
checks['vertex_color_float32_vec4_not_normalized'] = new['accessors'][np['attributes']['COLOR_0']]['componentType']==5126 and new['accessors'][np['attributes']['COLOR_0']]['type']=='VEC4'
checks['all_colors_finite_linear_unit_rgb_opaque'] = all(all(math.isfinite(v) and 0<=v<=1 for v in c[:3]) and c[3]==1 for c in newcolors)
expected_norm=[]
for _,n,_ in vertices:
    length=math.sqrt(sum(v*v for v in n));expected_norm.append(tuple(f32(v/length) for v in n) if length else (0,1,0))
checks['normalized_interpolated_normals_exact'] = newnorm==expected_norm
material=new['materials'][np['material']]
checks['unlit_vertex_color_material_without_base_texture'] = 'KHR_materials_unlit' in material.get('extensions',{}) and material['pbrMetallicRoughness']['baseColorFactor']==[1,1,1,1] and 'baseColorTexture' not in material['pbrMetallicRoughness']

# Independent color formula checks at deterministic sampled vertices. The V5
# thresholds below are explicitly frozen from its generation recipe, rather
# than inferred from the mutable builder currently present on disk.
def linear(v):
    s=v/255
    return s/12.92 if s<=.04045 else ((s+.055)/1.055)**2.4
def sample(image,x,y):
    x=max(0,min(image.width-1,x));y=max(0,min(image.height-1,y));ix,iy=int(x),int(y);fx,fy=x-ix,y-iy
    c00=image.getpixel((ix,iy));c10=image.getpixel((min(ix+1,image.width-1),iy));c01=image.getpixel((ix,min(iy+1,image.height-1)));c11=image.getpixel((min(ix+1,image.width-1),min(iy+1,image.height-1)))
    return tuple((linear(c00[k])+(linear(c10[k])-linear(c00[k]))*fx)+((linear(c01[k])+(linear(c11[k])-linear(c01[k]))*fx)-(linear(c00[k])+(linear(c10[k])-linear(c00[k]))*fx))*fy for k in range(3))
def interp(x,points):
    for (a,b),(c,d) in zip(points,points[1:]):
        if x<=c:return b+(d-b)*(x-a)/(c-a)
    a,b=points[-2];c,d=points[-1];return b+(d-b)*(x-a)/(c-a)
def smooth(a,b,x):
    t=max(0,min(1,(x-a)/(b-a)));return t*t*(3-2*t)
front_raw=frozen[ROOT/cfg['reference']];back_raw=frozen[ROOT/cfg['back_projection']['reference']]
assert sha(front_raw)==proof['reference_sha256'] and sha(back_raw)==proof['back_reference_sha256']
front=Image.open(io.BytesIO(front_raw)).convert('RGB');back=Image.open(io.BytesIO(back_raw)).convert('RGB')
mat=old['materials'][op['material']];tex=old['textures'][mat['pbrMetallicRoughness']['baseColorTexture']['index']];im=old['images'][tex['source']];bv=old['bufferViews'][im['bufferView']]
source_image_bytes=oldbin[bv.get('byteOffset',0):bv.get('byteOffset',0)+bv['byteLength']]
assert sha(source_image_bytes)==proof['source_albedo_sha256']
source_image=Image.open(io.BytesIO(source_image_bytes)).convert('RGB')
config_path=BASE/'front-projection-v8.json'
frozen[config_path]=config_path.read_bytes()
checks['builder_hash_matches_frozen_v7_proof']=sha(frozen[BASE/'build_blended_vertex_reference.py'])==proof['builder_sha256']
checks['config_hash_matches_frozen_v7_proof']=sha(frozen[config_path])==proof['config_sha256']
checks['saved_thresholds_match_v7']=proof['blend_normal_thresholds']==[.02,.45]
checks['saved_config_matches_v7']=json.loads(frozen[config_path])==cfg
indices=sorted(set(range(0,len(vertices),733))|{0,count-1,count,len(vertices)-1})
max_error=0;bcfg=cfg['back_projection']
for index in indices:
    (lx,y,lz),n,t=vertices[index];x,z=-lx,-lz;nz=-n[2]/math.sqrt(sum(v*v for v in n)) if any(n) else 0
    px=interp(y,cfg['horizontal_center_pixels'])+(x-interp(y,cfg['horizontal_center_world']))*interp(y,cfg['horizontal_scale']);py=interp(y,cfg['vertical'])
    wf=smooth(.02,.45,nz)
    if cfg.get('exclude_peripheral_hair') and y>-.07:wf*=1-smooth(.12,.15,abs(x+.02))
    bx=bcfg['center_pixel']-(x-bcfg['center_world'])*bcfg['scale'];by=bcfg['top_pixel']+(bcfg['top_world']-y)*bcfg['scale'];wb=smooth(.02,.45,-nz)
    if not(0<=px<front.width and 0<=py<front.height):wf=0
    if not(1024<=bx<1536 and 490<=by<1024):wb=0
    if y>-.10:wb*=1-smooth(.245,.295,abs(x+.006))
    if cfg.get('exclude_back_earcup_projection'):
        for cx in (-.176,.184):
            r=math.sqrt(((x-cx)/.054)**2+((y-.269)/.112)**2)
            wb*=smooth(.90,1.35,r)
    a=sample(source_image,t[0]*(source_image.width-1),t[1]*(source_image.height-1));b=sample(front,px,py);c=sample(back,bx,by)
    blend=tuple((v+(w-v)*wf)+(r-(v+(w-v)*wf))*wb for v,w,r in zip(a,b,c))
    max_error=max(max_error,max(abs(f32(v)-w) for v,w in zip(blend,newcolors[index][:3])))
checks['deterministic_sample_colors_match_linear_rgb_formula'] = max_error<=1e-7
assert all(checks.values()),checks

for trial in ['trial-v5','trial-v8']:
    for name in ['front','left','right','back','three-quarter','render-evidence']:
        suffix='json' if name=='render-evidence' else 'png';p=BASE/trial/'renders'/f'{name}.{suffix}'
        frozen[p]=p.read_bytes()
    receipt=json.loads(frozen[BASE/trial/'renders/render-evidence.json'])
    if trial=='trial-v8':assert receipt['input_sha256']==proof['candidate_sha256'] and receipt['view_transform']=='Standard'

assert all(p.read_bytes()==raw for p,raw in frozen.items()), 'Audited frozen input changed'
report={'schema':'crwt.alexia.vertex_color_independent_audit.v1','candidate_sha256':proof['candidate_sha256'],
 'source_sha256':proof['source_sha256'],'checks':checks,'all_checks_pass':all(checks.values()),
 'source_mesh_faces':len(inds)//3,'subdivided_mesh_faces':len(faces),'active_vertices':len(vertices),
 'color_samples_checked':len(indices),'max_sample_float32_error':max_error,
 'frozen_v7_normal_blend_thresholds':[.02,.45],
 'material_rule':'glTF float COLOR_0 is linear RGB; sampled sRGB bytes are decoded before interpolation and blending.',
 'visual_findings':[
   'V7 retains smooth blending and front details are clearer than V5.',
   'Back earcup mask leaves broad soft lavender columns beside the crisper projected center.',
   'V7 left profile no longer shows the secondary dark/gold earcup stripe present in V5.',
   'Back curls remain printed colors on source hair masses; profile texture blur/stretching remains.',
 ],
 'implementation_risks':[
   'Normal-sign weighting has no visibility/semantic ownership test. The smooth ellipse mask specifically removes rear earcup sampling, but does not solve every occlusion.',
   'The frozen V7 proof does not store the hardcoded blend thresholds or builder hash; final handoff should freeze a recipe or config thresholds.',
   'The builder guards the GLB output but does not preflight an existing sibling proof file; a fresh binary path can overwrite an older proof with that stem.',
 ],
 'visual_scope':'All five V8 front, back, left, right, quarter views reviewed; moderate real rear hair volume with residual side blur.',
 'scope':'Original vertices and accessor/BIN records remain preserved. The active source surface is linearly subdivided; accessory geometry, nodes, scene, skins and animations are unchanged. Float32 midpoint rounding applies to appended vertices.',
 'adds_missing_anatomy':False,'approved':False,'gameIntegrated':False,
 'input_files':[{'path':str(p),'sha256':sha(raw),'bytes':len(raw),'unchanged_after':True} for p,raw in frozen.items()]}
with TARGET.open('x',encoding='utf-8',newline='\n') as handle:handle.write(json.dumps(report,indent=2)+'\n')
print(json.dumps({'status':'read-only-independent-audit-pass','path':str(TARGET),'checks':len(checks),'color_samples':len(indices),'max_error':max_error}))

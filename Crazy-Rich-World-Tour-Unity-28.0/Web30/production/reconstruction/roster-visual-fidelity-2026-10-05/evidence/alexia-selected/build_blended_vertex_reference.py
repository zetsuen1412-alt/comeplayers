"""Reference color sampling into true mesh COLOR_0, with smooth transitions.

Reads unchanged reference/image pixels. Does not edit or create bitmap textures.
Two linear subdivision rounds refine sampling on each original triangle's surface;
this does not recover missing geometric forms. Original BIN is preserved intact.
"""
from pathlib import Path
import argparse,copy,json,hashlib,struct,importlib.util,math,sys,io
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[1];sys.path.insert(0,str(ROOT/'work/pydeps'))
from PIL import Image
sp=importlib.util.spec_from_file_location('reader',ROOT/'work/model-rebuild/Mochi-tail/inspect_components.py');rd=importlib.util.module_from_spec(sp);sp.loader.exec_module(rd)
sp=importlib.util.spec_from_file_location('projection',HERE/'build_reference_projection.py');proj=importlib.util.module_from_spec(sp);sp.loader.exec_module(proj)
sha=lambda b:hashlib.sha256(b).hexdigest()
def require(ok,msg):
 if not ok:raise ValueError(msg)
def lerp(a,b,t):return tuple(x+(y-x)*t for x,y in zip(a,b))
LINEAR=[v/255/12.92 if v/255<=.04045 else ((v/255+.055)/1.055)**2.4 for v in range(256)]
def sample(im,x,y):
 w,h=im.size;x=max(0,min(w-1,x));y=max(0,min(h-1,y));ix=int(x);iy=int(y);fx=x-ix;fy=y-iy
 def c(a,b):return tuple(LINEAR[v] for v in im.getpixel((a,b))[:3])
 return lerp(lerp(c(ix,iy),c(min(ix+1,w-1),iy),fx),lerp(c(ix,min(iy+1,h-1)),c(min(ix+1,w-1),min(iy+1,h-1)),fx),fy)
def smooth(a,b,x):
 t=max(0,min(1,(x-a)/(b-a)));return t*t*(3-2*t)
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--config',type=Path,required=True);ap.add_argument('--out',type=Path,required=True);ap.add_argument('--rounds',type=int,default=2);a=ap.parse_args();require(a.rounds in (0,1,2),'At most two subdivision rounds')
 cfg=json.loads(a.config.read_bytes());src=ROOT/cfg['source'];raw,old,bin0=rd.read_glb(src);require(sha(raw)==cfg['source_sha256'],'Source pin');require(not a.out.exists(),'Fresh output')
 refraw=(ROOT/cfg['reference']).read_bytes();require(sha(refraw)==cfg['reference_sha256'],'Front image pin');ref=Image.open(io.BytesIO(refraw)).convert('RGB')
 backcfg=cfg['back_projection'];br=(ROOT/backcfg['reference']).read_bytes();require(sha(br)==backcfg['reference_sha256'],'Back image pin');back=Image.open(io.BytesIO(br)).convert('RGB')
 p=old['meshes'][0]['primitives'][0];positions=rd.accessor(old,bin0,p['attributes']['POSITION']);normals=rd.accessor(old,bin0,p['attributes']['NORMAL']);uv=rd.accessor(old,bin0,p['attributes']['TEXCOORD_0']);ids=[q[0] for q in rd.accessor(old,bin0,p['indices'])];faces=[tuple(ids[i:i+3]) for i in range(0,len(ids),3)]
 mat=old['materials'][p['material']];tex=old['textures'][mat['pbrMetallicRoughness']['baseColorTexture']['index']];im=old['images'][tex['source']];view=old['bufferViews'][im['bufferView']];ibytes=bin0[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']];orig=Image.open(io.BytesIO(ibytes)).convert('RGB')
 vertices=[(tuple(q),tuple(n),tuple(t)) for q,n,t in zip(positions,normals,uv)];source_count=len(vertices);sourcefaces=len(faces)
 for turn in range(a.rounds):
  cache={};newfaces=[]
  def mid(i,j):
   key=(min(i,j),max(i,j))
   if key not in cache:
    va=vertices[i];vb=vertices[j];cache[key]=len(vertices);vertices.append(tuple(lerp(va[k],vb[k],.5) for k in range(3)))
   return cache[key]
  for i,j,k in faces:
   ij,jk,ki=mid(i,j),mid(j,k),mid(k,i);newfaces.extend([(i,ij,ki),(ij,j,jk),(ki,jk,k),(ij,jk,ki)])
  faces=newfaces
 colors=[];weights={'front_full':0,'back_full':0,'transition':0,'source_only':0}
 for (lx,y,lz),n,t in vertices:
  x,z=-lx,-lz;nx,ny,nz=-n[0],n[1],-n[2];nl=math.sqrt(nx*nx+ny*ny+nz*nz);nz=nz/nl if nl else 0
  src_c=sample(orig,t[0]*(orig.width-1),t[1]*(orig.height-1))
  py=proj.interp(y,cfg['vertical']);px=proj.interp(y,cfg['horizontal_center_pixels'])+(x-proj.interp(y,cfg['horizontal_center_world']))*proj.interp(y,cfg['horizontal_scale'])
  wf=smooth(cfg.get('blend_normal_low',.15),cfg.get('blend_normal_high',.70),nz)
  if cfg.get('exclude_peripheral_hair') and y>-.07:
   # Smoothly fade the projection before the differing lateral hair silhouette.
   wf*=1-smooth(.12,.15,abs(x+.02))
  bx=backcfg['center_pixel']-(x-backcfg['center_world'])*backcfg['scale'];by=backcfg['top_pixel']+(backcfg['top_world']-y)*backcfg['scale'];wb=smooth(cfg.get('blend_normal_low',.15),cfg.get('blend_normal_high',.70),-nz)
  if not(0<=px<ref.width and 0<=py<ref.height):wf=0
  if not(1024<=bx<1536 and 490<=by<1024):wb=0
  # Rear silhouette can exceed the reference; retain source hair there rather
  # than force grey background colors onto outer clumps.
  if y>-.10:wb*=1-smooth(.245,.295,abs(x+.006))
  if cfg.get('exclude_back_earcup_projection'):
   # The illustrated rear earcups are separately embodied by preserved source
   # geometry. Do not print a second earcup onto hair behind those volumes.
   for cx in (-.176,.184):
    r=math.sqrt(((x-cx)/.054)**2+((y-.269)/.112)**2)
    wb*=smooth(.90,1.35,r)
  c=lerp(src_c,sample(ref,px,py),wf);c=lerp(c,sample(back,bx,by),wb)
  colors.append((*c,1.0))
  weights['front_full' if wf>.995 else 'back_full' if wb>.995 else 'source_only' if wf<.005 and wb<.005 else 'transition']+=1
 d=copy.deepcopy(old);binary=bytearray(bin0)
 def append(vals,kind):
  width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[kind];isindex=kind=='SCALAR';flat=vals if isindex else [x for q in vals for x in q]
  while len(binary)%4:binary.append(0)
  blob=struct.pack('<'+('I' if isindex else 'f')*len(flat),*flat);vi=len(d['bufferViews']);d['bufferViews'].append({'buffer':0,'byteOffset':len(binary),'byteLength':len(blob),'target':34963 if isindex else 34962});binary.extend(blob)
  ai=len(d['accessors']);entry={'bufferView':vi,'componentType':5125 if isindex else 5126,'count':len(vals),'type':kind}
  if kind=='VEC3':entry.update(min=[min(q[j] for q in vals) for j in range(3)],max=[max(q[j] for q in vals) for j in range(3)])
  d['accessors'].append(entry);return ai
 norm=[]
 for q,n,t in vertices:
  l=math.sqrt(sum(v*v for v in n));norm.append(tuple(v/l for v in n) if l else (0,1,0))
 mi=len(d['materials']);d['materials'].append({'name':'Alexia smooth reference colors on volumetric surface','pbrMetallicRoughness':{'baseColorFactor':[1,1,1,1],'metallicFactor':0,'roughnessFactor':1},'extensions':{'KHR_materials_unlit':{}}})
 if 'KHR_materials_unlit' not in d.get('extensionsUsed',[]):d.setdefault('extensionsUsed',[]).append('KHR_materials_unlit')
 entry={'attributes':{'POSITION':append([v[0] for v in vertices],'VEC3'),'NORMAL':append(norm,'VEC3'),'TEXCOORD_0':append([v[2] for v in vertices],'VEC2'),'COLOR_0':append(colors,'VEC4')},'indices':append([i for f in faces for i in f],'SCALAR'),'material':mi,'mode':4};d['meshes'][0]['primitives']=[entry];d['buffers'][0]['byteLength']=len(binary)
 require(bytes(binary[:len(bin0)])==bin0,'Original binary changed')
 for key in ['nodes','scenes','skins','animations']:require(d.get(key)==old.get(key),'Original transforms/rig changed')
 require(d['meshes'][1:]==old['meshes'][1:],'Accepted accessories changed')
 js=json.dumps(d,separators=(',',':')).encode();js+=b' '*((-len(js))%4);binary+=b'\0'*((-len(binary))%4);result=struct.pack('<4sII',b'glTF',2,28+len(js)+len(binary))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(binary),0x004e4942)+binary
 sp=importlib.util.spec_from_file_location('validator',ROOT/'work/model-rebuild/tools/validate_roster_candidate.py');va=importlib.util.module_from_spec(sp);sp.loader.exec_module(va);stats=va.validate_model(result)
 a.out.parent.mkdir(parents=True,exist_ok=True);a.out.write_bytes(result)
 proof={'schema':'crwt.blended_reference_vertex_colors.v1','builder_sha256':sha(Path(__file__).read_bytes()),'config_sha256':sha(a.config.read_bytes()),'blend_normal_thresholds':[cfg.get('blend_normal_low',.15),cfg.get('blend_normal_high',.70)],'source_sha256':sha(raw),'candidate_sha256':sha(result),'reference_sha256':sha(refraw),'back_reference_sha256':sha(br),'source_albedo_sha256':sha(ibytes),'reference_images_unchanged':True,'source_BIN_prefix_preserved':True,'original_positions_unchanged_on_original_vertices':all(tuple(vertices[i][0])==tuple(positions[i]) for i in range(source_count)),'subdivision_rounds':a.rounds,'source_faces':sourcefaces,'subdivided_faces':len(faces),'linear_subdivision_on_original_triangle_surfaces':True,'source_vertex_count':source_count,'active_vertices':len(vertices),'colors':'Linear sRGB vertex attributes from bilinear read-only original/reference sampling; smooth source/front/back weights from original normals. No bitmap edits or new texture images.','blend_weights':weights,'validation':stats,'config':cfg,'approved':False,'gameIntegrated':False,'limits':['Surface sampling subdivision adds no missing anatomy or separated hair volumes.','Baked shading stays in colors, and oblique surfaces may remain blurred or stretched.','Front/back calibration is manual, with approx 2–4 pixel landmark uncertainty; no high-precision percentage claim.']}
 a.out.with_suffix('.proof.json').write_text(json.dumps(proof,indent=2)+'\n',encoding='utf-8');print(json.dumps({k:v for k,v in proof.items() if k!='config'}))
if __name__=='__main__':main()

"""Map unchanged reference pixels onto existing volumetric GLB triangles.

No image is painted, resized, generated or used as a billboard. Source geometry,
normals, original UVs and images remain byte-identical. Only an additional UV
channel, an embedded unchanged reference, material and index partition are added.
This is an angle-limited projection experiment, not a precise 360 reconstruction.
"""
from pathlib import Path
import argparse,copy,json,hashlib,struct,importlib.util,math
ROOT=Path(__file__).resolve().parents[2]
sp=importlib.util.spec_from_file_location('reader',ROOT/'work/model-rebuild/Mochi-tail/inspect_components.py');rd=importlib.util.module_from_spec(sp);sp.loader.exec_module(rd)
sha=lambda b:hashlib.sha256(b).hexdigest()
def require(ok,msg):
 if not ok:raise ValueError(msg)
def interp(x,anchors):
 for (a,b),(c,d) in zip(anchors,anchors[1:]):
  if x<=c:return b+(d-b)*(x-a)/(c-a)
 a,b=anchors[-2];c,d=anchors[-1];return b+(d-b)*(x-a)/(c-a)
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--out',type=Path,required=True);ap.add_argument('--config',type=Path,required=True);a=ap.parse_args()
 cfg=json.loads(a.config.read_bytes());src=ROOT/cfg['source'];ref=ROOT/cfg['reference'];out=a.out.resolve();require(not out.exists(),'Fresh output required')
 raw,old,bin0=rd.read_glb(src);image=ref.read_bytes();require(sha(raw)==cfg['source_sha256'],'Source pin');require(sha(image)==cfg['reference_sha256'],'Reference pin')
 d=copy.deepcopy(old);binary=bytearray(bin0);p=old['meshes'][0]['primitives'][0]
 require(old['nodes'][2].get('rotation')==[0,1,0,0],'Source orientation')
 pos=rd.accessor(old,bin0,p['attributes']['POSITION']);norm=rd.accessor(old,bin0,p['attributes']['NORMAL']);ids=[x[0] for x in rd.accessor(old,bin0,p['indices'])]
 world=[(-x,y,-z) for x,y,z in pos];uv=[]
 for x,y,z in world:
  py=interp(y,cfg['vertical']);px=interp(y,cfg['horizontal_center_pixels'])+(x-interp(y,cfg['horizontal_center_world']))*interp(y,cfg['horizontal_scale'])
  uv.append((px/cfg['width'],py/cfg['height']))
 def append(payload,component=None,count=None,kind=None,target=None):
  while len(binary)%4:binary.append(0)
  v=len(d['bufferViews']);d['bufferViews'].append({'buffer':0,'byteOffset':len(binary),'byteLength':len(payload),**({'target':target} if target else {})});binary.extend(payload)
  if component is None:return v
  ix=len(d['accessors']);d['accessors'].append({'bufferView':v,'componentType':component,'count':count,'type':kind});return ix
 uvi=append(struct.pack('<'+'f'*len(uv)*2,*[v for q in uv for v in q]),5126,len(uv),'VEC2',34962)
 imvi=append(image);imi=len(d['images']);d['images'].append({'name':'Unchanged canonical Alexia V2 front reference','bufferView':imvi,'mimeType':'image/png'})
 si=len(d.setdefault('samplers',[]));d['samplers'].append({'magFilter':9729,'minFilter':9729,'wrapS':33071,'wrapT':33071})
 ti=len(d['textures']);d['textures'].append({'source':imi,'sampler':si})
 mi=len(d['materials']);d['materials'].append({'name':'Alexia front reference projection - angle limited','doubleSided':False,'pbrMetallicRoughness':{'baseColorTexture':{'index':ti,'texCoord':1},'metallicFactor':0,'roughnessFactor':1},'extensions':{'KHR_materials_unlit':{}}})
 fallback=p['material']
 if cfg.get('fallback_unlit'):
  fallback=len(d['materials']);mat=copy.deepcopy(old['materials'][p['material']]);mat['name']='Preserved original surface color - unlit';mat.setdefault('extensions',{})['KHR_materials_unlit']={};d['materials'].append(mat)
 d.setdefault('extensionsUsed',[]).append('KHR_materials_unlit') if 'KHR_materials_unlit' not in d.get('extensionsUsed',[]) else None
 backcfg=cfg.get('back_projection');backmat=None;backuvi=None
 if backcfg:
  br=ROOT/backcfg['reference'];bb=br.read_bytes();require(sha(bb)==backcfg['reference_sha256'],'Back reference pin')
  buv=[]
  for x,y,z in world:
   bx=backcfg['center_pixel']-(x-backcfg['center_world'])*backcfg['scale'];by=backcfg['top_pixel']+(backcfg['top_world']-y)*backcfg['scale'];buv.append((bx/backcfg['width'],by/backcfg['height']))
  backuvi=append(struct.pack('<'+'f'*len(buv)*2,*[v for q in buv for v in q]),5126,len(buv),'VEC2',34962)
  bvi=append(bb);bimi=len(d['images']);d['images'].append({'name':'Unchanged approved V2 six-view reference atlas','bufferView':bvi,'mimeType':'image/png'})
  bti=len(d['textures']);d['textures'].append({'source':bimi,'sampler':si});backmat=len(d['materials']);d['materials'].append({'name':'Alexia approved back reference projection - angle limited','pbrMetallicRoughness':{'baseColorTexture':{'index':bti,'texCoord':1},'metallicFactor':0,'roughnessFactor':1},'extensions':{'KHR_materials_unlit':{}}})
 selected=[];other=[];backs=[];face_ids=[];backface_ids=[]
 for fi in range(len(ids)//3):
  tri=ids[fi*3:fi*3+3];v=[world[i] for i in tri];ab=[v[1][j]-v[0][j] for j in range(3)];ac=[v[2][j]-v[0][j] for j in range(3)];n=(ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]);ln=math.sqrt(sum(x*x for x in n))
  # Restrict the projection to front-facing surfaces; sides/back keep original UV material.
  take=ln>0 and n[2]/ln>cfg['normal_threshold'] and all(0<=uv[i][0]<=1 and 0<=uv[i][1]<=1 for i in tri)
  if cfg.get('exclude_peripheral_hair'):
   cx=sum(q[0] for q in v)/3;cy=sum(q[1] for q in v)/3
   # The source hair silhouette differs from the raster; avoid projecting
   # reference background into lateral hair. Original hair texture stays active.
   if cy>-.07 and abs(cx+.02)>.142:take=False
  if take:selected.extend(tri);face_ids.append(fi)
  elif backcfg and ln>0 and n[2]/ln < -backcfg['normal_threshold']:
   backs.extend(tri);backface_ids.append(fi)
  else:other.extend(tri)
 prim=[]
 for subset,mat,uvindex in [(other,fallback,uvi),(selected,mi,uvi),(backs,backmat,backuvi)]:
  if not subset:continue
  entry=copy.deepcopy(p);entry['indices']=append(struct.pack('<'+'I'*len(subset),*subset),5125,len(subset),'SCALAR',34963);entry['material']=mat;entry['attributes']['TEXCOORD_1']=uvindex;prim.append(entry)
 d['meshes'][0]['primitives']=prim;d['buffers'][0]['byteLength']=len(binary)
 js=json.dumps(d,separators=(',',':')).encode();js+=b' '*((-len(js))%4);binary+=b'\0'*((-len(binary))%4)
 result=struct.pack('<4sII',b'glTF',2,28+len(js)+len(binary))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(binary),0x004e4942)+binary
 require(bytes(binary[:len(bin0)])==bin0,'Original BIN changed')
 for k in ['nodes','scenes','animations','skins']:require(d.get(k)==old.get(k),'Original transforms/rig changed '+k)
 for k in ['accessors','bufferViews','images','textures','samplers','materials']:require(d.get(k,[])[:len(old.get(k,[]))]==old.get(k,[]),'Original records changed '+k)
 require(len(other)+len(selected)+len(backs)==len(ids) and sorted(face_ids)==face_ids,'Triangle partition')
 spec=importlib.util.spec_from_file_location('validator',ROOT/'work/model-rebuild/tools/validate_roster_candidate.py');val=importlib.util.module_from_spec(spec);spec.loader.exec_module(val);stats=val.validate_model(result)
 out.parent.mkdir(parents=True,exist_ok=True);out.write_bytes(result)
 proof={'schema':'crwt.reference_projection.v1','source_sha256':sha(raw),'reference_sha256':sha(image),'candidate_sha256':sha(result),'source_bin_prefix_preserved':True,'positions_normals_original_uvs_images_preserved':True,'source_faces_preserved_once':len(ids)//3,'projected_triangles':len(selected)//3,'projected_back_triangles':len(backs)//3,'projected_original_face_ids':face_ids,'projected_back_original_face_ids':backface_ids,'new_geometry':False,'reference_image_pixels_unchanged':True,'projection_config':cfg,'validation':stats,'approved':False,'gameIntegrated':False,'limitations':['Baked reference lighting remains in projected color.','Side surfaces keep source texture; projection seams/stretching are possible when rotated.','Projection improves surface detail but does not repair anatomy or hidden geometry.']}
 out.with_suffix('.proof.json').write_text(json.dumps(proof,indent=2)+'\n',encoding='utf-8');print(json.dumps({k:v for k,v in proof.items() if not k.endswith('face_ids')}))
if __name__=='__main__':main()

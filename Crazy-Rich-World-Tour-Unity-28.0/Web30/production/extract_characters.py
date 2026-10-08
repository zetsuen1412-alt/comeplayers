"""Extract normalized characters without changing geometry or animated poses.
The workshop exporter bakes world coordinates into the skinned vertices.
Apply the same coordinate change to vertices, root and inverse bind matrices.
Requires Python 3.11+ and numpy. Run: python extract_characters.py roster.glb models
"""
from __future__ import annotations
import copy,json,struct,hashlib,argparse
from pathlib import Path
import numpy as np
IDS=['alexia','rindi','kairo','luna','nox','atlas','zeno','yuna','mochi','pip']
SEGMENTS={'Idle':(0,119),'Walk':(130,159),'Jump':(170,217),'Skill':(228,317),'Win':(328,417),'Lose':(428,502)}
DTYPES={5120:np.dtype('i1'),5121:np.dtype('u1'),5122:np.dtype('<i2'),5123:np.dtype('<u2'),5125:np.dtype('<u4'),5126:np.dtype('<f4')}
WIDTHS={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
def load_glb(path):
 data=Path(path).read_bytes();magic,version,size=struct.unpack_from('<III',data)
 if (magic,version,size)!=(0x46546c67,2,len(data)):raise ValueError('Invalid GLB header')
 pos=12;j=None;b=b''
 while pos<len(data):
  n,kind=struct.unpack_from('<II',data,pos);chunk=data[pos+8:pos+8+n];pos+=8+n
  if kind==0x4e4f534a:j=json.loads(chunk)
  elif kind==0x004e4942:b=chunk
 if j is None:raise ValueError('Missing glTF JSON')
 return j,b
def read_accessor(doc,blob,index):
 a=doc['accessors'][index]
 if 'sparse' in a:raise ValueError('Unexpected sparse accessor')
 v=doc['bufferViews'][a['bufferView']];typ=DTYPES[a['componentType']];width=WIDTHS[a['type']]
 return np.ndarray((a['count'],width),dtype=typ,buffer=blob,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',typ.itemsize*width),typ.itemsize)).copy()
def trs(node):
 if 'matrix' in node:return np.array(node['matrix'],dtype=float).reshape(4,4).T
 q=np.array(node.get('rotation',[0,0,0,1]),dtype=float);q/=np.linalg.norm(q);x,y,z,w=q
 r=np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])
 out=np.eye(4);out[:3,:3]=r@np.diag(node.get('scale',[1,1,1]));out[:3,3]=node.get('translation',[0,0,0]);return out
def globals_for(doc,overrides=None):
 nodes=doc['nodes'];parents={c:i for i,n in enumerate(nodes) for c in n.get('children',[])};cache={};overrides=overrides or {}
 def get(i):
  if i not in cache:
   nd=dict(nodes[i]);nd.update(overrides.get(i,{}));m=trs(nd);cache[i]=get(parents[i])@m if i in parents else m
  return cache[i]
 return [get(i) for i in range(len(nodes))]
def sample(times,values,t,rotation=False,step=False):
 k=max(0,min(int(np.searchsorted(times,t,side='right')-1),len(times)-1))
 if k==len(times)-1 or step or t<=times[0]+1e-9:return values[k].copy()
 u=float(np.clip((t-times[k])/(times[k+1]-times[k]),0,1));a=values[k].astype(float);b=values[k+1].astype(float)
 if rotation:
  a/=np.linalg.norm(a);b/=np.linalg.norm(b);d=float(a@b)
  if d<0:b=-b;d=-d
  if d>.9995:q=a+(b-a)*u;return q/np.linalg.norm(q)
  theta=np.arccos(np.clip(d,-1,1));return (np.sin((1-u)*theta)*a+np.sin(u*theta)*b)/np.sin(theta)
 return a+(b-a)*u
class Writer:
 def __init__(self,doc):self.doc=doc;self.binary=bytearray();doc['bufferViews']=[];doc['accessors']=[]
 def view(self,data,target=None):
  while len(self.binary)%4:self.binary.append(0)
  v={'buffer':0,'byteOffset':len(self.binary),'byteLength':len(data)}
  if target:v['target']=target
  self.binary.extend(data);self.doc['bufferViews'].append(v);return len(self.doc['bufferViews'])-1
 def accessor(self,array,component,type_,normalized=False,bounds=False,target=None):
  a=np.asarray(array,dtype=DTYPES[component]).reshape(-1,WIDTHS[type_]);v=self.view(a.tobytes(),target);desc={'bufferView':v,'componentType':component,'count':len(a),'type':type_}
  if normalized:desc['normalized']=True
  if bounds:desc.update(min=a.min(axis=0).astype(float).tolist(),max=a.max(axis=0).astype(float).tolist())
  self.doc['accessors'].append(desc);return len(self.doc['accessors'])-1
 def save(self,path):
  self.doc['buffers']=[{'byteLength':len(self.binary)}];js=json.dumps(self.doc,separators=(',',':'),ensure_ascii=False).encode();js+=b' '*((-len(js))%4);binary=bytes(self.binary);binary+=b'\0'*((-len(binary))%4)
  Path(path).write_bytes(struct.pack('<III',0x46546c67,2,28+len(js)+len(binary))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(binary),0x004e4942)+binary)
def extract(src,blob,cid,path):
 root=next(i for i,n in enumerate(src['nodes']) if n.get('name')==cid);selected=[]
 def visit(i):
  if i not in selected:
   selected.append(i)
   for child in src['nodes'][i].get('children',[]):visit(child)
 visit(root);node_map={old:new for new,old in enumerate(selected)}
 mesh_ids=sorted({src['nodes'][i]['mesh'] for i in selected if 'mesh'in src['nodes'][i]});mesh_map={old:new for new,old in enumerate(mesh_ids)}
 skin_ids=sorted({src['nodes'][i]['skin'] for i in selected if 'skin'in src['nodes'][i]});skin_map={old:new for new,old in enumerate(skin_ids)}
 if len(skin_ids)!=1:raise ValueError(f'{cid}: expected one source skin')
 original_global=globals_for(src);R=original_global[root];factor=float(src['nodes'][root]['extras']['board_preview_scale']);rest_scale=np.array(src['nodes'][root].get('scale',[1,1,1]))/factor
 N=np.eye(4);N[:3,:3]=np.diag(rest_scale);A=N@np.linalg.inv(R)
 positions=np.concatenate([read_accessor(src,blob,p['attributes']['POSITION']) for mid in mesh_ids for p in src['meshes'][mid]['primitives']]);transformed=np.c_[positions,np.ones(len(positions))]@A.T;floor=float(transformed[:,1].min());L=np.eye(4);L[1,3]=-floor;A=L@A;N=A@R;inverseA=np.linalg.inv(A)
 out={'asset':{'version':'2.0','generator':'CRWT baked-world preserving character extractor v1'},'scene':0,'scenes':[{'nodes':[node_map[root]]}],'nodes':[],'meshes':[],'skins':[],'animations':[],'extras':{'character_id':cid,'source_revision':10,'visual_final_approved':False,'online_game_replaced':False,'source_transform_policy':'vertices=A*p; root=A*root; inverseBind=oldInverseBind*inverse(A)'}}
 for key in ['extensionsUsed','extensionsRequired']:
  if key in src:out[key]=[x for x in src[key] if x!='KHR_lights_punctual']
  if not out.get(key):out.pop(key,None)
 w=Writer(out)
 for old in selected:
  nd=copy.deepcopy(src['nodes'][old]);nd.pop('camera',None)
  if 'children'in nd:nd['children']=[node_map[x] for x in nd['children']]
  if 'mesh'in nd:nd['mesh']=mesh_map[nd['mesh']]
  if 'skin'in nd:nd['skin']=skin_map[nd['skin']]
  if old==root:
   nd.pop('matrix',None);nd['translation']=N[:3,3].tolist();nd['rotation']=[0,0,0,1];nd['scale']=rest_scale.tolist();nd.setdefault('extras',{}).update(board_preview_scale=1,asset_status='REFERENCE_RECONSTRUCTION_WIP',visual_final_approved=False)
  out['nodes'].append(nd)
 used_mats=sorted({p['material'] for mid in mesh_ids for p in src['meshes'][mid]['primitives'] if 'material'in p});mat_map={x:i for i,x in enumerate(used_mats)};out['materials']=[copy.deepcopy(src['materials'][i]) for i in used_mats];tex_refs=[]
 def texture_objects(d):
  if isinstance(d,dict):
   for key,val in d.items():
    if key.lower().endswith('texture') and isinstance(val,dict) and 'index'in val:tex_refs.append(val)
    else:texture_objects(val)
  elif isinstance(d,list):
   for v in d:texture_objects(v)
 texture_objects(out['materials']);tex_ids=sorted({v['index'] for v in tex_refs});tex_map={x:i for i,x in enumerate(tex_ids)}
 for v in tex_refs:v['index']=tex_map[v['index']]
 out['textures']=[copy.deepcopy(src['textures'][i]) for i in tex_ids];img_ids=sorted({t['source'] for t in out['textures']});img_map={x:i for i,x in enumerate(img_ids)};samp_ids=sorted({t['sampler'] for t in out['textures'] if 'sampler'in t});samp_map={x:i for i,x in enumerate(samp_ids)};out['samplers']=[copy.deepcopy(src['samplers'][i]) for i in samp_ids];out['images']=[]
 for t in out['textures']:
  t['source']=img_map[t['source']]
  if 'sampler'in t:t['sampler']=samp_map[t['sampler']]
 for i in img_ids:
  im=copy.deepcopy(src['images'][i]);view=src['bufferViews'][im['bufferView']];off=view.get('byteOffset',0);im['bufferView']=w.view(blob[off:off+view['byteLength']]);out['images'].append(im)
 for mid in mesh_ids:
  mesh=copy.deepcopy(src['meshes'][mid])
  for p in mesh['primitives']:
   if 'targets'in p:raise ValueError('Unexpected morph targets')
   if 'material'in p:p['material']=mat_map[p['material']]
   for semantic,ai in list(p['attributes'].items()):
    ac=src['accessors'][ai];ar=read_accessor(src,blob,ai)
    if semantic=='POSITION':ar=(np.c_[ar,np.ones(len(ar))]@A.T)[:,:3]
    elif semantic=='NORMAL':ar=ar@np.linalg.inv(A[:3,:3]);ar/=np.maximum(np.linalg.norm(ar,axis=1,keepdims=True),1e-12)
    elif semantic=='TANGENT':ar[:,:3]=ar[:,:3]@A[:3,:3].T;ar[:,:3]/=np.maximum(np.linalg.norm(ar[:,:3],axis=1,keepdims=True),1e-12)
    p['attributes'][semantic]=w.accessor(ar,ac['componentType'],ac['type'],ac.get('normalized',False),bounds=semantic=='POSITION',target=34962)
   if 'indices'in p:
    ac=src['accessors'][p['indices']];p['indices']=w.accessor(read_accessor(src,blob,p['indices']),ac['componentType'],ac['type'],target=34963)
  out['meshes'].append(mesh)
 old_ibm=read_accessor(src,blob,src['skins'][skin_ids[0]]['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1)
 for si in skin_ids:
  skin=copy.deepcopy(src['skins'][si]);ibm=read_accessor(src,blob,skin['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1);matrices=ibm@inverseA;skin['inverseBindMatrices']=w.accessor(matrices.transpose(0,2,1).reshape(-1,16),5126,'MAT4');skin['joints']=[node_map[x] for x in skin['joints']]
  if 'skeleton'in skin:skin['skeleton']=node_map[skin['skeleton']]
  out['skins'].append(skin)
 animation=next(a for a in src['animations'] if a['name']==cid)
 for name,(first,last) in SEGMENTS.items():
  anim={'name':name,'channels':[],'samplers':[]}
  for c in animation['channels']:
   if c['target']['node'] not in node_map:raise ValueError('Cross-character animation target')
   if c['target']['node']==root:raise ValueError('Unexpected animated board root')
   sp=animation['samplers'][c['sampler']];mode=sp.get('interpolation','LINEAR')
   if mode not in ('LINEAR','STEP'):raise ValueError(f'Unsupported interpolation {mode}')
   times=read_accessor(src,blob,sp['input']).ravel().astype(float);values=read_accessor(src,blob,sp['output']);start,end=first/30,last/30;ts=np.unique(np.r_[start,times[(times>start+1e-6)&(times<end-1e-6)],end]);vs=np.array([sample(times,values,t,c['target']['path']=='rotation',mode=='STEP') for t in ts]);timeid=w.accessor(ts-start,5126,'SCALAR',bounds=True);valid=w.accessor(vs,5126,src['accessors'][sp['output']]['type']);anim['channels'].append({'sampler':len(anim['samplers']),'target':{'node':node_map[c['target']['node']],'path':c['target']['path']}});anim['samplers'].append({'input':timeid,'output':valid,'interpolation':mode})
  out['animations'].append(anim)
 w.save(path);newglobals=globals_for(out);errors=[]
 for i,joint in enumerate(src['skins'][skin_ids[0]]['joints']):errors.append(float(np.abs(A@original_global[joint]@old_ibm[i]@inverseA-newglobals[node_map[joint]]@matrices[i]).max()))
 if max(errors)>2e-5:raise AssertionError(f'{cid}: skin coordinate mismatch')
 return {'id':cid,'bytes':Path(path).stat().st_size,'sha256':hashlib.sha256(Path(path).read_bytes()).hexdigest(),'mesh_primitives':sum(len(m['primitives']) for m in out['meshes']),'skins':len(out['skins']),'joints':len(out['skins'][0]['joints']),'images':len(out['images']),'clips':list(SEGMENTS),'coordinate_identity_max_error':max(errors),'visual_final_approved':False}
def pose(doc,blob,anim,t):
 overrides={}
 for ch in anim['channels']:
  sp=anim['samplers'][ch['sampler']];node=ch['target']['node'];path=ch['target']['path'];times=read_accessor(doc,blob,sp['input']).ravel();vals=read_accessor(doc,blob,sp['output']);overrides.setdefault(node,{})[path]=sample(times,vals,t,path=='rotation',sp.get('interpolation')=='STEP').tolist()
 return globals_for(doc,overrides)
def validate_animations(src,blob,models):
 reports=[]
 for cid in IDS:
  d,b=load_glb(models/(cid+'.glb'));oldroot=next(i for i,n in enumerate(src['nodes']) if n.get('name')==cid);newroot=next(i for i,n in enumerate(d['nodes']) if n.get('name')==cid);A=trs(d['nodes'][newroot])@np.linalg.inv(trs(src['nodes'][oldroot]));invA=np.linalg.inv(A);os=next(s for s in src['skins'] if s.get('name')==cid);ns=d['skins'][0];oi=read_accessor(src,blob,os['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1);ni=read_accessor(d,b,ns['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1);anim=next(a for a in src['animations'] if a['name']==cid);maximum=0.;samples=0
  for clip,(start,end) in SEGMENTS.items():
   na=next(a for a in d['animations'] if a['name']==clip)
   for f in [0,.23,.61,1]:
    og=pose(src,blob,anim,(start+(end-start)*f)/30);ng=pose(d,b,na,(end-start)*f/30)
    for oj,nj,oldmat,newmat in zip(os['joints'],ns['joints'],oi,ni):maximum=max(maximum,float(np.abs(ng[nj]@newmat-A@og[oj]@oldmat@invA).max()));samples+=1
  assert maximum<1e-4,(cid,maximum)
  reports.append({'character':cid,'six_clips_pose_preserved':True,'joint_pose_comparisons':samples,'max_matrix_error':maximum})
 return reports
def main():
 p=argparse.ArgumentParser();p.add_argument('roster',type=Path);p.add_argument('output',type=Path);a=p.parse_args();a.output.mkdir(parents=True,exist_ok=True);doc,blob=load_glb(a.roster);reports=[extract(doc,blob,cid,a.output/(cid+'.glb')) for cid in IDS];(a.output/'asset-validation.json').write_text(json.dumps({'source_revision':10,'characters':reports,'visual_final_approved':False},indent=2));verification=validate_animations(doc,blob,a.output);(a.output/'animation-preservation.json').write_text(json.dumps({'source_revision':10,'method':'CPU forward-kinematics comparison against authored roster','results':verification,'visual_final_approved':False},indent=2));print(json.dumps(reports,indent=2))
if __name__=='__main__':main()

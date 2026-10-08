"""Portable manual Alexia motion prototype; append skin and true joint channels.

Requires Python3+NumPy plus the explicit accepted semantic-masks.npz input. Source must retain the exact inspected geometry and
original aa2a BIN prefix; a later appended COLOR-only texture repair is accepted.
No original position, normal, UV, COLOR, index, material or image bytes are edited.
Head rigidity uses the accepted hair mask plus exact 12-byte original POSITION cohort closure.
All weights outside that closure and all original clips retain the previous algorithm exactly.
"""
import argparse, base64, copy, hashlib, io, json, math, pathlib, struct, sys, zlib
import numpy as np
sys.dont_write_bytecode=True
SEMANTIC_MASK_SHA256 = '10618a926e013a8a8f9f8d932412f17170197bba2cecd3217c838bdc02ba3649'
BASELINE_BIN_BYTES = 35158032
BASELINE_BIN_SHA256 = '015236a04992809a5623159e77f5e280869ee879bceec7301dd5b610df6908f4'
GEOMETRY_SHA256 = 'ca325e4fd577d9004942918f1b0dd970e6458f8263169eb286f31db1b41ed5de'
CORE_REGION_DATA = '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'
JOINTS=[
 ('Root',None,[-.006,-.4452480674,0]),
 ('Pelvis','Root',[-.006,-.11,.055]),
 ('Spine','Pelvis',[-.006,.015,.035]),
 ('Chest','Spine',[-.006,.09,.035]),
 ('Neck','Chest',[-.01,.157,.04]),
 ('Head','Neck',[-.014,.25,.065]),
 ('UpperArmL','Chest',[-.13,.067,.04]),
 ('ForearmL','UpperArmL',[-.191,-.014,.07]),
 ('HandL','ForearmL',[-.25,-.105,.083]),
 ('UpperArmR','Chest',[.13,.067,.04]),
 ('ForearmR','UpperArmR',[.202,-.017,.067]),
 ('HandR','ForearmR',[.26,-.105,.085]),
 ('ThighL','Pelvis',[-.072,-.151,.064]),
 ('ShinL','ThighL',[-.092,-.265,.073]),
 ('FootL','ShinL',[-.118,-.374,.115]),
 ('ThighR','Pelvis',[.073,-.151,.068]),
 ('ShinR','ThighR',[.10,-.265,.078]),
 ('FootR','ShinR',[.123,-.374,.12]),
 ('Suitcase','HandR',[.246,-.287,.105])]
INDEX={row[0]:i for i,row in enumerate(JOINTS)}
def require(ok,message):
 if not ok:raise ValueError(message)
def sha(raw):return hashlib.sha256(raw).hexdigest()
def read_glb(raw):
 require(raw[:4]==b'glTF' and struct.unpack_from('<II',raw,4)==(2,len(raw)),'GLB header')
 n,kind=struct.unpack_from('<II',raw,12);require(kind==0x4e4f534a,'GLB JSON chunk')
 doc=json.loads(raw[20:20+n]);length,kind=struct.unpack_from('<II',raw,20+n)
 require(kind==0x004e4942 and 28+n+length==len(raw),'Exactly JSON and BIN chunks')
 return doc,raw[28+n:]
def accessor(doc,blob,index):
 a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']]
 dtype={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']]
 width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
 require('sparse' not in a and v.get('buffer',0)==0,'Tight source accessor')
 return np.ndarray((a['count'],width),dtype=dtype,buffer=blob,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',np.dtype(dtype).itemsize*width),np.dtype(dtype).itemsize))
def matrix(node):
 if 'matrix' in node:return np.asarray(node['matrix'],float).reshape(4,4).T
 x,y,z,w=node.get('rotation',[0,0,0,1]);r=np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])
 m=np.eye(4);m[:3,:3]=r@np.diag(node.get('scale',[1,1,1]));m[:3,3]=node.get('translation',[0,0,0]);return m
def worlds(doc):
 out={}
 def walk(i,parent):
  require(i not in out,'Node cycle/multiple parents');out[i]=parent@matrix(doc['nodes'][i])
  for child in doc['nodes'][i].get('children',[]):walk(child,out[i])
 for i in doc['scenes'][doc.get('scene',0)]['nodes']:walk(i,np.eye(4))
 return out
def geometry_signature(doc,blob):
 rows=[]
 for mi,mesh in enumerate(doc['meshes']):
  for pi,p in enumerate(mesh['primitives']):
   for name,index in sorted({**{k:v for k,v in p['attributes'].items() if k!='COLOR_0'},'indices':p['indices']}.items()):
    rows.append([mi,pi,name,index,doc['accessors'][index],sha(accessor(doc,blob,index).tobytes())])
 data={'nodes':doc['nodes'],'scene':doc.get('scene',0),'scenes':doc['scenes'],'materials':doc.get('materials',[]),'images':doc.get('images',[]),'textures':doc.get('textures',[]),'rows':rows}
 return sha(json.dumps(data,sort_keys=True,separators=(',',':')).encode())
def smooth(a,b,x):
 t=np.clip((x-a)/(b-a),0,1);return t*t*(3-2*t)
def region_labels(world,color):
 """Frozen baseline segmentation: rigid head/hair and conservative suitcase box."""
 x,y,z=world.T;rgb=np.where(color[:,:3]<=.0031308,color[:,:3]*12.92,1.055*np.maximum(color[:,:3],0)**(1/2.4)-.055)*255
 lavender=(rgb[:,2]-rgb[:,1]>8)&(rgb[:,2]-rgb[:,0]>0)&(rgb.min(1)>55)
 hair=(y>-.115)&(z<.075)&lavender&((np.abs(x+.006)>.13)|(z<-.055))
 head=(y>=.168)|hair
 bag=((x>.185)&(y<-.145)&(z>-.025))|((x>.233)&(y<-.098)&(z>.015))|((x>.173)&(y<-.19)&(z>.045))
 labels=np.zeros(len(world),dtype=np.uint8);labels[head]=1;labels[bag&~head]=2
 return labels
def weight_arrays(world,labels):
 x,y,z=world.T;n=len(world);w=np.zeros((n,len(JOINTS)),float)
 anchors=[(-.11,'Pelvis'),(.015,'Spine'),(.09,'Chest'),(.157,'Neck'),(.195,'Head')]
 w[:,INDEX['Pelvis']]=1
 for (a,j1),(b,j2) in zip(anchors[:-1],anchors[1:]):
  use=(y>=a)&(y<b);f=smooth(a,b,y[use]);w[use]=0;w[use,INDEX[j1]]=1-f;w[use,INDEX[j2]]=f
 w[y>=anchors[-1][0]]=0;w[y>=anchors[-1][0],INDEX['Head']]=1
 # Four-influence smooth anatomical blends, based solely on unchanged positions.
 ax=np.abs(x+.006);threshold=.145-.13*(y+.1)
 arm=smooth(threshold-.018,threshold+.018,ax)*smooth(-.145,-.108,y)*(1-smooth(.105,.148,y))
 arm[(labels!=0)|(z<-.09)]=0
 for side,select in [('L',x<-.006),('R',x>=-.006)]:
  ids=np.flatnonzero(select);blend=arm[ids];w[ids]*=(1-blend[:,None])
  hand=1-smooth(-.108,-.07,y[ids]);upper=smooth(-.035,.027,y[ids])
  w[ids,INDEX['UpperArm'+side]]+=blend*upper*(1-hand)
  w[ids,INDEX['Forearm'+side]]+=blend*(1-upper)*(1-hand)
  w[ids,INDEX['Hand'+side]]+=blend*hand
 leg=(1-smooth(-.18,-.12,y))*(1-smooth(.167,.19,ax))
 leg[(labels!=0)|((z<.012)&(y>-.225))]=0
 split=smooth(-.025,.025,x+.006)
 w*=1-leg[:,None]
 for side,ratio in [('L',1-split),('R',split)]:
  upper=smooth(-.287,-.235,y);foot=1-smooth(-.393,-.353,y)
  w[:,INDEX['Thigh'+side]]+=leg*ratio*upper
  w[:,INDEX['Shin'+side]]+=leg*ratio*(1-upper)*(1-foot)
  w[:,INDEX['Foot'+side]]+=leg*ratio*(1-upper)*foot
 w[labels==1]=0;w[labels==1,INDEX['Head']]=1
 w[labels==2]=0;w[labels==2,INDEX['Suitcase']]=1
 # Position-coincident source seams receive identical influences. This does not
 # merge vertices or edit topology; it prevents duplicate-boundary weight tears.
 keys=np.round(world,6);_,first,inverse=np.unique(keys,axis=0,return_index=True,return_inverse=True)
 w=w[first[inverse]]
 ids=np.argsort(-w,axis=1,kind='stable')[:,:4].astype('<u2');vals=np.take_along_axis(w,ids,axis=1)
 vals/=vals.sum(1,keepdims=True);vals=vals.astype('<f4')
 require(np.isfinite(vals).all() and (vals>=0).all() and np.max(np.abs(vals.sum(1)-1))<2e-7,'Finite nonnegative unit weights')
 return ids,vals
def quaternion(axis,angle):
 q=np.zeros(4);q[axis]=math.sin(angle/2);q[3]=math.cos(angle/2);return q.tolist()
def frame_pose(clip,t):
 duration=3.6 if clip=='IdleBreath' else 1.2;phase=2*math.pi*t/duration;s=math.sin(phase)
 pose={}
 if clip=='IdleBreath':
  pose['Chest']={'rotation':quaternion(0,.013*s),'translation_delta':[0,.0015*s,0]}
  pose['Neck']={'rotation':quaternion(2,.005*s)}
 else:
  for side,f in [('L',s),('R',-s)]:
   knee=.26*max(0,f);pose['Thigh'+side]={'rotation':quaternion(0,-.20*f)}
   pose['Shin'+side]={'rotation':quaternion(0,knee)}
   pose['Foot'+side]={'rotation':quaternion(0,-.5*knee+.055*f)}
  pose['UpperArmL']={'rotation':quaternion(0,.115*s)}
  pose['ForearmL']={'rotation':quaternion(0,.045*max(0,-s))}
  pose['UpperArmR']={'rotation':quaternion(0,-.025*s)}
  pose['Chest']={'rotation':quaternion(0,.012*math.sin(2*phase))}
  pose['Pelvis']={'rotation':quaternion(2,.012*s),'translation_delta':[0,-.002*(1-math.cos(2*phase)),0]}
 return pose
def joint_worlds(pose=None):
 pose=pose or {};out=[]
 for name,parent,position in JOINTS:
  local=np.array(position,float) if parent is None else np.array(position,float)-np.array(JOINTS[INDEX[parent]][2],float)
  change=pose.get(name,{});node={'translation':(local+change.get('translation_delta',[0,0,0])).tolist(),'rotation':change.get('rotation',[0,0,0,1])}
  out.append(matrix(node) if parent is None else out[INDEX[parent]]@matrix(node))
 return np.array(out)
def deform(world,ids,weights,pose):
 rest=joint_worlds();now=joint_worlds(pose);skin=now@np.linalg.inv(rest)
 p=np.c_[world,np.ones(len(world))];result=np.zeros_like(p)
 for k in range(4):result+=np.einsum('nij,nj->ni',skin[ids[:,k]],p)*weights[:,k,None]
 return result[:,:3]
def append(doc,blob,data,kind,component,count,target=None,bounds=False,name=None):
 while len(blob)%4:blob.extend(b'\x00')
 view={'buffer':0,'byteOffset':len(blob),'byteLength':len(data)}
 if target:view['target']=target
 vi=len(doc['bufferViews']);doc['bufferViews'].append(view);blob.extend(data)
 a={'bufferView':vi,'componentType':component,'count':count,'type':kind}
 if name:a['name']=name
 if bounds:
  arr=np.frombuffer(data,dtype='<f4').reshape(count,-1);a.update(min=arr.min(0).tolist(),max=arr.max(0).tolist())
 ai=len(doc['accessors']);doc['accessors'].append(a);return ai
def write_glb(doc,blob):
 doc['buffers'][0]['byteLength']=len(blob)
 raw=json.dumps(doc,separators=(',',':'),ensure_ascii=True).encode();raw+=b' '*((-len(raw))%4)
 binary=bytes(blob)+b'\x00'*((-len(blob))%4)
 return struct.pack('<III',0x46546c67,2,28+len(raw)+len(binary))+struct.pack('<II',len(raw),0x4e4f534a)+raw+struct.pack('<II',len(binary),0x004e4942)+binary
def semantic_hair_mask(path,count):
 raw=path.read_bytes();stamp=path.stat().st_mtime_ns
 require(sha(raw)==SEMANTIC_MASK_SHA256,'Wrong accepted immutable semantic mask')
 with np.load(io.BytesIO(raw),allow_pickle=False) as archive:
  hair=archive['hair_indices'].copy();hands=archive['hands_indices'].copy();protected=archive['protected_critical_indices'].copy();allowed=archive['allowed_color_indices'].copy();layers=archive['layer_code'].copy()
 require(hair.dtype==np.dtype('<i8') and hair.shape==(99032,) and np.array_equal(hair,np.unique(hair)) and hair.min()>=0 and hair.max()<count,'Exact accepted sorted hair vertex mask')
 require(layers.shape==(count,) and np.all(layers[hair]==1) and np.isin(hair,allowed).all(),'Semantic hair correspondence to actual accepted core layer/allowed mask')
 require(not np.intersect1d(hair,hands).size and not np.intersect1d(hair,protected).size,'Semantic hair overlaps protected hand/critical vertices')
 return hair,raw,stamp

def exact_hair_closure(doc,blob,hair,mask_raw):
 p=accessor(doc,blob,doc['meshes'][0]['primitives'][0]['attributes']['POSITION'])
 require(p.dtype==np.dtype('<f4') and p.shape==(252943,3),'Original FLOAT VEC3 POSITION required')
 keys=np.ascontiguousarray(p,dtype='<f4').view(np.dtype((np.void,12))).reshape(-1)
 _,groups=np.unique(keys,return_inverse=True)
 closure=np.flatnonzero(np.isin(groups,np.unique(groups[hair]))).astype('<i8')
 extras=np.setdiff1d(closure,hair)
 require(len(closure)==99250 and len(extras)==218,'Exact source-position hair closure count differs')
 with np.load(io.BytesIO(mask_raw),allow_pickle=False) as archive:
  for key in ['hands_indices','protected_critical_indices','mandatory_face_indices','cup_indices']:
   require(not np.intersect1d(closure,archive[key]).size,'Exact-position closure overlaps protected '+key)
  jacket=archive['jacket_indices'].copy();cuff=archive['cuff_indices'].copy()
 return closure,extras,groups,{'jacket_color_layer_extra_vertices':int(np.intersect1d(extras,jacket).size),'cuff_color_layer_extra_vertices':int(np.intersect1d(extras,cuff).size)}

def build(source,output,semantic_mask):
 raw=source.read_bytes();stamp=source.stat().st_mtime_ns;old,oldbin=read_glb(raw)
 require(not old.get('skins') and not old.get('animations') and len(old['meshes'])==3,'Exact static three-mesh input required')
 require(len(oldbin)>=BASELINE_BIN_BYTES and sha(oldbin[:BASELINE_BIN_BYTES])==BASELINE_BIN_SHA256 and geometry_signature(old,oldbin)==GEOMETRY_SHA256,'Inspected original geometry/material/node/BIN-prefix contract differs')
 hair_indices,mask_raw,mask_stamp=semantic_hair_mask(semantic_mask,old['accessors'][old['meshes'][0]['primitives'][0]['attributes']['POSITION']]['count'])
 closure_indices,closure_extras,position_groups,closure_semantics=exact_hair_closure(old,oldbin,hair_indices,mask_raw)
 weight_delta={}
 require(not output.exists(),'Fresh output child required');output.mkdir(parents=True)
 doc=copy.deepcopy(old);blob=bytearray(oldbin);node_world=worlds(old);node_start=len(doc['nodes']);rest=joint_worlds()
 for name,parent,position in JOINTS:
  translation=np.array(position) if parent is None else np.array(position)-np.array(JOINTS[INDEX[parent]][2])
  node={'name':'AlexiaPrototype_'+name,'translation':translation.tolist(),'rotation':[0,0,0,1]}
  children=[node_start+i for i,row in enumerate(JOINTS) if row[1]==name]
  if children:node['children']=children
  doc['nodes'].append(node)
 doc['scenes'][doc.get('scene',0)]['nodes'].append(node_start)
 core_labels=np.frombuffer(zlib.decompress(base64.b64decode(CORE_REGION_DATA)),dtype=np.uint8)
 weights_report=[];core=None;skin_map={};doc['skins']=[]
 for ni,node in enumerate(old['nodes']):
  if 'mesh' not in node:continue
  mi=node['mesh'];m=node_world[ni];key=tuple(m.ravel())
  if key not in skin_map:
   ibm=np.linalg.inv(rest)@m
   ai=append(doc,blob,ibm.transpose(0,2,1).astype('<f4').tobytes(),'MAT4',5126,len(JOINTS),name='AlexiaPrototype_inverseBindMatrices')
   skin_map[key]=len(doc['skins']);doc['skins'].append({'name':'AlexiaPrototype_skin_'+str(len(doc['skins'])),'skeleton':node_start,'joints':list(range(node_start,node_start+len(JOINTS))),'inverseBindMatrices':ai})
  doc['nodes'][ni]['skin']=skin_map[key]
  for pi,prim in enumerate(old['meshes'][mi]['primitives']):
   local=accessor(old,oldbin,prim['attributes']['POSITION']).astype(float);world=(np.c_[local,np.ones(len(local))]@m.T)[:,:3]
   labels=core_labels if mi==0 else np.ones(len(world),np.uint8)
   require(len(labels)==len(world),'Frozen rig region count differs');ids,vals=weight_arrays(world,labels)
   if mi==0:
    # Root-authorized exact 12-byte POSITION cohort closure preserves seams.
    # The 218 extra vertices are shared-position seam members, including
    # 24 jacket-color and one cuff-color vertex; they are not all hair labels.
    before_ids=ids.copy();before_vals=vals.copy()
    ids=ids.copy();vals=vals.copy()
    ids[closure_indices]=[INDEX['Head'],0,1,2];vals[closure_indices]=[1,0,0,0]
    changed=np.flatnonzero(np.any(ids!=before_ids,axis=1)|np.any(vals.view('<u4')!=before_vals.view('<u4'),axis=1))
    require(np.isin(changed,closure_indices).all(),'Weights changed outside authorized exact-position closure')
    require(np.all((vals[closure_indices]*(ids[closure_indices]==INDEX['Head'])).sum(1)==1),'Every semantic hair and exact-position seam vertex must be head-rigid')
    old_head=(before_vals*(before_ids==INDEX['Head'])).sum(1,dtype=np.float64)
    new_head=(vals*(ids==INDEX['Head'])).sum(1,dtype=np.float64)
    effective_changed=np.flatnonzero(old_head!=new_head)
    ordered=np.argsort(position_groups,kind='stable');same=np.diff(position_groups[ordered])==0
    def split_groups(j,w):
     differences=np.any(j[ordered[1:]]!=j[ordered[:-1]],axis=1)|np.any(w[ordered[1:]].view('<u4')!=w[ordered[:-1]].view('<u4'),axis=1)
     return np.unique(position_groups[ordered[1:][same&differences]])
    old_splits=split_groups(before_ids,before_vals);new_splits=split_groups(ids,vals)
    require(not np.setdiff1d(new_splits,old_splits).size,'New split exact POSITION cohort')
    weight_delta={'byte_changed_weight_vertices':len(changed),'effective_head_influence_changed_vertices':len(effective_changed),'effective_hair_head_influence_changed_vertices':int(np.isin(effective_changed,hair_indices).sum()),'effective_extra_head_influence_changed_vertices':int(np.isin(effective_changed,closure_extras).sum()),'old_exact_position_split_weight_groups':len(old_splits),'new_exact_position_split_weight_groups':len(new_splits),'newly_split_exact_position_weight_groups':0,'corrected_weight_vertices':len(changed),'corrected_hair_weight_vertices':int(np.isin(changed,hair_indices).sum()),'corrected_extra_weight_vertices':int(np.isin(changed,closure_extras).sum()),'all_other_weight_rows_exact':True,'changed_weights_only_in_hair_and_exact_position_closure':True,'closure_extra_vertex_count':len(closure_extras),**closure_semantics}

   ji=append(doc,blob,ids.tobytes(),'VEC4',5123,len(ids),34962,name=f'AlexiaPrototype_mesh{mi}_primitive{pi}_joints')
   wi=append(doc,blob,vals.tobytes(),'VEC4',5126,len(vals),34962,name=f'AlexiaPrototype_mesh{mi}_primitive{pi}_weights')
   doc['meshes'][mi]['primitives'][pi]['attributes'].update(JOINTS_0=ji,WEIGHTS_0=wi)
   bind=deform(world,ids,vals,{})
   require(np.max(np.abs(bind-world))<5e-8,'CPU bind pose changed')
   weights_report.append({'mesh':mi,'primitive':pi,'vertices':len(ids),'JOINTS_accessor':ji,'WEIGHTS_accessor':wi,'nonnegative_finite':True,'max_weight_sum_error':float(np.max(np.abs(vals.sum(1)-1))),'rigid_head_vertices':int((labels==1).sum()),'rigid_suitcase_vertices':int((labels==2).sum()),'world_bind_max_error':float(np.max(np.abs(bind-world)))})
   if mi==0:core=(world,ids,vals,labels)
 doc['animations']=[]
 for clip,duration in [('IdleBreath',3.6),('Walk',1.2)]:
  times=np.linspace(0,duration,49,dtype='<f4');ti=append(doc,blob,times.tobytes(),'SCALAR',5126,len(times),bounds=True,name=clip+'_times')
  animation={'name':clip,'samplers':[],'channels':[],'extras':{'manual_prototype':True,'in_place':True,'production_ready':False}}
  used=frame_pose(clip,duration/4)
  if clip=='Walk':used.update(frame_pose(clip,3*duration/4))
  for joint,paths in used.items():
   for path in paths:
    target_path='translation' if path=='translation_delta' else path
    values=[]
    for t in times:
     value=frame_pose(clip,float(t))[joint][path]
     if path=='translation_delta':value=(np.array(JOINTS[INDEX[joint]][2])-np.array(JOINTS[INDEX[JOINTS[INDEX[joint]][1]]][2])+value).tolist()
     values.append(value)
    ai=append(doc,blob,np.asarray(values,dtype='<f4').tobytes(),'VEC4' if target_path=='rotation' else 'VEC3',5126,len(times),name=clip+'_'+joint+'_'+target_path)
    si=len(animation['samplers']);animation['samplers'].append({'input':ti,'output':ai,'interpolation':'LINEAR'})
    animation['channels'].append({'sampler':si,'target':{'node':node_start+INDEX[joint],'path':target_path}})
  doc['animations'].append(animation)
 candidate=write_glb(doc,blob);cd,cb=read_glb(candidate)
 require(cb[:len(oldbin)]==oldbin and cd['accessors'][:len(old['accessors'])]==old['accessors'] and cd['bufferViews'][:len(old['bufferViews'])]==old['bufferViews'],'Original BIN/accessor/view prefixes changed')
 for key in ['materials','images','textures']:
  require(cd.get(key)==old.get(key),'Original material/image records changed')
 samples=[];world,ids,vals,labels=core
 for clip,duration in [('IdleBreath',3.6),('Walk',1.2)]:
  for t in [0,duration/4,duration/2,3*duration/4,duration]:
   posed=deform(world,ids,vals,frame_pose(clip,t));delta=posed-world
   require(np.isfinite(posed).all(),'Nonfinite CPU skinned samples')
   feet={}
   for side in ['L','R']:
    use=(vals*(ids==INDEX['Foot'+side])).sum(1)>.7
    feet[side]={'count':int(use.sum()),'mean_delta':delta[use].mean(0).tolist(),'min_Y':float(posed[use,1].min())}
   samples.append({'clip':clip,'time':t,'max_world_displacement':float(np.linalg.norm(delta,axis=1).max()),'mean_world_displacement':float(np.linalg.norm(delta,axis=1).mean()),'world_bounds_min':posed.min(0).tolist(),'world_bounds_max':posed.max(0).tolist(),'foot_groups':feet,'finite':True})
 require(np.max(np.abs(deform(world,ids,vals,frame_pose('Walk',0))-world))<5e-8,'Walk t0 is not neutral')
 require(source.read_bytes()==raw and source.stat().st_mtime_ns==stamp,'Read-only source changed')
 output_model=output/'alexia.glb';output_model.write_bytes(candidate)
 np.savez_compressed(output/'rig-weight-regions.npz',region_labels=labels,JOINTS_0=ids,WEIGHTS_0=vals,semantic_hair_indices=hair_indices,exact_hair_position_closure_indices=closure_indices,shared_position_extra_indices=closure_extras)
 require(semantic_mask.read_bytes()==mask_raw and semantic_mask.stat().st_mtime_ns==mask_stamp,'Read-only semantic mask changed')
 proof={'schema':'crwt.alexia_manual_motion_prototype.v1','passed':True,'approved':False,'gameIntegrated':False,'production_ready':False,'source_path':str(source.resolve()),'source_sha256':sha(raw),'candidate_sha256':sha(candidate),'candidate_bytes':len(candidate),'recipe_sha256':sha(pathlib.Path(__file__).read_bytes()),'semantic_mask_npz_sha256':sha(mask_raw),'semantic_mask_geometry_signature_sha256':GEOMETRY_SHA256,'semantic_hair_count':len(hair_indices),'semantic_hair_all_actual_head_weight_one':True,'semantic_hair_protected_hands_and_critical_disjoint':True,'outside_exact_hair_position_closure_weights_preserved':True,'exact_hair_position_closure_vertices':len(closure_indices),'shared_position_extra_vertices':len(closure_extras),'all_exact_hair_position_closure_rigid_head':True,'semantic_hair_rig':{'hair_vertex_count':len(hair_indices),'all_hair_head_rigid':True,'exact_position_closure_vertex_count':len(closure_indices),'head_joint_index':INDEX['Head'],**weight_delta},'semantic_mask_content_and_mtime_unchanged':True,'original_BIN_prefix_exact':True,'original_accessors_and_bufferViews_exact_prefix':True,'original_POSITION_NORMAL_UV_COLOR_index_material_image_bytes_preserved':True,'original_node_transforms_preserved':True,'three_original_meshes_preserved':True,'joint_count':len(JOINTS),'skin_count':len(doc['skins']),'joints':[{'name':name,'parent':parent,'world_rest_position':pos} for name,parent,pos in JOINTS],'weight_primitives':weights_report,'clips':[{'name':a['name'],'duration':3.6 if a['name']=='IdleBreath' else 1.2,'channels':len(a['channels']),'interpolation':'LINEAR','in_place':True,'neutral_at_t0':True} for a in doc['animations']],'actual_CPU_deformation_samples':samples,'source_content_and_mtime_unchanged':True,'head_cups_and_rear_locks_share_rigid_head_joint':True,'suitcase_is_rigid_right_hand_accessory':True,'visual_motion_accepted':False,'specification':'https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#skins','limits':['Exact-position seam closure adds 218 shared-point vertices to the 99,032 hair mask, including 24 jacket-color and one cuff-color vertex; these extras are seam members, not an unambiguous hair classification.','Manual approximate anatomical landmarks and smooth spatial weighting on a merged chibi mesh; no retopology or production rig certification.','Walk is an in-place alternating limb step prototype, with no root travel, foot IK, collision or exact ground-contact guarantee.','Coat, hands, hair and suitcase originate in merged geometry; limited angles reduce but do not certify against intersections.','Original static face and baked lighting remain; no facial rig or dynamic hair simulation.']}
 with (output/'motion-proof.json').open('x',encoding='utf-8') as f:json.dump(proof,f,indent=2);f.write('\n')
 return proof
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--source',type=pathlib.Path,required=True);p.add_argument('--semantic-mask',type=pathlib.Path,required=True);p.add_argument('--output-parent',type=pathlib.Path,required=True);p.add_argument('--name',default='alexia-motion-prototype');a=p.parse_args()
 require(a.name and pathlib.Path(a.name).name==a.name,'Safe fresh child name')
 proof=build(a.source.resolve(strict=True),a.output_parent.resolve()/a.name,a.semantic_mask.resolve(strict=True))
 print(json.dumps({k:proof[k] for k in ['passed','source_sha256','candidate_sha256','candidate_bytes','joint_count','skin_count','clips','visual_motion_accepted','semantic_mask_npz_sha256','semantic_hair_count','semantic_hair_all_actual_head_weight_one']},indent=2))
if __name__=='__main__':main()

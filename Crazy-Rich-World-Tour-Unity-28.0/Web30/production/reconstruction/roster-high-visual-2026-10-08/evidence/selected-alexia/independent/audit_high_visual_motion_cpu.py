"""Read-only audit of serialized glTF LBS and real animation samplers. NumPy only."""
import sys
sys.dont_write_bytecode=True
import argparse,copy,hashlib,json,pathlib,struct
import numpy as np

def require(ok,message):
 if not ok:raise ValueError(message)
def sha(raw):return hashlib.sha256(raw).hexdigest()
def read(path):
 raw=path.read_bytes();require(raw[:4]==b'glTF' and struct.unpack_from('<II',raw,4)==(2,len(raw)),'GLB header')
 size,kind=struct.unpack_from('<II',raw,12);require(kind==0x4e4f534a,'JSON chunk');doc=json.loads(raw[20:20+size]);n,kind=struct.unpack_from('<II',raw,20+size);require(kind==0x004e4942 and 28+size+n==len(raw),'BIN chunk');return raw,doc,raw[28+size:]
def acc(doc,blob,i):
 a=doc['accessors'][i];v=doc['bufferViews'][a['bufferView']];dt=np.dtype({5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']]);w={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']];require('sparse' not in a and v.get('buffer',0)==0,'Accessor format');return np.ndarray((a['count'],w),dt,blob,v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',dt.itemsize*w),dt.itemsize))
def matrix(n):
 if 'matrix' in n:return np.asarray(n['matrix'],float).reshape(4,4).T
 x,y,z,w=n.get('rotation',[0,0,0,1]);m=np.eye(4);m[:3,:3]=np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])@np.diag(n.get('scale',[1,1,1]));m[:3,3]=n.get('translation',[0,0,0]);return m
def worlds(doc,changes=None):
 nodes=copy.deepcopy(doc['nodes']);out={}
 for i,row in (changes or {}).items():nodes[i].update(row)
 def visit(i,parent):
  require(i not in out,'Scene node cycle or multiple parent');out[i]=parent@matrix(nodes[i])
  for child in nodes[i].get('children',[]):visit(child,out[i])
 for i in doc['scenes'][doc.get('scene',0)]['nodes']:visit(i,np.eye(4))
 return out
def slerp(a,b,f):
 a=np.asarray(a,float);b=np.asarray(b,float);dot=float(a@b)
 if dot<0:b=-b;dot=-dot
 if dot>.9995:q=a+(b-a)*f;return q/np.linalg.norm(q)
 theta=np.arccos(np.clip(dot,-1,1));return (np.sin((1-f)*theta)*a+np.sin(f*theta)*b)/np.sin(theta)
def sample(doc,blob,animation,t):
 changes={}
 for channel in animation['channels']:
  s=animation['samplers'][channel['sampler']];require(s.get('interpolation','LINEAR')=='LINEAR','Expected actual LINEAR channels');times=acc(doc,blob,s['input']).ravel().astype(float);values=acc(doc,blob,s['output']);require(np.isfinite(times).all() and np.all(np.diff(times)>0),'Key time monotonic/finite');require(np.isfinite(values).all() and len(values)==len(times),'Key value finite/count')
  target=channel['target'];require(target['path'] in ['translation','rotation'],'Actual joint rotation/translation channel');k=min(max(int(np.searchsorted(times,t,side='right')-1),0),len(times)-2);f=np.clip((t-times[k])/(times[k+1]-times[k]),0,1)
  if target['path']=='rotation':require(np.max(np.abs(np.linalg.norm(values,axis=1)-1))<2e-6,'Unit quaternion keys');value=slerp(values[k],values[k+1],f)
  else:value=(1-f)*values[k]+f*values[k+1]
  changes.setdefault(target['node'],{})[target['path']]=value.tolist()
 return worlds(doc,changes)
def deform(doc,blob,ni,prim,world):
 skin=doc['skins'][doc['nodes'][ni]['skin']];joints=skin['joints'];ibm=acc(doc,blob,skin['inverseBindMatrices']).astype(float).reshape(-1,4,4).transpose(0,2,1);jointmat=np.stack([world[i] for i in joints])@ibm
 pos=acc(doc,blob,prim['attributes']['POSITION']).astype(float);ids=acc(doc,blob,prim['attributes']['JOINTS_0']);weights=acc(doc,blob,prim['attributes']['WEIGHTS_0']);hom=np.c_[pos,np.ones(len(pos))];result=np.zeros((len(pos),4))
 for slot in range(4):result+=np.einsum('nij,nj->ni',jointmat[ids[:,slot]],hom)*weights[:,slot,None]
 return result[:,:3]
def audit(baseline,candidate,report):
 stamps={p:(sha(p.read_bytes()),p.stat().st_mtime_ns) for p in (baseline,candidate)}
 sr,sd,sb=read(baseline);cr,cd,cb=read(candidate)
 require(cd['skins']==sd['skins'] and cd['animations']==sd['animations'],'Actual inherited skin/clip documents exact')
 require(cb[:len(sb)]==sb,'Original e18 BIN prefix exact')
 for anim in sd['animations']:
  for s in anim['samplers']:
   for key in ('input','output'):require(acc(sd,sb,s[key]).tobytes()==acc(cd,cb,s[key]).tobytes(),'Actual inherited clip stream exact')
 rest=worlds(cd);jset=set(cd['skins'][0]['joints']);require(len(jset)==19,'Actual19joint skeleton')
 prims=[];rows=[]
 for ni in sorted(rest):
  node=cd['nodes'][ni]
  if 'mesh' not in node:continue
  sk=cd['skins'][node['skin']];names=[cd['nodes'][i]['name'].replace('AlexiaPrototype_','') for i in sk['joints']]
  for pi,pr in enumerate(cd['meshes'][node['mesh']]['primitives']):
   pos=acc(cd,cb,pr['attributes']['POSITION']).astype(float);ids=acc(cd,cb,pr['attributes']['JOINTS_0']);w=acc(cd,cb,pr['attributes']['WEIGHTS_0']);indices=acc(cd,cb,pr['indices']).ravel();active=np.unique(indices)
   require(np.isfinite(pos).all() and np.isfinite(w).all() and w.min()>=0 and abs(w.sum(1)-1).max()<2e-7 and ids.max()<len(names),'Actualfinite skin rows/normalized weights')
   expected=(np.c_[pos,np.ones(len(pos))]@rest[ni].T)[:,:3];actual=deform(cd,cb,ni,pr,rest);error=float(abs(actual-expected).max());require(error<2e-7,'Actualcandidate IBM/rest compatibility')
   rows.append({'mesh':node['mesh'],'primitive':pi,'vertices':len(pos),'referenced_vertices':len(active),'triangles':len(indices)//3,'rest_world_max_error':error,'weight_sum_max_error':float(abs(w.sum(1)-1).max())});prims.append((ni,pr,expected,ids,w,active,names))
 samples=[];clips=[]
 for anim in cd['animations']:
  duration=max(float(acc(cd,cb,s['input'])[-1,0]) for s in anim['samplers']);clips.append({'name':anim['name'],'duration':duration,'channels':len(anim['channels'])})
  for fraction in (0,.125,.25,.375,.5,.625,.75,.875,1):
   tm=duration*fraction;world=sample(cd,cb,anim,tm);maxdisp=0;foot={side:[] for side in ('L','R')};minfoot={side:[] for side in ('L','R')}
   for ni,pr,expected,ids,w,active,names in prims:
    actual=deform(cd,cb,ni,pr,world);require(np.isfinite(actual).all(),'FiniteactualCPUskinning');delta=actual-expected;maxdisp=max(maxdisp,float(np.linalg.norm(delta[active],axis=1).max()))
    for side in ('L','R'):
     slot=names.index('Foot'+side);flag=(w[active]*(ids[active]==slot)).sum(1)>.7;use=active[flag]
     if len(use):foot[side].append(delta[use]);minfoot[side].append(float(actual[use,1].min()))
   if fraction in (0,1):require(maxdisp<2e-7,'Both actual clips return to neutral endpoints')
   groups={side:{'referenced_drawn_vertices':sum(len(q) for q in foot[side]),'mean_delta':np.concatenate(foot[side]).mean(0).tolist(),'min_world_Y':min(minfoot[side])} for side in ('L','R')}
   samples.append({'clip':anim['name'],'fraction':fraction,'time':tm,'all_active_primitives_finite':True,'max_actual_drawn_vertex_world_displacement':maxdisp,'actual_drawn_foot_groups':groups})
 q=next(s for s in samples if s['clip']=='Walk' and s['fraction']==.25);o=next(s for s in samples if s['clip']=='Walk' and s['fraction']==.75)
 require(q['actual_drawn_foot_groups']['L']['mean_delta'][2]*q['actual_drawn_foot_groups']['R']['mean_delta'][2]<0,'Quarterphase drawnfeet opposite')
 require(o['actual_drawn_foot_groups']['L']['mean_delta'][2]*o['actual_drawn_foot_groups']['R']['mean_delta'][2]<0,'Threequarterphase drawnfeet opposite')
 require(q['actual_drawn_foot_groups']['L']['mean_delta'][2]*o['actual_drawn_foot_groups']['L']['mean_delta'][2]<0,'Actualdrawnfeet genuinelyalternate')
 unchanged=stamps=={p:(sha(p.read_bytes()),p.stat().st_mtime_ns) for p in (baseline,candidate)};require(unchanged,'Source/candidate unchanged')
 result={'schema':'crwt.alexia_high_visual_actual_motion_CPU.v1','passed':True,'source_sha256':sha(sr),'candidate_sha256':sha(cr),'joint_count':len(jset),'skin_count':len(cd['skins']),'active_mesh_instances':sum('mesh' in cd['nodes'][i] for i in rest),'active_primitives':rows,'clips':clips,'actual_serialized_animation_CPU_samples':samples,'real_alternating_actual_drawn_walk_foot_motion':True,'both_clips_neutral_at_endpoints':True,'input_content_mtime_unchanged':True,'approved':False,'gameIntegrated':False,'production_ready':False,'visual_motion_accepted':False,'limits':['Manual inherited in-place walk has no foot IK/contact/collision guarantee.','CPU finite/rest/phase checks do not alone certify visual skin or clothing fit.','Inactive old rear-lock node is excluded from actual default-scene sampling.']}
 require(not report.exists(),'Fresh report');report.open('x',encoding='utf-8').write(json.dumps(result,indent=2)+'\n');print(json.dumps({'passed':True,'report_sha256':sha(report.read_bytes()),'active_primitives':len(rows),'samples':len(samples),'clips':clips}))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--baseline',type=pathlib.Path,required=True);p.add_argument('--candidate',type=pathlib.Path,required=True);p.add_argument('--report',type=pathlib.Path,required=True);a=p.parse_args();audit(a.baseline.resolve(),a.candidate.resolve(),a.report.resolve())

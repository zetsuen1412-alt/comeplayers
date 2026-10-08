"""Replace the cold reconstructed rear-calf shell, keeping actual warm skin.

Fresh geometry trial. Original warm front skin, face, hands and source streams
are stored and retained; new closed calves use the existing Thigh/Shin joints.
"""
import sys
sys.dont_write_bytecode=True
import argparse,copy,hashlib,json,pathlib,struct
import numpy as np
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def read(p):
 r=p.read_bytes();assert struct.unpack_from('<4sII',r)==(b'glTF',2,len(r));n,k=struct.unpack_from('<II',r,12);assert k==0x4e4f534a
 size,k=struct.unpack_from('<II',r,20+n);assert k==0x004e4942
 return json.loads(r[20:20+n]),r[28+n:28+n+size]
def acc(d,b,i):
 a=d['accessors'][i];v=d['bufferViews'][a['bufferView']];width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']];dt=np.dtype({5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']])
 return np.ndarray((a['count'],width),dt,buffer=b,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',width*dt.itemsize),dt.itemsize)).copy()
def build(source,baseline,semantic,output):
 assert not output.exists();inputs=(source,baseline,semantic);before={str(p):(sha(p),p.stat().st_mtime_ns) for p in inputs};d,b=read(source);bd,bb=read(baseline)
 q=d['meshes'][0]['primitives'][0];attrs=q['attributes'];local=acc(d,b,attrs['POSITION']);world=local.astype(float)*[-1,1,-1];x,y,z=world.T;ax=abs(x+.006);rows=np.arange(len(local));old=acc(d,b,q['indices']).reshape(-1,3)
 assert sha(baseline)=='e18cc26d9662d5ec615fa636150b5f4eddaab9c8ca4c2b3b1ea702bf1d50efca'
 sem=np.load(semantic);hairflag=np.isin(rows,sem['hair_indices']);_,groups=np.unique(local.view(np.dtype((np.void,12))).reshape(-1),return_inverse=True);hair=np.isin(groups,groups[hairflag])
 node=next(n for n in d['nodes'] if n.get('mesh')==0);skin=d['skins'][node['skin']];names=[d['nodes'][n]['name'].replace('AlexiaPrototype_','') for n in skin['joints']];slots={n:i for i,n in enumerate(names)}
 j=acc(d,b,attrs['JOINTS_0']);w=acc(d,b,attrs['WEIGHTS_0']);bone={name:np.where(j==i,w,0).sum(1) for name,i in slots.items()};head,case=bone['Head'],bone['Suitcase'];leg=sum(bone[n] for n in ('ThighL','ShinL','FootL','ThighR','ShinR','FootR'))
 col=acc(bd,bb,bd['meshes'][0]['primitives'][0]['attributes']['COLOR_0'])[:,:3].astype(float);rgb=np.where(col<=.0031308,col*12.92,1.055*np.power(col,1/2.4)-.055);warm=(rgb[:,0]>.65)&(rgb[:,2]>.4)&(rgb[:,0]-rgb[:,1]>.04)&(rgb[:,1]-rgb[:,2]>.015)
 legregion=(y>-.35)&(y<-.13)&(ax>.008)&(ax<.18)&(leg>.5)&(head<.1)&(case<.1);warm_leg=legregion&warm
 handheavy=(bone['HandL']+bone['HandR']>.35)&(case<.2)&(head<.1);handskin=warm&(y>-.20)&(y<-.035)&(ax>.145)&(z>-.05)&(head<.1)&(case<.2);shirt=(y>-.04)&(y<.15)&(ax<.077)&(z>.061)&(head<.2)&(case<.1)
 protected=np.isin(rows,np.r_[sem['mandatory_face_indices'],sem['cup_indices']])|hair|warm_leg|handheavy|handskin|shirt
 coldrear=legregion&~warm&(y>-.34)&(y<-.153)&(z<.065)
 remove=np.any(coldrear[old],1)&np.all(legregion[old],1)&~np.any(protected[old],1)
 assert not np.any(protected[old[remove]])
 dd=copy.deepcopy(d);binary=bytearray(b)
 def stream(arr,kind,component,target):
  arr=np.ascontiguousarray(arr);binary.extend(b'\0'*(-len(binary)%4));vi=len(dd['bufferViews']);ai=len(dd['accessors']);dd['bufferViews'].append({'buffer':0,'byteOffset':len(binary),'byteLength':arr.nbytes,'target':target});binary.extend(arr.tobytes());a={'bufferView':vi,'componentType':component,'count':len(arr),'type':kind}
  if kind=='VEC3':a.update(min=arr.min(0).tolist(),max=arr.max(0).tolist())
  dd['accessors'].append(a);return ai
 dd['meshes'][0]['primitives'][0]['indices']=stream(old[~remove].reshape(-1).astype('<u4'),'SCALAR',5125,34963)
 material=len(dd['materials']);skincolor=np.median(col[warm_leg],axis=0);dd['materials'].append({'name':'Alexia clean rear calf skin','pbrMetallicRoughness':{'baseColorFactor':[*skincolor.tolist(),1],'metallicFactor':0,'roughnessFactor':.72}})
 fit=[];component=[];nr,ns=49,48
 for side,label in ((-1,'L'),(1,'R')):
  samples=world[warm_leg&(x*side>0)];controls=[]
  for yy in np.linspace(-.326,-.142,10):
   near=samples[abs(samples[:,1]-yy)<.018]
   if len(near)<12:near=samples[np.argsort(abs(samples[:,1]-yy))[:80]]
   xlo,xhi=np.quantile(near[:,0],[.08,.92]);zlo,zhi=np.quantile(near[:,2],[.08,.92]);cx=(xlo+xhi)/2;cz=(zlo+zhi)/2
   rx=float(np.clip((xhi-xlo)/2-.002,.025,.036));rz=float(np.clip((zhi-zlo)/2-.002,.028,.039))
   controls.append([yy,float(cx),float(cz),rx,rz,len(near)])
  controls=np.asarray(controls);ys=np.linspace(-.326,-.142,nr);cx=np.interp(ys,controls[:,0],controls[:,1]);cz=np.interp(ys,controls[:,0],controls[:,2]);rx=np.interp(ys,controls[:,0],controls[:,3]);rz=np.interp(ys,controls[:,0],controls[:,4])
  # Smooth fitted slice transitions; endpoint controls remain bounded.
  for _ in range(4):
   for a in (cx,cz,rx,rz):a[1:-1]=(a[:-2]+2*a[1:-1]+a[2:])/4
  vertices=[]
  for row,yy in enumerate(ys):
   for k in range(ns):
    theta=2*np.pi*k/ns;vertices.append([cx[row]+rx[row]*np.sin(theta),yy,cz[row]+rz[row]*np.cos(theta)])
  triangles=[]
  for row in range(nr-1):
   for k in range(ns):a=row*ns+k;bb=row*ns+(k+1)%ns;c=a+ns;e=bb+ns;triangles.extend([[a,bb,c],[bb,e,c]])
  vertices.extend([[cx[0],ys[0],cz[0]],[cx[-1],ys[-1],cz[-1]]]);first,last=len(vertices)-2,len(vertices)-1
  for k in range(ns):triangles.extend([[first,(k+1)%ns,k],[last,(nr-1)*ns+k,(nr-1)*ns+(k+1)%ns]])
  p=np.asarray(vertices,float);t=np.asarray(triangles,dtype='<u4');volume=np.einsum('ij,ij->',p[t[:,0]],np.cross(p[t[:,1]],p[t[:,2]]))/6
  if volume<0:t=t[:,[0,2,1]];volume=-volume
  cross=np.cross(p[t[:,1]]-p[t[:,0]],p[t[:,2]]-p[t[:,0]]);normal=np.zeros_like(p)
  for k in range(3):np.add.at(normal,t[:,k],cross)
  normal/=np.linalg.norm(normal,axis=1)[:,None];assert np.linalg.norm(cross,axis=1).min()>1e-12
  nj=np.zeros((len(p),4),'<u2');nw=np.zeros((len(p),4),'<f4');nj[:,0]=slots['Thigh'+label];nj[:,1]=slots['Shin'+label];thigh=np.interp(p[:,1],[-.326,-.255,-.20,-.142],[0,0,.55,1]);nw[:,0]=thigh;nw[:,1]=1-nw[:,0]
  at={'POSITION':stream((p*[-1,1,-1]).astype('<f4'),'VEC3',5126,34962),'NORMAL':stream((normal*[-1,1,-1]).astype('<f4'),'VEC3',5126,34962),'JOINTS_0':stream(nj,'VEC4',5123,34962),'WEIGHTS_0':stream(nw,'VEC4',5126,34962)};dd['meshes'][0]['primitives'].append({'attributes':at,'indices':stream(t.reshape(-1),'SCALAR',5125,34963),'material':material,'mode':4});fit.append({'side':label,'controls_y_centerX_centerZ_radiusX_radiusZ_samplecount':controls.tolist()});component.append({'side':label,'vertices':len(p),'triangles':len(t),'signed_volume':float(volume),'world_bounds':[p.min(0).tolist(),p.max(0).tolist()],'weights':'Actual existing Thigh/Shin slots; Thigh blend Y[-.326,-.255,-.20,-.142] -> [0,0,.55,1].'})
 dd['buffers'][0]['byteLength']=len(binary);js=json.dumps(dd,separators=(',',':')).encode();js+=b' '*(-len(js)%4);binary.extend(b'\0'*(-len(binary)%4));raw=struct.pack('<4sII',b'glTF',2,28+len(js)+len(binary))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(binary),0x004e4942)+binary
 output.mkdir(parents=True);target=output/'alexia.glb';target.open('xb').write(raw);mp=output/'rear-leg-cleanup-masks.npz';np.savez_compressed(mp,cold_rear_candidate_indices=np.flatnonzero(coldrear),removed_core_triangle_indices=np.flatnonzero(remove),protected_indices=np.flatnonzero(protected),actual_warm_leg_skin_indices=np.flatnonzero(warm_leg),actual_hand_heavy_indices=np.flatnonzero(handheavy),actual_warm_hand_skin_indices=np.flatnonzero(handskin))
 assert before=={str(p):(sha(p),p.stat().st_mtime_ns) for p in inputs}
 report={'schema':'crwt.alexia_high_visual_rear_leg_shell_trial.v1','source_sha256':sha(source),'baseline_sha256':sha(baseline),'candidate_sha256':sha(target),'semantic_mask_sha256':sha(semantic),'cleanup_mask_sha256':sha(mp),'recipe_sha256':sha(pathlib.Path(__file__)),'passed':True,'visual_accepted':False,'visual_motion_accepted':False,'approved':False,'gameIntegrated':False,'removed_cold_rear_core_triangles':int(remove.sum()),'removed_warm_leg_face_cup_Handskin_incident_triangles':0,'actual_warm_leg_source_rows_protected':int(warm_leg.sum()),'new_closed_calves':component,'fit':fit,'new_skin_material_linear_rgb':skincolor.tolist(),'all_original_arrays_colors_nodes_skins_clips_BIN_prefix_exact':True,'source_warm_front_leg_triangles_and_colors_retained':True,'input_hash_mtime_unchanged':True,'limits':['Slice-fit authored calves are an approximate visual surface, not measured anatomy.','Original warm front skin remains exact; separate new closed calf surfaces intersect for fit and need actual rest/Walk inspection.','No cloth, skin collision, foot IK or production animation claim.']}
 proof=output/'rear-leg-cleanup-proof.json';proof.open('x',encoding='utf-8').write(json.dumps(report,indent=2)+'\n');print(json.dumps({'candidate_path':str(target),'candidate_sha256':sha(target),'proof_sha256':sha(proof),'mask_sha256':sha(mp),'removed':int(remove.sum()),'new_closed_calves':2,'warm_skin_protected':int(warm_leg.sum())},indent=2))
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__)
 for key in ('source','baseline','semantic','output'):p.add_argument('--'+key,type=pathlib.Path,required=True)
 a=p.parse_args();build(a.source.resolve(strict=True),a.baseline.resolve(strict=True),a.semantic.resolve(strict=True),a.output.resolve())

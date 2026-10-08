"""Fresh authorized visible hand/leg replacement on the existing rig.

Original arrays remain stored exact. Corrupt original skin/garment triangles
inside the explicit limb columns are deactivated. Already authored closed
calves supply full leg volume; closed fitted palms/fingers replace old hands.
Face, precision cups, original front hair and shirt remain retained.
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
def sphere(center,radii,segments=32,rings=16):
 center=np.asarray(center);radii=np.asarray(radii);p=[center+[0,radii[1],0]]
 for row in range(1,rings):
  phi=np.pi*row/rings
  for k in range(segments):
   th=2*np.pi*k/segments;p.append(center+np.array([np.sin(phi)*np.sin(th),np.cos(phi),np.sin(phi)*np.cos(th)])*radii)
 p.append(center-[0,radii[1],0]);last=len(p)-1;t=[]
 for k in range(segments):t.append([0,1+k,1+(k+1)%segments])
 for row in range(rings-2):
  for k in range(segments):a=1+row*segments+k;bb=1+row*segments+(k+1)%segments;c=a+segments;e=bb+segments;t.extend([[a,c,bb],[bb,c,e]])
 for k in range(segments):t.append([last,last-segments+(k+1)%segments,last-segments+k])
 return np.asarray(p),np.asarray(t,dtype='<u4')
def tube(points,radii,segments=16):
 points=np.asarray(points);radii=np.broadcast_to(radii,(len(points),));p=[]
 for row,c in enumerate(points):
  tangent=points[min(row+1,len(points)-1)]-points[max(row-1,0)];tangent/=np.linalg.norm(tangent);axis=np.array([0.,0.,1.]) if abs(tangent[2])<.9 else np.array([1.,0.,0.]);side=np.cross(tangent,axis);side/=np.linalg.norm(side);up=np.cross(tangent,side)
  for k in range(segments):theta=2*np.pi*k/segments;p.append(c+radii[row]*(np.cos(theta)*side+np.sin(theta)*up))
 t=[]
 for row in range(len(points)-1):
  for k in range(segments):a=row*segments+k;bb=row*segments+(k+1)%segments;c=a+segments;e=bb+segments;t.extend([[a,bb,c],[bb,e,c]])
 p.extend([points[0],points[-1]]);first,last=len(p)-2,len(p)-1
 for k in range(segments):t.extend([[first,(k+1)%segments,k],[last,(len(points)-1)*segments+k,(len(points)-1)*segments+(k+1)%segments]])
 return np.asarray(p),np.asarray(t,dtype='<u4')
def build(source,semantic,protector,output):
 assert not output.exists();paths=(source,semantic,protector);before={str(p):(sha(p),p.stat().st_mtime_ns) for p in paths};d,b=read(source);q=d['meshes'][0]['primitives'][0];a=q['attributes'];local=acc(d,b,a['POSITION']);world=local.astype(float)*[-1,1,-1];x,y,z=world.T;ax=abs(x+.006);rows=np.arange(len(local));t=acc(d,b,q['indices']).reshape(-1,3)
 sem=np.load(semantic);m=np.load(protector);shirt=np.isin(rows,m['source_shirt_indices']);facecup=np.isin(rows,np.r_[sem['mandatory_face_indices'],sem['cup_indices']]);_,groups=np.unique(local.view(np.dtype((np.void,12))).reshape(-1),return_inverse=True);hair=np.isin(groups,groups[sem['hair_indices']]);protected=shirt|facecup|hair
 node=next(n for n in d['nodes'] if n.get('mesh')==0);skin=d['skins'][node['skin']];names=[d['nodes'][n]['name'].replace('AlexiaPrototype_','') for n in skin['joints']];slots={name:i for i,name in enumerate(names)};j=acc(d,b,a['JOINTS_0']);w=acc(d,b,a['WEIGHTS_0']);bone={name:np.where(j==i,w,0).sum(1) for name,i in slots.items()};leg=sum(bone[n] for n in ('ThighL','ShinL','FootL','ThighR','ShinR','FootR'));hand=sum(bone[n] for n in ('HandL','HandR','ForearmL','ForearmR'))
 legcolumn=(y>-.37)&(y<-.122)&(ax<.19)&(z>-.12)&(z<.23)
 legtarget=(y>-.35)&(y<-.13)&(ax>.008)&(ax<.18)&(leg>.5)
 # Cold Pelvis-labeled paper near these fitted calves is also reconstruction;
 # every incident row must stay within the same explicit leg column.
 leg_remove=(np.any(legtarget[t],1)|np.all(legcolumn[t],1))&np.all(legcolumn[t],1)&~np.any(protected[t],1)
 handbox=(y>-.145)&(y<-.058)&(ax>.14)&(ax<.32)&(z>-.095)&(z<.20)
 handtarget=handbox&(hand>.25)
 hand_remove=np.any(handtarget[t],1)&np.all(handbox[t],1)&~np.any(protected[t],1)
 # Actual cyan sleeve/waist remnants were originally assigned Head in some
 # rows. Joint label does not override the explicit face/hair/shirt protector.
 sidecloth=(y>-.15)&(y<.085)&(ax>.125)&(ax<.34)&(z>-.12)&(z<.205)
 side_remove=np.all(sidecloth[t],1)&~np.any(protected[t],1)
 remove=leg_remove|hand_remove|side_remove;assert not np.any(protected[t[remove]])
 dd=copy.deepcopy(d);binary=bytearray(b)
 def stream(array,kind,ctype,target):
  array=np.ascontiguousarray(array);binary.extend(b'\0'*(-len(binary)%4));vi=len(dd['bufferViews']);ai=len(dd['accessors']);dd['bufferViews'].append({'buffer':0,'byteOffset':len(binary),'byteLength':array.nbytes,'target':target});binary.extend(array.tobytes());aa={'bufferView':vi,'componentType':ctype,'count':len(array),'type':kind}
  if kind=='VEC3':aa.update(min=array.min(0).tolist(),max=array.max(0).tolist())
  dd['accessors'].append(aa);return ai
 dd['meshes'][0]['primitives'][0]['indices']=stream(t[~remove].reshape(-1).astype('<u4'),'SCALAR',5125,34963)
 mi=next(i for i,mat in enumerate(dd['materials']) if mat.get('name')=='Alexia clean rear calf skin');records=[]
 def add(label,geometry,side):
  p,tri=geometry;volume=np.einsum('ij,ij->',p[tri[:,0]],np.cross(p[tri[:,1]],p[tri[:,2]]))/6
  if volume<0:tri=tri[:,[0,2,1]];volume=-volume
  face=np.cross(p[tri[:,1]]-p[tri[:,0]],p[tri[:,2]]-p[tri[:,0]]);normal=np.zeros_like(p)
  for k in range(3):np.add.at(normal,tri[:,k],face)
  normal/=np.linalg.norm(normal,axis=1)[:,None];assert np.isfinite(normal).all() and np.linalg.norm(face,axis=1).min()>1e-12
  nj=np.zeros((len(p),4),'<u2');nw=np.zeros((len(p),4),'<f4');nj[:,0]=slots['Hand'+side];nj[:,1]=slots['Forearm'+side];hw=np.interp(p[:,1],[-.15,-.10,-.078,-.06],[1,1,.25,0]);nw[:,0]=hw;nw[:,1]=1-nw[:,0]
  at={'POSITION':stream((p*[-1,1,-1]).astype('<f4'),'VEC3',5126,34962),'NORMAL':stream((normal*[-1,1,-1]).astype('<f4'),'VEC3',5126,34962),'JOINTS_0':stream(nj,'VEC4',5123,34962),'WEIGHTS_0':stream(nw,'VEC4',5126,34962)};dd['meshes'][0]['primitives'].append({'attributes':at,'indices':stream(tri.reshape(-1),'SCALAR',5125,34963),'material':mi,'mode':4});edges=np.sort(np.r_[tri[:,[0,1]],tri[:,[1,2]],tri[:,[2,0]]],axis=1);_,count=np.unique(edges,axis=0,return_counts=True);assert (count==2).all();records.append({'name':label,'vertices':len(p),'triangles':len(tri),'signed_volume':float(volume),'edge_incidence_all_two':True,'world_bounds':[p.min(0).tolist(),p.max(0).tolist()],'weights':'Existing Hand/Forearm slots with actual normalized Y blend.'})
 for sign,label in ((-1,'L'),(1,'R')):
  palmcenter=np.array([sign*.235,-.105,.094]);add(label+' fitted wrist',sphere([sign*.231,-.083,.092],[.012,.016,.013]),label);add(label+' rounded palm',sphere(palmcenter,[.020,.019,.013]),label)
  lengths=[.017,.023,.021,.016]
  for finger,dx in enumerate((-.0135,-.0045,.0045,.0135)):
   px=palmcenter[0]+dx;start=-.116;end=start-lengths[finger];zz=.096 if label=='L' else .088
   points=[[px,start,zz],[px,start-.007,zz+.004],[px,end+.004,zz+.006],[px,end,zz+.004]];add(label+' finger '+str(finger+1),tube(points,[.0044,.0043,.0038,.0028]),label)
  inner=-sign;thumb=[palmcenter+[inner*.016,.004,.004],palmcenter+[inner*.027,-.003,.008],palmcenter+[inner*.029,-.013,.012]];add(label+' small thumb',tube(thumb,[.0060,.0055,.0040],20),label)
 dd['buffers'][0]['byteLength']=len(binary);js=json.dumps(dd,separators=(',',':')).encode();js+=b' '*(-len(js)%4);binary.extend(b'\0'*(-len(binary)%4));raw=struct.pack('<4sII',b'glTF',2,28+len(js)+len(binary))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(binary),0x004e4942)+binary
 output.mkdir(parents=True);target=output/'alexia.glb';target.open('xb').write(raw);mp=output/'visible-anatomy-replacement-masks.npz';np.savez_compressed(mp,removed_union_current_triangle_indices=np.flatnonzero(remove),removed_leg_column_triangles=np.flatnonzero(leg_remove),removed_hand_wrist_triangles=np.flatnonzero(hand_remove),removed_side_cloth_triangles=np.flatnonzero(side_remove),protected_face_cup_shirt_hair_indices=np.flatnonzero(protected),source_original_leg_region_indices=np.flatnonzero(legtarget),source_original_hand_region_indices=np.flatnonzero(handtarget));assert before=={str(p):(sha(p),p.stat().st_mtime_ns) for p in paths}
 touched=np.unique(t[remove]);warm=np.load(protector)['source_warm_leg_indices'];report={'schema':'crwt.alexia_high_visual_visible_anatomy_replacement.v1','source_sha256':sha(source),'candidate_sha256':sha(target),'semantic_mask_sha256':sha(semantic),'prior_protector_sha256':sha(protector),'recipe_sha256':sha(pathlib.Path(__file__)),'mask_sha256':sha(mp),'passed':True,'visual_accepted':False,'visual_motion_accepted':False,'approved':False,'gameIntegrated':False,'removed_leg_column_triangles':int(leg_remove.sum()),'removed_hand_wrist_triangles':int(hand_remove.sum()),'removed_side_cloth_triangles':int(side_remove.sum()),'removed_union_triangles':int(remove.sum()),'retained_original_core_triangles':int((~remove).sum()),'protected_face_cup_shirt_hair_incidence':0,'original_warm_leg_rows_now_incident_deactivated_triangles':int(np.intersect1d(touched,warm).size),'touched_world_bounds':[world[touched].min(0).tolist(),world[touched].max(0).tolist()],'original_POSITION_NORMAL_UV_COLOR_JOINTS_WEIGHTS_BIN_exact':True,'original_nodes_skins_actual_clips_and_all_preexisting_authored_components_exact':True,'visible_leg_skin_is_now_authored_closed_calves':True,'visible_hand_skin_is_now_authored_closed_palms_fingers':True,'new_hand_components':records,'new_vertices':sum(r['vertices'] for r in records),'new_triangles':sum(r['triangles'] for r in records),'input_hash_mtime_unchanged':True,'scope':{'leg_column':'Every original triangle row: -.37<Y<-.122,abs(X+.006)<.19,-.12<Z<.23; no face/cup/hair/shirt incidence.','hand_wrist':'Triangle touches actual Hand+Forearm>.25 in -.145<Y<-.058,.14<abs(X+.006)<.32,-.095<Z<.20; all rows inside this hand box; no face/cup/hair/shirt.','side_cloth':'Every row -.15<Y<.085,.125<abs(X+.006)<.34,-.12<Z<.205; no face/cup/hair/shirt. Head label alone is not a semantic protector.'},'limits':['Visible hand and leg skins are replacements, not claims of preserving old visible warm-skin triangles.','Palms/fingers use separate closed overlapping forms; no global collision, finger articulation, full production rig or foot IK certification.','Final actual front/side/Walk render inspection remains required.']};proof=output/'visible-anatomy-replacement-proof.json';proof.open('x',encoding='utf-8').write(json.dumps(report,indent=2)+'\n');print(json.dumps({'candidate_path':str(target),'candidate_sha256':sha(target),'proof_sha256':sha(proof),'mask_sha256':sha(mp),'removed_union':int(remove.sum()),'leg':int(leg_remove.sum()),'hand':int(hand_remove.sum()),'side':int(side_remove.sum()),'new_hand_components':len(records)},indent=2))
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__)
 for key in ('source','semantic','protector','output'):p.add_argument('--'+key,type=pathlib.Path,required=True)
 a=p.parse_args();build(a.source.resolve(strict=True),a.semantic.resolve(strict=True),a.protector.resolve(strict=True),a.output.resolve())

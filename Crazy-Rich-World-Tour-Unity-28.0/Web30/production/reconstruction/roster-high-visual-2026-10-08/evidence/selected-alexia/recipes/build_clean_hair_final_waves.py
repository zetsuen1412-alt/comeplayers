"""Author a closed lit scalp and broad rounded S sheets, preserving front identity.

Direct from frozen e18. Remove only original triangles whose three vertex rows
are in the accepted 99,032-row semantic hair set. Mixed/protected triangles and
all original vertex streams are retained. Old added hair draws are deactivated,
not overwritten. Original 19-joint skins and IdleBreath/Walk bytes are untouched.
Reference-supported manual volume design; no image planes, raster editing or
claim of precise six-view reconstruction. NumPy is the only dependency.
"""
import argparse,collections,copy,hashlib,json,math,pathlib,struct
import numpy as np

SOURCE_PIN='e18cc26d9662d5ec615fa636150b5f4eddaab9c8ca4c2b3b1ea702bf1d50efca'
MASK_PIN='10618a926e013a8a8f9f8d932412f17170197bba2cecd3217c838bdc02ba3649'
REFERENCE_PIN='935b1f8f7d2be4a6a453a089041844f2cd4470eb64be17d9d72568efb3708933'
BOUNDARY_PIN='b267a0531dcd5f1644f2df62bfea9f677eff64a6abd5bce94f0f420811376629'
ORPHAN_PIN='ded53028e73e702840adb0d50a353d5ba47d3e5039d92db8c136bd6f4218c1fd'
AXES=np.array([-1.,1.,-1.]);CAP_CENTER=np.array([-.006,.302,-.055]);CAP_RADII=np.array([.204,.182,.113])
VARIANTS={'crown-waves':{'half_depth':.0095,'width_scale':1.,'roughness':.60,'back_count':6,'side_count':3,'color_gamma':[.825,.752,.925]}}
sha=lambda b:hashlib.sha256(b).hexdigest()
def need(ok,msg):
 if not ok:raise ValueError(msg)
def read_glb(raw):
 need(struct.unpack_from('<4sII',raw)==(b'glTF',2,len(raw)),'GLB header')
 n,k=struct.unpack_from('<II',raw,12);need(k==0x4e4f534a,'JSON chunk')
 nb,k=struct.unpack_from('<II',raw,20+n);need(k==0x004e4942 and 28+n+nb==len(raw),'BIN chunk')
 return json.loads(raw[20:20+n]),raw[28+n:]
def get(d,b,i):
 a=d['accessors'][i];v=d['bufferViews'][a['bufferView']];w={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
 need('byteStride' not in v and 'sparse' not in a,'Packed original accessor')
 return np.frombuffer(b,dtype={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']],count=a['count']*w,offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,w)
def smooth(a,b,x):
 t=np.clip((np.asarray(x)-a)/(b-a),0,1);return t*t*(3-2*t)
def unit(v):return v/np.maximum(np.linalg.norm(v,axis=-1,keepdims=True),1e-30)
def linear(v):return np.where(v<=.04045,v/12.92,((v+.055)/1.055)**2.4)
def append(d,b,ar,target,ctype=5126):
 while len(b)%4:b.append(0)
 ar=np.asarray(ar,dtype={5126:'<f4',5125:'<u4',5123:'<u2'}[ctype]);width=ar.shape[1] if ar.ndim>1 else 1
 off=len(b);raw=ar.tobytes();b.extend(raw);vi=len(d['bufferViews']);d['bufferViews'].append({'buffer':0,'byteOffset':off,'byteLength':len(raw),'target':target})
 ai=len(d['accessors']);a={'bufferView':vi,'componentType':ctype,'count':len(ar),'type':{1:'SCALAR',2:'VEC2',3:'VEC3',4:'VEC4'}[width]}
 if width==3 and ctype==5126:a.update(min=ar.min(0).astype(float).tolist(),max=ar.max(0).astype(float).tolist())
 d['accessors'].append(a);return ai
def catmull(points,t):
 n=len(points)-1;k=min(n-1,int(t*n));u=t*n-k;a=points[max(0,k-1)];b=points[k];c=points[k+1];d=points[min(n,k+2)]
 return .5*(2*b+(-a+c)*u+(2*a-5*b+4*c-d)*u*u+(-a+3*b-3*c+d)*u*u*u)
def bspline(points,t):
 # Uniform cubic B-spline: C2 curvature rather than visible Catmull knot creases.
 cp=np.concatenate((points[[0,0]],points,points[[-1,-1]]));segments=len(cp)-3
 v=t*segments;k=min(segments-1,int(v));u=v-k
 basis=np.array([(1-u)**3,3*u**3-6*u*u+4,-3*u**3+3*u*u+3*u+1,u**3])/6
 return np.sum(cp[k:k+4]*basis[:,None],axis=0)
def finish(pos,faces,name,normal=None,uv=None):
 pos=np.asarray(pos,dtype='<f4').astype(float);faces=np.asarray(faces,dtype='<u4')
 volume=float(np.sum(np.einsum('ij,ij->i',pos[faces[:,0]],np.cross(pos[faces[:,1]],pos[faces[:,2]])))/6)
 if volume<0:faces=faces[:,[0,2,1]];volume=-volume
 fc=np.cross(pos[faces[:,1]]-pos[faces[:,0]],pos[faces[:,2]]-pos[faces[:,0]]);area=np.linalg.norm(fc,axis=1)*.5
 if normal is None:
  normal=np.zeros_like(pos)
  for k in range(3):np.add.at(normal,faces[:,k],fc)
 normal=unit(normal);edges=collections.Counter();directed=collections.Counter()
 for a,b,c in faces.tolist():
  for u,v in [(a,b),(b,c),(c,a)]:edges[tuple(sorted((u,v)))]+=1;directed[(u,v)]+=1
 need(set(edges.values())=={2} and all(directed[(u,v)]==directed[(v,u)]==1 for u,v in edges),'Closed manifold '+name)
 bad=int((np.einsum('ij,ij->i',fc,normal[faces].mean(1))<=0).sum())
 need(area.min()>1e-12 and volume>1e-7 and bad==0,'Finite positive faces '+name+' '+str(bad))
 need(np.isfinite(pos).all() and np.isfinite(normal).all(),'Finite geometry')
 if uv is None:uv=np.zeros((len(pos),2))
 report={'name':name,'vertices':len(pos),'triangles':len(faces),'world_bounds':[pos.min(0).tolist(),pos.max(0).tolist()],'minimum_triangle_area':float(area.min()),'signed_enclosed_volume':volume,'closed_edge_incidence_histogram':dict(collections.Counter(edges.values())),'face_vs_mean_normal_disagreements':bad}
 return pos,normal,np.asarray(uv,dtype='<f4'),faces,report
def cap():
 bands=36;radial=80;pos=[];uv=[]
 for j in range(1,bands):
  phi=math.pi*j/bands
  for k in range(radial):
   th=2*math.pi*k/radial;v=np.array([math.sin(phi)*math.cos(th),math.cos(phi),math.sin(phi)*math.sin(th)])
   # Broad shallow crown channels continue into the sheets; no bald sphere.
   backfade=smooth(.05,-.35,v[2]);rib=.025*math.cos(5*th+1.3*math.sin(phi))*math.sin(phi)**2*backfade
   pos.append(CAP_CENTER+CAP_RADII*v*(1+rib));uv.append([k/radial,j/bands])
 top=len(pos);bottom=top+1;pos.extend([CAP_CENTER+[0,CAP_RADII[1],0],CAP_CENTER-[0,CAP_RADII[1],0]]);uv.extend([[.5,0],[.5,1]])
 faces=[]
 for j in range(bands-2):
  for k in range(radial):
   a=j*radial+k;b=j*radial+(k+1)%radial;c=(j+1)*radial+k;d=(j+1)*radial+(k+1)%radial;faces.extend([[a,b,c],[b,d,c]])
 for k in range(radial):faces.extend([[top,(k+1)%radial,k],[bottom,(bands-2)*radial+k,(bands-2)*radial+(k+1)%radial]])
 return finish(pos,faces,'closed softly fluted crown',uv=uv)
def guides(spec):
 result=[];back_count=spec['back_count'];base=np.linspace(-.188,.188,back_count)
 for i,xbase in enumerate(base):
  side=-1 if xbase<0 else 1;phase=.2+i*.88
  ys=np.array([.476,.451,.411,.357,.294,.228,.161,.092,.027,-.037,-.068,-.091])
  endshift=[-.020,.012,-.003,.026,.003,-.008][i];ys[-3:]+=endshift
  ts=np.linspace(0,1,len(ys));xs=xbase*(.08+1.02*smooth(0,.48,ts))+.047*np.sin(2*math.pi*ts+phase)*smooth(.10,.46,ts)
  xs[-2]+=.027*side;xs[-1]-=.017*side
  zs=np.array([-.055,-.092,-.140,-.166,-.181,-.188,-.196,-.202,-.188,-.165,-.143,-.155])+.024*(abs(xbase)/.188)*smooth(.16,.45,ts)
  zs+=.008*np.sin(2*math.pi*ts+phase)*smooth(.10,.35,ts)
  # Depth direction varies continuously across the rear mantle.
  depth=np.array([xbase/.188*.35,0,-1.]);depth=depth/np.linalg.norm(depth)
  result.append({'name':'rear-wave-%02d'%i,'points':np.column_stack((xs-.006,ys,zs)),'width':.049 if abs(xbase)>.10 else .052,'depth_axis':depth,'phase':phase})
 for side in [-1,1]:
  for i in range(spec['side_count']):
   zshift=-.036*i;ys=np.array([.471,.448,.415,.367,.308,.246,.182,.117,.052,-.010,-.065,-.091]);ys[-3:]+=[-.014,.005,.025][i]
   xs=np.array([.047,.094,.145,.196,.218,.230,.245,.261,.265,.251,.232,.248])+.002*i
   zs=np.array([-.007,-.009,-.020,-.026,-.046,-.065,-.055,-.025,-.036,-.070,-.079,-.056])+zshift*smooth(0,.32,np.linspace(0,1,len(ys)))
   if side>0:zs-=.006*np.sin(np.linspace(0,math.pi,len(zs)));ys+=.005*np.sin(np.linspace(0,math.pi,len(ys)))
   result.append({'name':'side-wave-%s-%d'%('plus' if side>0 else 'minus',i),'points':np.column_stack((-.006+side*xs,ys,zs)),'width':.047+.002*i,'depth_axis':np.array([side,0,0.]),'phase':i+.3})
 # Two large varied shoulder waves per side break the straight drape into a
 # flared S silhouette. Broad round sheets, shallow radial relief, hooked ends.
 for side in [-1,1]:
  outer=[
   [[.163,.408,-.050],[.204,.349,-.090],[.240,.283,-.143],[.265,.211,-.199],[.279,.137,-.231],[.283,.075,-.202],[.263,.019,-.165],[.232,-.029,-.160],[.232,-.065,-.190],[.249,-.073,-.211]],
   [[.159,.414,-.014],[.206,.351,-.023],[.240,.280,-.043],[.266,.208,-.037],[.284,.137,-.002],[.287,.076,-.012],[.268,.025,-.044],[.239,-.021,-.079],[.231,-.050,-.111],[.249,-.057,-.127]]]
  for i,points in enumerate(outer):
   cp=np.asarray(points,float)
   crown=np.asarray([[.046,.475,-.027 if i==0 else -.005],[.104,.449,-.038 if i==0 else -.013]])
   cp=np.concatenate((crown,cp));cp[:,0]=-.006+side*cp[:,0]
   if side>0:cp[:,1]+=.005*np.sin(np.linspace(0,math.pi,len(cp)));cp[:,2]-=.005
   result.append({'name':'flared-outer-curl-%s-%d'%('plus' if side>0 else 'minus',i),'points':cp,'width':.043 if i==0 else .040,'depth_axis':np.array([side,0.,0.]),'phase':i})
 return result
def sheet(guide,spec):
 count=145;radial=24;t=np.linspace(0,1,count);centers=np.array([bspline(guide['points'],v) for v in t]);tang=unit(np.gradient(centers,axis=0))
 depth=np.tile(guide['depth_axis'],(count,1));depth=unit(depth-tang*np.sum(depth*tang,axis=1)[:,None]);width=unit(np.cross(tang,depth))
 taper=(.095+.905*smooth(0,.29,t))*(1-.980*smooth(.72,1,t));hw=guide['width']*spec['width_scale']*taper;hd=spec['half_depth']*taper
 # Broad rounded sheets remain smooth through the hooked taper, avoiding folds.
 ds=np.maximum(np.linalg.norm(np.gradient(centers,axis=0),axis=1),1e-8);curv=np.gradient(tang,axis=0)/ds[:,None]
 risk=hw*np.abs(np.sum(curv*width,axis=1))+hd*np.abs(np.sum(curv*depth,axis=1));scale=np.minimum(1,.62/np.maximum(risk,1e-9))
 for _ in range(3):
  nb=np.minimum(np.roll(scale,1),np.roll(scale,-1));nb[[0,-1]]=scale[[0,-1]];scale=np.minimum(scale,.6*scale+.4*nb)
 hw*=scale;hd*=scale;pos=[];uv=[]
 for j in range(count):
  for k in range(radial):
   th=2*math.pi*k/radial;pos.append(centers[j]+width[j]*(hw[j]*math.cos(th))+depth[j]*(hd[j]*math.sin(th)));uv.append([k/radial,t[j]])
 root=len(pos);tip=root+1;pos.extend(centers[[0,-1]]);uv.extend([[.5,0],[.5,1]]);faces=[]
 for j in range(count-1):
  for k in range(radial):
   a=j*radial+k;b=j*radial+(k+1)%radial;c=(j+1)*radial+k;d=(j+1)*radial+(k+1)%radial;faces.extend([[a,b,c],[b,d,c]])
 for k in range(radial):faces.extend([[root,(k+1)%radial,k],[tip,(count-1)*radial+k,(count-1)*radial+(k+1)%radial]])
 p,n,u,f,r=finish(pos,faces,guide['name'],uv=uv);r.update(manual_world_guides=guide['points'].tolist(),maximum_width=float(2*hw.max()),maximum_depth=float(2*hd.max()),curvature_section_minimum_scale=float(scale.min()),root_tip_radius_small_and_closed=True)
 return p,n,u,f,r
def colors(p,n,spec,is_cap):
 # Real PBR does the shading. A very low-frequency lavender tint avoids a
 # uniform plastic gray and does not duplicate harsh baked light or raster noise.
 base=np.asarray(spec['color_gamma']);t=smooth(-.11,.46,p[:,1]);tint=.012*(t-.5)+.008*n[:,1]
 if is_cap:tint-=.008
 rgb=np.clip(base+tint[:,None]*np.array([1,1,1]),0,1)
 return np.column_stack((linear(rgb),np.ones(len(p)))).astype('<f4')
def primitive(d,b,geometry,material,head):
 p,n,uv,c,f=geometry;j=np.zeros((len(p),4),dtype='<u2');j[:,0]=head;w=np.zeros((len(p),4),dtype='<f4');w[:,0]=1
 attrs={'POSITION':append(d,b,p*AXES,34962),'NORMAL':append(d,b,n*AXES,34962),'TEXCOORD_0':append(d,b,uv,34962),'COLOR_0':append(d,b,c,34962),'JOINTS_0':append(d,b,j,34962,5123),'WEIGHTS_0':append(d,b,w,34962)}
 return {'attributes':attrs,'indices':append(d,b,f.reshape(-1),34963,5125),'material':material,'mode':4}
def main():
 ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--source',type=pathlib.Path,required=True);ap.add_argument('--semantic-mask',type=pathlib.Path,required=True);ap.add_argument('--reference',type=pathlib.Path,required=True);ap.add_argument('--boundary-mask',type=pathlib.Path,required=True);ap.add_argument('--orphan-mask',type=pathlib.Path,required=True);ap.add_argument('--output-parent',type=pathlib.Path,required=True);ap.add_argument('--variant',choices=list(VARIANTS),required=True);a=ap.parse_args()
 src=a.source.resolve();mp=a.semantic_mask.resolve();ref=a.reference.resolve();out=a.output_parent.resolve()/a.variant;need(not out.exists(),'Fresh output required')
 raw=src.read_bytes();maskraw=mp.read_bytes();need(sha(raw)==SOURCE_PIN and sha(maskraw)==MASK_PIN and sha(ref.read_bytes())==REFERENCE_PIN,'Pinned read-only inputs')
 original,oldbin=read_glb(raw);core=original['meshes'][0]['primitives'][0];p=get(original,oldbin,core['attributes']['POSITION']);indices=get(original,oldbin,core['indices']).reshape(-1,3);sm=np.load(mp)
 hair=np.zeros(len(p),bool);hair[sm['hair_indices']]=True;remove=hair[indices].all(1);keep=~remove;need(remove.sum()==171028,'Pure semantic hair deletion count')
 protected=np.zeros(len(p),bool)
 for key in ['mandatory_face_indices','hands_indices','cup_indices','cuff_indices','protected_critical_indices']:protected[sm[key]]=True
 need(not protected[indices[remove]].any(),'No protected triangle deletion');need(not np.intersect1d(np.flatnonzero(hair),sm['jacket_indices']).size,'Source hair versus jacket label disjoint')
 headnode=next(i for i,n in enumerate(original['nodes']) if n.get('name')=='AlexiaPrototype_Head');head=original['skins'][0]['joints'].index(headnode);need(head==5,'Actual Head slot')
 bp=a.boundary_mask.resolve();need(sha(bp.read_bytes())==BOUNDARY_PIN,'Frozen independently derived boundary mask');boundary=np.load(bp);extra=boundary['additional_mixed_triangle_indices'];need(len(extra)==1786,'Boundary expansion count')
 touched=np.unique(indices[extra]);need(not protected[touched].any(),'Expanded removal protected rows exact')
 jo=get(original,oldbin,core['attributes']['JOINTS_0']);we=get(original,oldbin,core['attributes']['WEIGHTS_0']);need(np.all(np.sum(we[touched]*(jo[touched]==head),axis=1)==1),'Expanded boundary rows actual Head1')
 need(not remove[extra].any(),'Boundary removal is additional');remove[extra]=True;keep=~remove
 op=a.orphan_mask.resolve();need(sha(op.read_bytes())==ORPHAN_PIN,'Frozen independently derived orphan mask');orphan=np.load(op)['additional_outer_head1_triangle_indices'];need(len(orphan)==8491 and not remove[orphan].any(),'Additional orphan count and partition')
 ot=np.unique(indices[orphan]);need(not protected[ot].any(),'Orphan removal excludes protected source rows');need(np.all(np.sum(we[ot]*(jo[ot]==head),axis=1)==1),'Orphan rows actual Head1');remove[orphan]=True;keep=~remove;need(remove.sum()==181305,'Authorized total removal')
 d=copy.deepcopy(original);b=bytearray(oldbin);new_index=append(d,b,indices[keep].reshape(-1),34963,5125);d['meshes'][0]['primitives']=[copy.deepcopy(core)];d['meshes'][0]['primitives'][0]['indices']=new_index
 # Node4 is the older non-skeleton rear-lock drawable. Deactivate it in scene,
 # retaining the node/mesh/data byte prefix and all skeleton ancestry/targets.
 need(original['nodes'][4].get('mesh')==2 and 4 not in set().union(*(set(s['joints']) for s in original['skins'])),'Old rear locks are not a joint')
 need(all(ch['target']['node']!=4 for an in original['animations'] for ch in an['channels']),'Old rear locks not animated independently')
 need(original['nodes'][0]['children']==[1,4],'Original drawable parent');d['nodes'][0]['children']=[1]
 spec=VARIANTS[a.variant];components=[];geometry=[];capdata=cap();components.append(capdata[-1]);cp,cn,cu,cf,_=capdata;geometry.append((cp,cn,cu,colors(cp,cn,spec,True),cf))
 material=len(d['materials']);d['materials'].append({'name':'Alexia authored rounded lavender scalp and S sheets '+a.variant,'pbrMetallicRoughness':{'baseColorFactor':[1,1,1,1],'metallicFactor':0,'roughnessFactor':spec['roughness']},'doubleSided':False})
 allp=[];alln=[];allu=[];allc=[];allf=[];offset=0
 for guide in guides(spec):
  q,n,u,f,r=sheet(guide,spec);components.append(r);geometry.append((q,n,u,colors(q,n,spec,False),f))
 for q,n,u,c,f in geometry:allp.append(q);alln.append(n);allu.append(u);allc.append(c);allf.append(f+offset);offset+=len(q)
 pp=np.concatenate(allp);nn=np.concatenate(alln);uu=np.concatenate(allu);cc=np.concatenate(allc);ff=np.concatenate(allf)
 d['meshes'][0]['primitives'].append(primitive(d,b,(pp,nn,uu,cc,ff),material,head));d['buffers'][0]['byteLength']=len(b)
 need(b[:len(oldbin)]==oldbin and d['accessors'][:len(original['accessors'])]==original['accessors'] and d['bufferViews'][:len(original['bufferViews'])]==original['bufferViews'],'Original BIN and records retained')
 for key in original:
  if key not in ['meshes','nodes','accessors','bufferViews','materials','buffers']:need(d[key]==original[key],'Original document exact '+key)
 need(d['nodes'][1:]==original['nodes'][1:] and d['materials'][:-1]==original['materials'] and d['meshes'][1:]==original['meshes'][1:],'Old rigs transforms materials cup mesh and old rear mesh stored exact')
 js=json.dumps(d,separators=(',',':')).encode();js+=b' '*((-len(js))%4);b+=b'\0'*((-len(b))%4);result=struct.pack('<4sII',b'glTF',2,28+len(js)+len(b))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(b),0x004e4942)+b
 out.mkdir(parents=True);glbout=out/'alexia.glb';glbout.write_bytes(result)
 npz=out/'replacement-masks.npz';np.savez_compressed(npz,semantic_hair_indices=sm['hair_indices'],removed_original_triangle_indices=np.flatnonzero(remove),retained_original_triangle_indices=np.flatnonzero(keep),protected_critical_indices=sm['protected_critical_indices'],mandatory_face_indices=sm['mandatory_face_indices'],hands_indices=sm['hands_indices'],cup_indices=sm['cup_indices'])
 crown={'center_world':CAP_CENTER.tolist(),'radii_world':CAP_RADII.tolist(),'crown_y_at_x':[{'world_x':float(x),'world_z':float(CAP_CENTER[2]),'world_y':float(CAP_CENTER[1]+CAP_RADII[1]*math.sqrt(max(0,1-((x-CAP_CENTER[0])/CAP_RADII[0])**2)))}for x in np.linspace(CAP_CENTER[0]-CAP_RADII[0],CAP_CENTER[0]+CAP_RADII[0],81)],'ellipsoid_equation':'sum(((world_position-center_world)/radii_world)^2)=1','root_attachment':'Broad sheets intersect closed cap intentionally; root points in component manual_world_guides.'}
 (out/'scalp-crown-profile.json').write_text(json.dumps(crown,indent=2)+'\n',encoding='utf-8')
 proof={'schema':'crwt.alexia.clean_replacement_hair.v1','passed':True,'visual_accepted':False,'approved':False,'gameIntegrated':False,'variant':a.variant,'source_path':str(src),'source_sha256':SOURCE_PIN,'semantic_mask_path':str(mp),'semantic_mask_sha256':MASK_PIN,'reference_path':str(ref),'reference_sha256':REFERENCE_PIN,'recipe_sha256':sha(pathlib.Path(__file__).read_bytes()),'candidate_path':str(glbout),'candidate_sha256':sha(result),'candidate_bytes':len(result),'mask_npz_path':str(npz),'mask_npz_sha256':sha(npz.read_bytes()),'original_BIN_byte_prefix_identical':True,'original_accessor_bufferView_material_prefix_identical':True,'all_original_vertex_streams_exact':True,'original_POSITION_NORMAL_UV_COLOR_JOINTS_WEIGHTS_exact':True,'original_skins_animations_images_textures_exact':True,'core_original_triangle_count':len(indices),'core_removed_pure_semantic_hair_triangles':int(remove.sum()),'core_retained_triangle_count':int(keep.sum()),'mandatory_face_hands_cup_cuff_triangles_not_removed':True,'ambiguous_218_closure_extras_not_added_to_delete_mask':True,'old_oct8_six_lock_primitive_deactivated':True,'older_mesh2_rear_lock_node_deactivated':4,'only_old_node_change':{'node':0,'before_children':[1,4],'after_children':[1]},'existing_skeleton_joint_nodes_and_action_targets_exact':True,'new_all_head_rigid_joint_slot':head,'new_vertices':len(pp),'new_triangles':len(ff),'new_closed_components':len(components),'new_material_PBR_lit':True,'new_material_index':material,'new_bounds_world':[pp.min(0).tolist(),pp.max(0).tolist()],'cap':crown,'variant_parameters':spec,'components':components,'limits':['Manual broad volume design follows the reference character, not precise camera reconstruction.','Closed sheets intentionally overlap the closed scalp and each other to integrate the roots; no exhaustive global self-intersection certification.','Mixed source semantic boundary triangles remain and may need actual-view cleanup.','Existing unlit face/fringe/body and precision cup materials remain; their material transition must be judged in actual colored views.','This is an aesthetic working candidate, not selected or production-integrated.']}
 proof.update(schema='crwt.alexia.clean_replacement_hair.v3_boundary_clean',boundary_mask_path=str(bp),boundary_mask_sha256=BOUNDARY_PIN,additional_mixed_boundary_triangles_removed=len(extra),total_original_triangles_removed=int(remove.sum()),core_removed_pure_semantic_hair_triangles=171028,expanded_removal_protected_incidence=0,expanded_removal_all_actual_Head1=True)
 proof.update(schema='crwt.alexia.clean_replacement_hair.v5_c2_final_waves',orphan_mask_path=str(op),orphan_mask_sha256=ORPHAN_PIN,additional_outer_Head1_triangles_removed=len(orphan),all_removed_source_triangles=181305,retained_ambiguous_nonHead_triangles=True,guide_interpolation='Uniform cubic C2 B-spline with duplicated endpoint controls; manual guides approximate broad flow, not exact interpolation.',outer_curl_roots_extend_to_crown=True)
 (out/'geometry-proof.json').write_text(json.dumps(proof,indent=2)+'\n',encoding='utf-8')
 need(sha(src.read_bytes())==SOURCE_PIN and sha(mp.read_bytes())==MASK_PIN and sha(ref.read_bytes())==REFERENCE_PIN,'Original inputs preserved')
 print(json.dumps({k:proof[k] for k in ['variant','candidate_path','candidate_sha256','candidate_bytes','core_removed_pure_semantic_hair_triangles','new_vertices','new_triangles','new_closed_components','new_bounds_world']}))
if __name__=='__main__':main()

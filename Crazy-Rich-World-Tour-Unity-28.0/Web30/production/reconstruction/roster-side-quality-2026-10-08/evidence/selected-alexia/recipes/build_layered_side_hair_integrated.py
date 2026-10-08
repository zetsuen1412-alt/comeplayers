"""Integrated shallow closed Head-rigid hair crescents, direct from animated6502.

Standalone, NumPy-only portable build. All original geometry, normals, UV,
weights and animation streams remain exact. Only bounded core hair COLOR_0 is
replaced. Narrow embedded roots/tips, curvature-limited smooth oval sections,
and broad unlit lavender lighting keep the genuine volume integrated with the
original unlit hair. This fresh recipe does not import rejected v1 recipes.
Manual reference-supported guides are approximate, never a camera solve.
"""
import argparse, collections, copy, hashlib, json, math, pathlib, struct
import numpy as np

SOURCE_PIN='6502a072d375d6a63fe52a3974027f4d9aa5263709579583775fd85a98a4deb9'
MASK_PIN='10618a926e013a8a8f9f8d932412f17170197bba2cecd3217c838bdc02ba3649'
REF_PIN='935b1f8f7d2be4a6a453a089041844f2cd4470eb64be17d9d72568efb3708933'
AXES=np.array([-1.,1.,-1.])
sha=lambda b:hashlib.sha256(b).hexdigest()

def require(ok,msg):
 if not ok:raise ValueError(msg)

def glb(raw):
 require(struct.unpack_from('<4sII',raw)==(b'glTF',2,len(raw)),'GLB header')
 n,k=struct.unpack_from('<II',raw,12);require(k==0x4e4f534a,'GLB JSON')
 nb,k=struct.unpack_from('<II',raw,20+n);require(k==0x004e4942 and len(raw)==28+n+nb,'GLB BIN')
 return json.loads(raw[20:20+n]),raw[28+n:]

def accessor(d,b,i):
 a=d['accessors'][i];v=d['bufferViews'][a['bufferView']]
 dt={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']]
 w={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
 require('byteStride' not in v and 'sparse' not in a,'Packed original accessors')
 return np.frombuffer(b,dtype=dt,count=a['count']*w,offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(a['count'],w)

def smooth(a,b,x):
 t=np.clip((np.asarray(x)-a)/(b-a),0,1);return t*t*(3-2*t)

def unit(v):return v/np.maximum(np.linalg.norm(v,axis=-1,keepdims=True),1e-30)
def linear(c):return np.where(c<=.04045,c/12.92,((c+.055)/1.055)**2.4)
def gamma(c):return np.where(c<=.0031308,12.92*c,1.055*np.maximum(c,0)**(1/2.4)-.055)

MASK_PARAMETERS={'world_axis_signs':[-1,1,-1],'center_x':-.006,'semantic_hair_mask_key':'hair_indices','y_min':-.075,'y_max':.385,'centered_abs_x_min':.12,'centered_abs_x_max':.29,'z_max':.035,'cup_center_y':.258,'cup_center_z_plus':.092,'cup_center_z_minus':.062,'cup_radius_y':.054,'cup_radius_z':.039,'cup_distance_min':1.4,'source_positions_normals_weights_uv_unchanged':True}

# Y,Z controls, broad independent phases rather than parallel straight cords.
GUIDES=[
 {'name':'front-long-crescent','width':.029,'points':[[.421,.007],[.37,-.005],[.305,-.020],[.225,-.043],[.16,-.036],[.095,-.014],[.035,-.024],[-.028,-.060],[-.072,-.067],[-.089,-.046]]},
 {'name':'middle-tapered-crescent','width':.033,'points':[[.412,-.028],[.365,-.044],[.295,-.070],[.23,-.095],[.16,-.107],[.098,-.084],[.04,-.076],[-.01,-.100],[-.043,-.125],[-.061,-.100]]},
 {'name':'rear-short-crescent','width':.032,'points':[[.403,-.060],[.34,-.089],[.275,-.120],[.21,-.149],[.145,-.178],[.08,-.190],[.02,-.165],[-.026,-.176],[-.065,-.194],[-.082,-.176]]}
]
VARIANTS={'integrated-shallow':{'width_factor':1.,'half_depth':.006,'interior_inset':.0015,'root_tip_inset':.012,'core_trough_strength':.23,'curvature_section_max_product':.52}}

def catmull(points,t):
 n=len(points)-1;v=min(n-1,int(t*n));u=t*n-v
 a=points[max(0,v-1)];b=points[v];c=points[v+1];d=points[min(n,v+2)]
 return .5*(2*b+(-a+c)*u+(2*a-5*b+4*c-d)*u*u+(-a+3*b-3*c+d)*u*u*u)

def hairmask(p,semantic):
 x,y,z=p.T;ax=np.abs(x+.006);cz=np.where(x>-.006,.092,.062)
 cup=np.hypot((z-cz)/.039,(y-.258)/.054)
 mask=np.zeros(len(p),bool);mask[semantic]=True
 return mask&(y>-.075)&(y<.385)&(ax>.12)&(ax<.29)&(z<.035)&(cup>1.4)

def make_lock(side,gi,spec,p,hair):
 guide=GUIDES[gi];count=121;radial=24;t=np.linspace(0,1,count)
 yzctrl=np.asarray(guide['points'],float).copy()
 # Small phase asymmetry follows the two different profile illustrations.
 if side>0:yzctrl[:,1]-=.008*np.sin(np.linspace(0,math.pi,len(yzctrl)));yzctrl[:,0]+=.009*np.sin(np.linspace(0,math.pi,len(yzctrl)))
 yz=np.asarray([catmull(yzctrl,v) for v in t]);hp=p[hair];hp=hp[(hp[:,0]+.006)*side>.06]
 x=[];sample_counts=[];nearest_dist=[]
 for y,z in yz:
  dist=((hp[:,1]-y)/.021)**2+((hp[:,2]-z)/.023)**2
  near=(dist<1);take=hp[near]
  if len(take)<12:
   nearest=np.argsort(dist)[:64];take=hp[nearest]
  sample_counts.append(int(near.sum()));nearest_dist.append(float(np.sqrt(dist.min())))
  x.append(float(np.quantile((take[:,0]+.006)*side,.94)))
 # Surface-fit X is deliberately low-pass filtered over ~35mm, avoiding
 # correspondence to the original coarse triangle/scalp texture noise.
 x=np.asarray(x);kernel=np.exp(-.5*(np.arange(-11,12)/4.5)**2);kernel/=kernel.sum();x=np.convolve(np.pad(x,(11,11),mode='edge'),kernel,'valid')
 endfade=(1-smooth(0,.19,t))+smooth(.77,1,t)
 x-=spec['interior_inset']+spec['root_tip_inset']*endfade
 x=np.maximum(x,.093)
 centers=np.column_stack((-.006+side*x,yz))
 tang=unit(np.gradient(centers,axis=0));depthaxis=np.tile([side,0.,0.],(count,1));depthaxis=unit(depthaxis-tang*np.sum(depthaxis*tang,axis=1)[:,None]);widthaxis=unit(np.cross(tang,depthaxis))
 taper=(.075+.925*smooth(0,.22,t))*(1-.985*smooth(.66,1,t))
 hw=guide['width']*spec['width_factor']*taper;hd=spec['half_depth']*taper
 ds=np.maximum(np.linalg.norm(np.gradient(centers,axis=0),axis=1),1e-8)
 curvature=np.gradient(tang,axis=0)/ds[:,None]
 risk=hw*np.abs(np.sum(curvature*widthaxis,axis=1))+hd*np.abs(np.sum(curvature*depthaxis,axis=1))
 scale=np.minimum(1,spec['curvature_section_max_product']/np.maximum(risk,1e-9))
 # A smooth conservative section bound prevents broad ribbon folds at bends.
 for _ in range(3):
  neighbors=np.minimum(np.roll(scale,1),np.roll(scale,-1));neighbors[0]=scale[0];neighbors[-1]=scale[-1]
  scale=np.minimum(scale,.65*scale+.35*neighbors)
 hw*=scale;hd*=scale
 pos=[];uv=[];sample_t=[];sample_theta=[]
 for j in range(count):
  for k in range(radial):
   a=2*math.pi*k/radial
   pos.append(centers[j]+widthaxis[j]*(hw[j]*math.cos(a))+depthaxis[j]*(hd[j]*math.sin(a)))
   uv.append([k/radial,t[j]]);sample_t.append(t[j]);sample_theta.append(a)
 pos=np.asarray(pos,dtype='<f4').astype(float);uv=np.asarray(uv,dtype='<f4');faces=[]
 for j in range(count-1):
  for k in range(radial):
   a=j*radial+k;b=j*radial+(k+1)%radial;c=(j+1)*radial+k;d=(j+1)*radial+(k+1)%radial;faces.extend([[a,b,c],[b,d,c]])
 root=len(pos);tip=root+1;pos=np.concatenate((pos,centers[[0,-1]].astype('<f4').astype(float)))
 uv=np.concatenate((uv,np.asarray([[.5,0],[.5,1]],dtype='<f4')))
 for k in range(radial):faces.extend([[root,(k+1)%radial,k],[tip,(count-1)*radial+k,(count-1)*radial+(k+1)%radial]])
 faces=np.asarray(faces,dtype='<u4')
 def area_cross():return np.cross(pos[faces[:,1]]-pos[faces[:,0]],pos[faces[:,2]]-pos[faces[:,0]])
 volume=float(np.sum(np.einsum('ij,ij->i',pos[faces[:,0]],np.cross(pos[faces[:,1]],pos[faces[:,2]])))/6)
 if volume<0:faces=faces[:,[0,2,1]];volume=-volume
 fc=area_cross();areas=np.linalg.norm(fc,axis=1)*.5;normals=np.zeros_like(pos)
 for k in range(3):np.add.at(normals,faces[:,k],fc)
 normals=unit(normals);edges=collections.Counter();directed=collections.Counter()
 face_normal_disagreements=int((np.einsum('ij,ij->i',fc,normals[faces].mean(1))<=0).sum())
 for a,b,c in faces.tolist():
  for u,v in [(a,b),(b,c),(c,a)]:edges[tuple(sorted((u,v)))]+=1;directed[(u,v)]+=1
 require(set(edges.values())=={2} and all(directed[(u,v)]==directed[(v,u)]==1 for u,v in edges),'New closed-volume edge manifold')
 require(areas.min()>1e-12 and volume>1e-6,'New volume minimum triangle/volume safety')
 require(np.isfinite(normals).all() and np.max(np.abs(np.linalg.norm(normals,axis=1)-1))<1e-6,'New finite unit normals')
 require(face_normal_disagreements==0,'New face and smooth-normal disagreement')
 # Calm silver/lavender across-section, with purple valleys. Smoothly derived
 # normal lighting is stored as vertex RGB on genuine closed volume, matching
 # the source unlit hair; gray mode exposes its actual geometry and normals.
 outward=np.clip(normals[:,0]*side,0,1);crest=outward**.7
 v=.820+.078*crest+.008*normals[:,1]
 v=np.clip(v,.805,.920);cg=np.column_stack((v,v-.052,np.minimum(.992,v+.078)))
 color=np.column_stack((linear(cg),np.ones(len(pos)))).astype('<f4')
 bounds=[pos.min(0).tolist(),pos.max(0).tolist()]
 require(bounds[0][1]>-.13 and bounds[1][1]<.44 and bounds[0][2]>-.25 and bounds[1][2]<.035 and max(abs(bounds[j][0]) for j in [0,1])<.355,'New hair bounded envelope')
 cz=.092 if side>0 else .062;cup=np.hypot((pos[:,2]-cz)/.039,(pos[:,1]-.258)/.054)
 require(cup.min()>1.15,'New hair cup silhouette intrusion')
 report={'name':guide['name']+('-plus' if side>0 else '-minus'),'side':side,'manual_yz_guide':yzctrl.tolist(),'vertices':len(pos),'triangles':len(faces),'world_bounds':bounds,'full_maximum_width':float(2*hw.max()),'full_maximum_depth':float(2*hd.max()),'minimum_triangle_area':float(areas.min()),'enclosed_volume':volume,'edge_incidence_histogram':dict(collections.Counter(edges.values())),'face_vs_mean_smooth_normal_disagreements':face_normal_disagreements,'curvature_section_minimum_scale':float(scale.min()),'minimum_tight_cup_distance':float(cup.min()),'centerline_source_query_radius_yz':[.021,.023],'centerline_source_query_min_count':min(sample_counts),'centerline_source_query_max_normalized_nearest_distance':max(nearest_dist),'inferred_depth_and_root_attachment':True,'root_and_tip_closed':True,'root_tip_inset_vs_lowpassed_surface_fit':spec['interior_inset']+spec['root_tip_inset'],'root_tip_attachment_is_inferred_not_collision_certified':True}
 return pos,normals,uv,color,faces,report,centers

def core_colors(p,c,mask,centers,spec):
 x,y,z=p.T;ax=np.abs(x+.006);cz=np.where(x>-.006,.092,.062);cup=np.hypot((z-cz)/.039,(y-.258)/.054)
 fade=smooth(-.075,-.04,y)*(1-smooth(.345,.385,y))*smooth(.12,.155,ax)*(1-smooth(.255,.29,ax))*(1-smooth(.005,.035,z))*smooth(1.4,1.9,cup)
 # Broad valleys around real S volumes, not per-vertex noisy reference pixels.
 proximity=np.zeros(len(p));ids=np.flatnonzero(mask)
 for side,curve in centers:
  take=ids[(x[ids]+.006)*side>0]
  for start in range(0,len(take),256):
   idx=take[start:start+256];dist=((p[idx,None,1]-curve[None,:,1])/.030)**2+((p[idx,None,2]-curve[None,:,2])/.035)**2
   proximity[idx]=np.maximum(proximity[idx],np.exp(-.5*dist.min(1)))
 w=spec['core_trough_strength']*fade*proximity;w[~mask]=0
 g=gamma(c[:,:3].astype(float));target=np.tile([.785,.725,.871],(len(p),1));new=c.copy();new[:,:3]=linear(g*(1-w[:,None])+target*w[:,None]).astype('<f4');new[~mask]=c[~mask]
 require(np.array_equal(new[:,3],c[:,3]) and np.array_equal(new[~mask],c[~mask]),'Alpha and protected original colors exact')
 return new,w

def append(d,b,array,target,component=5126):
 while len(b)%4:b.append(0)
 array=np.asarray(array,dtype={5126:'<f4',5125:'<u4',5123:'<u2'}[component]);w=array.shape[1] if array.ndim>1 else 1
 offset=len(b);raw=array.tobytes();b.extend(raw);vi=len(d['bufferViews']);d['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':len(raw),'target':target})
 ai=len(d['accessors']);a={'bufferView':vi,'componentType':component,'count':len(array),'type':{1:'SCALAR',2:'VEC2',3:'VEC3',4:'VEC4'}[w]}
 if w==3 and component==5126:a.update(min=array.min(0).astype(float).tolist(),max=array.max(0).astype(float).tolist())
 d['accessors'].append(a);return ai

def main():
 ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--source',type=pathlib.Path,required=True);ap.add_argument('--semantic-mask',type=pathlib.Path,required=True);ap.add_argument('--reference',type=pathlib.Path,required=True);ap.add_argument('--output-parent',type=pathlib.Path,required=True);ap.add_argument('--variant',choices=list(VARIANTS),required=True);a=ap.parse_args()
 source=a.source.resolve();mp=a.semantic_mask.resolve();ref=a.reference.resolve();outdir=a.output_parent.resolve()/a.variant
 require(not outdir.exists(),'Fresh output variant directory required')
 raw=source.read_bytes();maskraw=mp.read_bytes();refraw=ref.read_bytes();require(sha(raw)==SOURCE_PIN and sha(maskraw)==MASK_PIN and sha(refraw)==REF_PIN,'Pinned source/mask/reference')
 original,oldbin=glb(raw);prim=original['meshes'][0]['primitives'][0];at=prim['attributes'];localp=accessor(original,oldbin,at['POSITION']);p=localp.astype(float)*AXES;c=accessor(original,oldbin,at['COLOR_0']);j=accessor(original,oldbin,at['JOINTS_0']);w=accessor(original,oldbin,at['WEIGHTS_0'])
 require(len(original['meshes'])==3 and len(original['skins'])==2 and len(original['skins'][0]['joints'])==19,'Pinned animated topology')
 head=original['skins'][0]['joints'].index(next(i for i,n in enumerate(original['nodes']) if n.get('name')=='AlexiaPrototype_Head'))
 require(head==5 and original['nodes'][1].get('skin')==0,'Actual Head slot5 and mesh0 skin0')
 semantic=np.load(mp);hair=semantic['hair_indices'];mask=hairmask(p,hair);require(mask.sum()==52802,'Independent safe hair mask count')
 head_weight=np.sum(w*np.equal(j,head),axis=1);require(np.all(head_weight[mask]==1),'Source allowed hair rigid Head')
 for key in ['protected_critical_indices','mandatory_face_indices','hands_indices','cup_indices','jacket_indices','cuff_indices']:require(not mask[semantic[key]].any(),'Safe hair overlap '+key)
 spec=VARIANTS[a.variant];locks=[];allp=[];alln=[];alluv=[];allc=[];allfaces=[];centers=[];off=0
 for side in [-1,1]:
  for gi in range(3):
   pp,nn,uu,cc,ff,r,curve=make_lock(side,gi,spec,p,hair);locks.append(r);allp.append(pp*AXES);alln.append(nn*AXES);alluv.append(uu);allc.append(cc);allfaces.append(ff+off);off+=len(pp);centers.append((side,curve))
 color,blend=core_colors(p,c,mask,centers,spec);changed=np.any(color!=c,axis=1);require(np.all(mask[changed]),'Core color scope')
 d=copy.deepcopy(original);b=bytearray(oldbin);ca=append(d,b,color,34962);d['meshes'][0]['primitives'][0]['attributes']['COLOR_0']=ca
 pp=np.concatenate(allp);nn=np.concatenate(alln);uv=np.concatenate(alluv);cc=np.concatenate(allc);ff=np.concatenate(allfaces).reshape(-1)
 joints=np.zeros((len(pp),4),dtype='<u2');joints[:,0]=head;weights=np.zeros((len(pp),4),dtype='<f4');weights[:,0]=1
 attrs={'POSITION':append(d,b,pp,34962),'NORMAL':append(d,b,nn,34962),'TEXCOORD_0':append(d,b,uv,34962),'COLOR_0':append(d,b,cc,34962),'JOINTS_0':append(d,b,joints,34962,5123),'WEIGHTS_0':append(d,b,weights,34962)};idx=append(d,b,ff,34963,5125)
 material=len(d['materials']);d['materials'].append({'name':'Alexia integrated shallow lavender crescents','pbrMetallicRoughness':{'baseColorFactor':[1,1,1,1],'metallicFactor':0,'roughnessFactor':.75},'extensions':{'KHR_materials_unlit':{}},'doubleSided':False})
 d['meshes'][0]['primitives'].append({'attributes':attrs,'indices':idx,'material':material,'mode':4});d['buffers'][0]['byteLength']=len(b)
 expected=copy.deepcopy(original['meshes']);expected[0]['primitives'][0]['attributes']['COLOR_0']=ca;expected[0]['primitives'].append(d['meshes'][0]['primitives'][-1]);require(d['meshes']==expected,'Original mesh contract')
 for key in original:
  if key not in ['meshes','materials','accessors','bufferViews','buffers']:require(d[key]==original[key],'Original JSON exact '+key)
 require(d['accessors'][:len(original['accessors'])]==original['accessors'] and d['bufferViews'][:len(original['bufferViews'])]==original['bufferViews'] and d['materials'][:-1]==original['materials'] and b[:len(oldbin)]==oldbin,'Original append-only byte/doc prefixes')
 js=json.dumps(d,separators=(',',':')).encode();js+=b' '*((-len(js))%4);b+=b'\0'*((-len(b))%4);result=struct.pack('<4sII',b'glTF',2,28+len(js)+len(b))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(b),0x004e4942)+b
 outdir.mkdir(parents=True);out=outdir/'alexia.glb';out.write_bytes(result);mout=outdir/'layered-hair-masks.npz'
 np.savez_compressed(mout,allowed_core_color_indices=np.flatnonzero(mask),changed_core_color_indices=np.flatnonzero(changed),protected_critical_indices=semantic['protected_critical_indices'],mandatory_face_indices=semantic['mandatory_face_indices'],hands_indices=semantic['hands_indices'],hair_indices=hair,core_color_blend_weight=blend)
 proof={'schema':'crwt.alexia.layered_side_hair.v2_integrated','passed':True,'visual_accepted':False,'approved':False,'gameIntegrated':False,'variant':a.variant,'source_path':str(source),'source_sha256':SOURCE_PIN,'semantic_mask_path':str(mp),'semantic_mask_sha256':MASK_PIN,'reference_path':str(ref),'reference_sha256':REF_PIN,'recipe_path':str(pathlib.Path(__file__).resolve()),'recipe_sha256':sha(pathlib.Path(__file__).read_bytes()),'candidate_path':str(out),'candidate_sha256':sha(result),'candidate_bytes':len(result),'mask_npz_path':str(mout),'mask_npz_sha256':sha(mout.read_bytes()),'source_BIN_byte_prefix_identical':True,'original_accessor_bufferView_prefix_identical':True,'all_original_positions_normals_uv_indices_weights_joints_exact':True,'all_existing_nodes_skins_animations_images_textures_materials_exact':True,'mesh1_mesh2_exact':True,'source_alpha_exact':True,'mandatory_face_hands_cup_outfit_colors_exact':True,'existing_mesh_count':3,'added_meshes':0,'added_nodes':0,'added_skins':0,'added_materials':1,'added_mesh0_primitives':1,'source_core_vertices':len(p),'source_original_vertices_changed':0,'source_original_normals_changed':0,'source_core_colors_changed':int(changed.sum()),'allowed_core_color_vertices':int(mask.sum()),'new_vertices':len(pp),'new_triangles':len(ff)//3,'new_closed_locks':len(locks),'new_head_joint_slot':head,'new_hair_all_head_weight_one':True,'maximum_source_position_delta':0,'exact_source_position_cohort_spread':0,'ambiguous_218_closure_extras_position_changed':0,'mask_parameters':MASK_PARAMETERS,'variant_parameters':spec,'core_color_method':'Broad continuous S-field support troughs, gamma lavender target [.785,.725,.871], smooth geometric boundary margins; alpha/protected colors exact.','new_color_method':'Calm normal-derived silver-lavender cross-section COLOR with unlit material matching source hair; actual closed smooth-normal volume, no pixels synthesized/edited.','append_accessors':{'core_color':ca,**attrs,'indices':idx},'locks':locks,'scope':'Six actual closed broad tapered lateral S volumes with existing Head skin. Original geometry and current rig/clips exact.','limits':['Manual reference-supported S guides and inferred roots/depth, not precise six-view reconstruction.','New separate closed volumes intersect source hair intentionally for attachment; no exhaustive self-intersection or collision certificate.','Inherited merged hair core, mottled headphone strap and garment projection defects remain.','Numeric passing requires actual side/front/back and animated review before selection.']}
 (outdir/'alexia.geometry-proof.json').write_text(json.dumps(proof,indent=2)+'\n',encoding='utf-8')
 require(sha(source.read_bytes())==SOURCE_PIN and sha(mp.read_bytes())==MASK_PIN and sha(ref.read_bytes())==REF_PIN,'Read-only original pins remain')
 print(json.dumps({k:proof[k] for k in ['variant','candidate_path','candidate_sha256','candidate_bytes','source_core_colors_changed','new_vertices','new_triangles','new_closed_locks']}))

if __name__=='__main__':main()

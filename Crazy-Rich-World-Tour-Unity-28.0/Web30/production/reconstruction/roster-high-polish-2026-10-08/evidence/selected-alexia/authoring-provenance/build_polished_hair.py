"""Round only the e88 authored hair, with closed S waves and fine strand relief.

Standalone: Python and NumPy; no historical imports or external services.
Original face, body, hardware, source arrays, skeleton and clips stay exact.
"""
import argparse,collections,copy,hashlib,json,math,pathlib,struct
import numpy as np

SOURCE_PIN='e88b27e4a71058a4576fb4ab1b3d6d24a621d771175ce700a9a3e959729daf52'
MASK_PIN='10618a926e013a8a8f9f8d932412f17170197bba2cecd3217c838bdc02ba3649'
REFERENCE_PIN='935b1f8f7d2be4a6a453a089041844f2cd4470eb64be17d9d72568efb3708933'
BOUNDARY_PIN='b267a0531dcd5f1644f2df62bfea9f677eff64a6abd5bce94f0f420811376629'
ORPHAN_PIN='ded53028e73e702840adb0d50a353d5ba47d3e5039d92db8c136bd6f4218c1fd'
AXES=np.array([-1.,1.,-1.]);CAP_CENTER=np.array([-.006,.302,-.055]);CAP_RADII=np.array([.204,.182,.113])
VARIANTS={'crown-waves':{'half_depth':.016,'width_scale':1.02,'roughness':.60,'back_count':6,'side_count':3,'color_gamma':[.805,.727,.914]}}
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
   backfade=smooth(.05,-.35,v[2]);rib=.012*math.cos(5*th+1.3*math.sin(phi))*math.sin(phi)**2*backfade
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
 count=181;radial=40;t=np.linspace(0,1,count);centers=np.array([bspline(guide['points'],v) for v in t]);tang=unit(np.gradient(centers,axis=0))
 depth=np.tile(guide['depth_axis'],(count,1));depth=unit(depth-tang*np.sum(depth*tang,axis=1)[:,None]);width=unit(np.cross(tang,depth))
 taper=(.095+.905*smooth(0,.29,t))*(1-.995*smooth(.63,1,t));hw=guide['width']*spec['width_scale']*taper;hd=spec['half_depth']*taper
 # Broad rounded sheets remain smooth through the hooked taper, avoiding folds.
 ds=np.maximum(np.linalg.norm(np.gradient(centers,axis=0),axis=1),1e-8);curv=np.gradient(tang,axis=0)/ds[:,None]
 risk=hw*np.abs(np.sum(curv*width,axis=1))+hd*np.abs(np.sum(curv*depth,axis=1));scale=np.minimum(1,.62/np.maximum(risk,1e-9))
 for _ in range(3):
  nb=np.minimum(np.roll(scale,1),np.roll(scale,-1));nb[[0,-1]]=scale[[0,-1]];scale=np.minimum(scale,.6*scale+.4*nb)
 hw*=scale;hd*=scale;pos=[];uv=[]
 for j in range(count):
  for k in range(radial):
   th=2*math.pi*k/radial;u=math.cos(th);outer=max(math.sin(th),0.)**3
   # Shallow connected strand valleys follow the long sheet, fading before
   # roots and fine tips. They are actual relief, not dark texture stripes.
   valley=sum(math.exp(-((u-c)/.085)**2) for c in [-.58,-.13,.36,.73])
   amplitude=.00115*float(smooth(.18,.38,t[j]))*(1-float(smooth(.78,.96,t[j])))
   pos.append(centers[j]+width[j]*(hw[j]*u)+depth[j]*(hd[j]*math.sin(th)-amplitude*valley*outer));uv.append([t[j],k/radial])
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


def polished_guides(spec):
 result=guides(spec)
 for i,guide in enumerate(result):
  cp=guide['points'].copy();side=-1. if np.median(cp[:,0])<-.006 else 1.
  # Preserve the upper attachment/cup region. Shape only the lower drape into
  # staggered inward hooks, with a fine ascending tip rather than blunt blades.
  cp[-3,0]+=side*(.009+.003*math.sin(i*1.7))
  cp[-2,0]-=side*.008
  cp[-1,0]-=side*(.022+.005*math.cos(i))
  cp[-1,1]+=.012+.004*math.sin(i*1.9)
  cp[-1,2]-=.008
  guide['points']=cp
 return result

def tangent_space(p,n,uv,f):
 e1=p[f[:,1]]-p[f[:,0]];e2=p[f[:,2]]-p[f[:,0]]
 u1=uv[f[:,1]]-uv[f[:,0]];u2=uv[f[:,2]]-uv[f[:,0]]
 # V wraps around the sheet cross section; U follows the actual hair flow.
 for a in (u1,u2):a[:,1]-=np.round(a[:,1])
 det=u1[:,0]*u2[:,1]-u1[:,1]*u2[:,0];valid=abs(det)>1e-10;r=np.zeros_like(det);r[valid]=1/det[valid]
 ta=(e1*u2[:,1,None]-e2*u1[:,1,None])*r[:,None];bi=(e2*u1[:,0,None]-e1*u2[:,0,None])*r[:,None]
 ts=np.zeros_like(p);bs=np.zeros_like(p)
 for k in range(3):np.add.at(ts,f[:,k],ta);np.add.at(bs,f[:,k],bi)
 ts-=n*(ts*n).sum(1)[:,None];bad=np.linalg.norm(ts,axis=1)<1e-9
 axis=np.tile([0.,0.,1.],(len(p),1));axis[abs(n[:,2])>.9]=[0,1.,0]
 ts[bad]=unit(np.cross(axis,n))[bad];ts=unit(ts)
 sign=np.where((np.cross(n,ts)*bs).sum(1)<0,-1.,1.)
 result=np.column_stack((ts,sign)).astype('<f4')
 need(np.isfinite(result).all() and abs((ts*n).sum(1)).max()<1e-6,'Finite orthogonal tangent space')
 return result

def main():
 ap=argparse.ArgumentParser(description=__doc__)
 ap.add_argument('--source',type=pathlib.Path,required=True)
 ap.add_argument('--reference',type=pathlib.Path,required=True)
 ap.add_argument('--output-parent',type=pathlib.Path,required=True)
 a=ap.parse_args();src=a.source.resolve(strict=True);ref=a.reference.resolve(strict=True);out=a.output_parent.resolve()
 need(not out.exists() and not out.is_relative_to(src.parent) and out!=src,'Fresh external output required')
 raw=src.read_bytes();refraw=ref.read_bytes();pins=(sha(raw),src.stat().st_mtime_ns,sha(refraw),ref.stat().st_mtime_ns)
 need(pins[0]==SOURCE_PIN and pins[2]==REFERENCE_PIN,'Pinned e88/reference inputs')
 original,oldbin=read_glb(raw);d=copy.deepcopy(original);b=bytearray(oldbin)
 before=original['meshes'][0]['primitives'][1]
 need(before['material']==8 and get(original,oldbin,before['attributes']['POSITION']).shape==(58514,3),'Only actual authored hair primitive1/material8')
 need(original['materials'][8]['name'].startswith('Alexia authored rounded lavender scalp'),'Authored material identity')
 headnode=next(i for i,n in enumerate(d['nodes']) if n.get('name')=='AlexiaPrototype_Head');head=d['skins'][0]['joints'].index(headnode);need(head==5,'Actual Head joint slot')
 spec=VARIANTS['crown-waves'];parts=[];records=[]
 q,n,u,f,r=cap();parts.append((q,n,u,colors(q,n,spec,True),f));records.append(r)
 for guide in polished_guides(spec):
  q,n,u,f,r=sheet(guide,spec);parts.append((q,n,u,colors(q,n,spec,False),f));records.append(r)
 arrays=[[],[],[],[],[]];offset=0
 for q,n,u,c,f in parts:
  for destination,value in zip(arrays,(q,n,u,c,f+offset)):destination.append(value)
  offset+=len(q)
 p,n,u,c,f=[np.concatenate(values) for values in arrays]
 replacement=primitive(d,b,(p,n,u,c,f),8,head)
 tangent=tangent_space(p*AXES,n*AXES,u,f)
 replacement['attributes']['TANGENT']=append(d,b,tangent,34962)
 d['meshes'][0]['primitives'][1]=replacement
 material=copy.deepcopy(original['materials'][8]);material['name']='Alexia polished rounded lavender waves Oct8'
 material['pbrMetallicRoughness']['roughnessFactor']=.59
 material['extensions']['KHR_materials_anisotropy']={'anisotropyStrength':.18,'anisotropyRotation':0.0}
 d['materials'][8]=material;d['buffers'][0]['byteLength']=len(b)
 need(b[:len(oldbin)]==oldbin,'Original BIN prefix exact')
 need(d['accessors'][:len(original['accessors'])]==original['accessors'] and d['bufferViews'][:len(original['bufferViews'])]==original['bufferViews'],'Original array records exact')
 for key in original:
  if key not in ['meshes','materials','accessors','bufferViews','buffers']:need(d[key]==original[key],'Protected document exact '+key)
 need(d['meshes'][1:]==original['meshes'][1:],'Other meshes exact')
 need(all(q==original['meshes'][0]['primitives'][i] for i,q in enumerate(d['meshes'][0]['primitives']) if i!=1),'Every nonhair primitive exact')
 need(all(q==original['materials'][i] for i,q in enumerate(d['materials']) if i!=8),'Every nonhair material exact')
 j=json.dumps(d,separators=(',',':')).encode();j+=b' '*((-len(j))%4);b+=b'\0'*((-len(b))%4)
 result=struct.pack('<4sII',b'glTF',2,28+len(j)+len(b))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(b),0x004e4942)+b
 out.mkdir(parents=True);model=out/'alexia.glb';model.write_bytes(result)
 proof={'schema':'crwt.alexia.high_polish_hair.v1','passed':True,'visual_accepted':False,
  'source_sha256':pins[0],'reference_sha256':pins[2],'candidate_sha256':sha(result),'candidate_bytes':len(result),
  'recipe_sha256':sha(pathlib.Path(__file__).read_bytes()),'source_hair_mesh':0,'source_hair_primitive':1,'source_hair_material':8,
  'affected_primitive_name':'authored cap and sixteen rounded waves','affected_material_name':material['name'],
  'source_BIN_prefix_and_all_original_accessors_bufferViews_exact':True,
  'all_nonhair_primitives_materials_and_meshes_exact':True,'source_core_face_fringe_body_cups_unchanged':True,
  'nodes_skins_bind_matrices_animations_images_textures_default_scene_exact':True,
  'existing_original_hair_streams_stored_exact_rendered_hair_replaced':True,
  'new_all_actual_Head_rigid_joint_slot':head,'new_weight_rows_normalized':True,
  'old_hair_vertices':58514,'old_hair_triangles':116960,'new_hair_vertices':len(p),'new_hair_triangles':len(f),
  'closed_components':len(records),'components':records,'world_bounds':[p.min(0).tolist(),p.max(0).tolist()],
  'maximum_shallow_strand_valley_depth':.00115,'material_roughness':.59,'material_anisotropy_strength':.18,
  'limits':['Closed components overlap at cap attachments; exhaustive global intersections are not certified.',
            'Front identity and body are preserved; this hair pass does not repair their remaining artifacts.',
            'Manual original-character hair design uses only the reference quality direction, not the reference avatar geometry.'],
  'gameIntegrated':False}
 need((sha(src.read_bytes()),src.stat().st_mtime_ns,sha(ref.read_bytes()),ref.stat().st_mtime_ns)==pins,'Frozen inputs SHA/mtime unchanged')
 proof['source_reference_SHA_mtime_unchanged']=True
 (out/'hair-polish-proof.json').write_bytes((json.dumps(proof,indent=2)+'\n').encode('utf-8'))
 print(json.dumps({k:proof[k] for k in ['candidate_sha256','candidate_bytes','new_hair_vertices','new_hair_triangles','closed_components','world_bounds']}))
if __name__=='__main__':main()

"""Two conservative, topology-preserving rear hair carve candidates.

Original GLB BIN is an exact prefix. Only mesh0 POSITION/NORMAL are redirected
to appended accessors. XY silhouette, colors, UVs and the two added locks stay
byte-exact. Manual S-flow guide curves are approximate, not camera-calibrated.
"""
import argparse,copy,hashlib,heapq,json,pathlib,struct
import numpy as np

HERE=pathlib.Path(__file__).resolve().parent
ROOT=HERE.parents[2]
SOURCE=ROOT/'outputs/model-review-2026-10-05-hair-strands/viewer/models/alexia.glb'
REF=ROOT/'outputs/model-review-2026-10-05-hair-strands/references/alexia-blue-v2-turnaround.png'
SOURCE_PIN='19f007950c8651e81ee2c49374f28af3785e3710171f142324bf67cb7ce74b24'
REF_PIN='935b1f8f7d2be4a6a453a089041844f2cd4470eb64be17d9d72568efb3708933'
sha=lambda b:hashlib.sha256(b).hexdigest()
require=lambda condition,message: None if condition else (_ for _ in ()).throw(ValueError(message))

MASK={
 'coordinate_frame':'glTF world +Y up +Z front; original mesh0 local_to_world=(-X,+Y,-Z), existing 180deg Y rotation preserved',
 'hard_spatial':{'world_x_absolute_max':.245,'world_y_min':-.065,'world_y_max':.365,'world_z_max':-.095},
 'hard_color':{'blue_minus_green_min':.008,'blue_minus_red_min':-.005,'minimum_rgb_min':.075},
 'hard_normal':{'original_world_normal_z_max':-.12},
 'source_geometric_face_protection':{'pin_incident_vertex_when_original_world_face_normal_z_above':-.35,'pin_incident_vertex_when_original_face_opposes_average_vertex_normal':True,'pin_incident_vertex_when_original_triangle_quality_below':.10,'triangle_quality_formula':'4*sqrt(3)*area / sum(squared edge lengths), equilateral=1'},
 'position_mask_policy':'Hair hard mask eroded by one incident-face neighbor ring; exclude vertices of original degenerate faces. Smooth confidence and compact groove kernels create exact zero outside.',
 'normal_mask_policy':'Only vertices in faces incident to changed positions; subset of hard hair mask. Original normals retained byte-exact elsewhere.',
 'smooth_spatial':{'x_fade_from':.205,'x_fade_to':.245,'y_bottom_zero':-.065,'y_bottom_full':-.02,'y_top_full':.29,'y_top_zero':.345,'z_zero':-.095,'z_full':-.125},
 'smooth_color':{'blue_minus_green_zero':.008,'blue_minus_green_full':.055,'blue_minus_red_zero':-.005,'blue_minus_red_full':.026,'minimum_rgb_zero':.075,'minimum_rgb_full':.25},
 'smooth_normal':{'rear_facing_zero':.12,'rear_facing_full':.58},
 'confidence_smoothing_neighbor_iterations':6,
 'confidence_smoothing_neighbor_blend':.45,
 'final_inset_smoothing_neighbor_iterations':0,
 'final_inset_smoothing_policy':'No final unweighted Laplacian displacement smoothing: inherited irregular triangles made that trial less safe. Source confidence and geometric boundary distance are smoothed, while inset is a continuous manually guided compact S-field.',
 'coincident_position_policy':'Tie inset amount to the smallest proposed delta in each original world-position cohort rounded to 6 decimal places. A cohort is pinned if any member is outside the eroded hard hair mask. This preserves original seam offsets instead of opening a displacement crack.',
 'coincident_world_position_round_decimal_places':6,
 'pinned_boundary_geodesic_fade_world_units':.025,
 'seam_geodesic_policy':'Near-coincident cohorts also share confidence smoothing and zero-cost graph connections for boundary-distance falloff. This avoids unequal seam falloff from duplicate UV-seam topology.',
 'degenerate_area_threshold_world_units_squared':1e-12,
 'groove_inset_direction_world':[0,0,1],
 'groove_compact_support_sigma_multiple':3.0,
 'groove_terminal_blend':'Combined spatial smoothstep; paths are natural cubic X(Y) S curves, with broader branch/swing through the lower-middle rear hair.'
}
# X,Y guide knots. S-valleys separate the major rear clumps. Guides are inferred
# from unchanged back/profile drawings, with greater uncertainty at attachments.
PATHS=[
 {'id':'positive-outer-valley','strength':.72,'xy':[[.170,.365],[.166,.29],[.153,.21],[.190,.15],[.222,.095],[.230,.045],[.205,-.012],[.160,-.065]]},
 {'id':'positive-inner-valley','strength':1.0,'xy':[[.082,.365],[.091,.29],[.068,.21],[.035,.16],[.065,.115],[.103,.065],[.095,.015],[.050,-.065]]},
 {'id':'central-branch-valley','strength':.84,'xy':[[.010,.365],[.009,.30],[-.018,.24],[-.011,.185],[.015,.13],[.014,.08],[-.020,.025],[-.002,-.065]]},
 {'id':'negative-inner-valley','strength':1.0,'xy':[[-.071,.365],[-.083,.29],[-.093,.22],[-.063,.165],[-.100,.115],[-.145,.055],[-.128,.0],[-.075,-.065]]},
 {'id':'negative-outer-valley','strength':.72,'xy':[[-.165,.365],[-.174,.29],[-.155,.22],[-.180,.16],[-.223,.095],[-.237,.045],[-.213,-.015],[-.165,-.065]]}
]
VARIANTS={'mild':{'depth':.006,'sigma':.014},'moderate':{'depth':.009,'sigma':.015}}

def read_glb(raw):
 require(struct.unpack_from('<4sII',raw)==(b'glTF',2,len(raw)),'GLB header')
 size,kind=struct.unpack_from('<II',raw,12);require(kind==0x4e4f534a,'GLB JSON')
 d=json.loads(raw[20:20+size]);n,k=struct.unpack_from('<II',raw,20+size)
 require(k==0x004e4942 and len(raw)==28+size+n,'GLB BIN');return d,raw[28+size:]

def accessor(d,b,k):
 a=d['accessors'][k];v=d['bufferViews'][a['bufferView']]
 require(v.get('buffer',0)==0 and 'sparse' not in a,'Simple accessor required')
 w={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];dt={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']]
 off=v.get('byteOffset',0)+a.get('byteOffset',0);s=v.get('byteStride',w*np.dtype(dt).itemsize)
 return np.ndarray((a['count'],w),dtype=dt,buffer=b,offset=off,strides=(s,np.dtype(dt).itemsize)).copy()

def smooth(lo,hi,v):
 t=np.clip((v-lo)/(hi-lo),0,1);return t*t*(3-2*t)

class NaturalCubic:
 def __init__(self,y,x):
  self.y=y;self.x=x;h=np.diff(y);count=len(y);A=np.zeros((count,count));rhs=np.zeros(count)
  A[0,0]=A[-1,-1]=1
  for i in range(1,count-1):
   A[i,i-1]=h[i-1];A[i,i]=2*(h[i-1]+h[i]);A[i,i+1]=h[i]
   rhs[i]=6*((x[i+1]-x[i])/h[i]-(x[i]-x[i-1])/h[i-1])
  self.m=np.linalg.solve(A,rhs)
 def __call__(self,t,derivative=0):
  j=np.clip(np.searchsorted(self.y,t)-1,0,len(self.y)-2);h=self.y[j+1]-self.y[j];a=(self.y[j+1]-t)/h;b=(t-self.y[j])/h
  if derivative:return (self.x[j+1]-self.x[j])/h+((-3*a*a+1)*self.m[j]+(3*b*b-1)*self.m[j+1])*h/6
  return a*self.x[j]+b*self.x[j+1]+((a*a*a-a)*self.m[j]+(b*b*b-b)*self.m[j+1])*h*h/6

def geometry(p,f):
 cross=np.cross(p[f[:,1]]-p[f[:,0]],p[f[:,2]]-p[f[:,0]])
 return cross,np.linalg.norm(cross,axis=1)*.5

def hardmask(p,n,c):
 h=MASK['hard_spatial'];co=MASK['hard_color'];no=MASK['hard_normal']
 return ((np.abs(p[:,0])<h['world_x_absolute_max'])&(p[:,1]>h['world_y_min'])&(p[:,1]<h['world_y_max'])&(p[:,2]<h['world_z_max'])
  &(c[:,2]-c[:,1]>co['blue_minus_green_min'])&(c[:,2]-c[:,0]>co['blue_minus_red_min'])&(np.min(c[:,:3],axis=1)>co['minimum_rgb_min'])&(n[:,2]<no['original_world_normal_z_max']))

def cohort_edges(cohort):
 ids=np.argsort(cohort,kind='stable');first=np.r_[True,cohort[ids[1:]]!=cohort[ids[:-1]]];start=np.flatnonzero(first);root=ids[np.repeat(start,np.diff(np.r_[start,len(ids)]))]
 links=np.column_stack((root,ids));links=links[links[:,0]!=links[:,1]]
 return np.vstack((links,links[:,::-1]))

def adjacency_smooth(v,faces,iterations,seamlinks,allowed=None):
 edges=np.vstack((faces[:,[0,1]],faces[:,[1,2]],faces[:,[2,0]]));edges=np.vstack((edges,edges[:,::-1]))
 edges=np.vstack((edges,seamlinks))
 # Duplicate face edges intentionally weight incident neighborhood by valence.
 counts=np.bincount(edges[:,0],minlength=len(v));has=counts>0
 for _ in range(iterations):
  sums=np.bincount(edges[:,0],weights=v[edges[:,1]],minlength=len(v));means=v.copy();means[has]=sums[has]/counts[has]
  v=.55*v+.45*means
  if allowed is not None:v[~allowed]=0
 return v

def boundary_fade(p,faces,allowed,radius,seamlinks):
 edges=np.vstack((faces[:,[0,1]],faces[:,[1,2]],faces[:,[2,0]]));edges=np.vstack((edges,edges[:,::-1]))
 edges=np.vstack((edges,seamlinks))
 edges=np.unique(edges,axis=0);weights=np.linalg.norm(p[edges[:,0]]-p[edges[:,1]],axis=1)
 starts=np.searchsorted(edges[:,0],np.arange(len(p)+1))
 border=edges[allowed[edges[:,0]]&~allowed[edges[:,1]],0]
 dist=np.full(len(p),np.inf);dist[~allowed]=0;dist[np.unique(border)]=0
 queue=[(0,int(j)) for j in np.unique(border)];heapq.heapify(queue)
 while queue:
  cost,i=heapq.heappop(queue)
  if cost!=dist[i]:continue
  if cost>=radius:continue
  for ej in range(starts[i],starts[i+1]):
   j=int(edges[ej,1]);newcost=cost+weights[ej]
   if allowed[j] and newcost<dist[j] and newcost<=radius:
    dist[j]=newcost;heapq.heappush(queue,(newcost,j))
 return smooth(0,radius,dist)

def carve(variant,p,n,c,faces):
 spec=VARIANTS[variant];hm=hardmask(p,n,c);allowed=hm.copy()
 border=~np.all(hm[faces],axis=1);allowed[np.unique(faces[border])]=False
 oldcross,oldarea=geometry(p,faces);deg=oldarea<=MASK['degenerate_area_threshold_world_units_squared'];allowed[np.unique(faces[deg])]=False
 safearea=np.maximum(2*oldarea,1e-300);geometric_rear=oldcross[:,2]/safearea
 original_normal_face_dot=np.einsum('ij,ij->i',oldcross,n[faces].mean(axis=1))
 edge2=sum(np.sum((p[faces[:,(j+1)%3]]-p[faces[:,j]])**2,axis=1) for j in range(3))
 quality=4*np.sqrt(3)*oldarea/np.maximum(edge2,1e-300)
 sliver=quality<.10
 protected_face=(geometric_rear>-.35)|(original_normal_face_dot<0)|sliver
 allowed[np.unique(faces[protected_face])]=False
 _,cohort,cohortcount=np.unique(np.round(p,6),axis=0,return_inverse=True,return_counts=True)
 cohortallowed=np.ones(len(cohortcount),dtype=bool);np.logical_and.at(cohortallowed,cohort,allowed);allowed &= cohortallowed[cohort]
 seamlinks=cohort_edges(cohort)
 x,y,z=p.T;cg=c[:,2]-c[:,1];cr=c[:,2]-c[:,0];minimum=c[:,:3].min(1)
 confidence=smooth(.008,.055,cg)*smooth(-.005,.026,cr)*smooth(.075,.25,minimum)*smooth(.12,.58,-n[:,2])
 confidence=adjacency_smooth(confidence,faces,6,seamlinks)
 # Average smooth confidence inside each original-position cohort before the
 # shared boundary falloff. Field then varies continuously across UV seams.
 confidence=np.bincount(cohort,weights=confidence)/cohortcount
 confidence=confidence[cohort]
 fade=(1-smooth(.205,.245,np.abs(x)))*smooth(-.065,-.02,y)*(1-smooth(.29,.345,y))*smooth(.095,.125,-z)
 confidence*=fade*boundary_fade(p,faces,allowed,MASK['pinned_boundary_geodesic_fade_world_units'],seamlinks)
 confidence[~allowed]=0
 # Smooth compact support, with zero kernel and derivative at support boundary.
 contributions=[]
 for guide in PATHS:
  knots=np.array(guide['xy'],dtype=float);knots=knots[np.argsort(knots[:,1])]
  spl=NaturalCubic(knots[:,1],knots[:,0])
  xx=spl(np.clip(y,knots[0,1],knots[-1,1]));slope=spl(np.clip(y,knots[0,1],knots[-1,1]),1)
  distance=np.abs(x-xx)/np.sqrt(1+slope*slope)
  rr=distance/spec['sigma'];k=np.exp(-.5*rr*rr)*(1-smooth(2,3,rr))
  k[(y<knots[0,1])|(y>knots[-1,1])]=0
  contributions.append(k*guide['strength'])
 # Max avoids excess depth where two path neighborhoods overlap.
 field=np.max(contributions,axis=0)*confidence
 delta=spec['depth']*field
 cohortdelta=np.full(len(cohortcount),np.inf);np.minimum.at(cohortdelta,cohort,delta);delta=cohortdelta[cohort]
 delta=adjacency_smooth(delta,faces,MASK['final_inset_smoothing_neighbor_iterations'],seamlinks,allowed)
 cohortdelta=np.full(len(cohortcount),np.inf);np.minimum.at(cohortdelta,cohort,delta);delta=cohortdelta[cohort]
 # Remove amplitudes too small to make a meaningful float position change.
 delta[delta<2e-7]=0
 candidate=p.copy();candidate[:,2]+=delta
 candidate=(candidate*[-1,1,-1]).astype('<f4').astype(float)*[-1,1,-1]
 changed=np.any(candidate!=p,axis=1); affected=np.any(changed[faces],axis=1)
 newcross,newarea=geometry(candidate,faces)
 dot=np.einsum('ij,ij->i',oldcross,newcross)
 valid=oldarea>MASK['degenerate_area_threshold_world_units_squared']
 lengthproduct=(2*oldarea)*(2*newarea)
 cosine=np.ones(len(faces));cosine[valid]=dot[valid]/np.maximum(lengthproduct[valid],1e-300)
 newdeg=valid&(newarea<=MASK['degenerate_area_threshold_world_units_squared'])
 flips=valid&(dot<=0)
 collapse=valid&(newarea<oldarea*.2)
 excessive_turn=affected&valid&(cosine<.30)
 checks={'original_degenerate_faces':int(deg.sum()),'affected_original_degenerate_faces':int((deg&affected).sum()),'new_degenerate_faces':int(newdeg.sum()),'new_flipped_faces_relative_original':int(flips.sum()),'new_area_ratio_below_point2_faces':int(collapse.sum()),'affected_face_cosine_below_point3':int(excessive_turn.sum()),'minimum_affected_original_area':float(oldarea[affected].min()),'minimum_affected_candidate_area':float(newarea[affected].min()),'minimum_affected_area_ratio':float((newarea[affected]/oldarea[affected]).min()),'minimum_affected_face_cosine_vs_original':float(cosine[affected].min())}
 if np.any(flips|excessive_turn):
  ids=np.flatnonzero(flips|excessive_turn)
  rows=[{'face':int(j),'centroid':p[faces[j]].mean(0).tolist(),'original_face_normal':(oldcross[j]/(2*oldarea[j])).tolist(),'area':float(oldarea[j]),'delta':delta[faces[j]].tolist(),'allowed':allowed[faces[j]].tolist(),'confidence':confidence[faces[j]].tolist()} for j in ids]
  (HERE/('rejected-'+variant+'.json')).write_text(json.dumps({'checks':checks,'faces':rows},indent=2),encoding='utf-8')
 require(not np.any(newdeg|flips|collapse|excessive_turn), 'Candidate face check rejected: '+json.dumps(checks))
 normals=n.copy();normalmask=np.zeros(len(p),bool);normalmask[np.unique(faces[affected])]=True
 require(np.all(hm[changed]) and np.all(hm[normalmask]),'Position/normal changes escape explicit rear hair mask')
 sums=np.zeros_like(p)
 for k in range(3):np.add.at(sums,faces[:,k],newcross)
 length=np.linalg.norm(sums,axis=1);require(np.all(length[normalmask]>0),'Degenerate recomputed normal')
 normals[normalmask]=sums[normalmask]/length[normalmask,None]
 normals=(normals*[-1,1,-1]).astype('<f4').astype(float)*[-1,1,-1]
 normalchanged=np.any(normals!=n,axis=1)
 require(np.all(normalchanged<=normalmask),'Normal outside adjacency')
 checks['baseline_face_normals_opposing_average_vertex_normal']=int((valid&(original_normal_face_dot<0)).sum())
 checks['affected_baseline_opposing_average_vertex_normal']=int((affected&valid&(original_normal_face_dot<0)).sum())
 checks['affected_original_geometric_face_nz_above_minus_point35']=int((affected&(geometric_rear>-.35)).sum())
 checks['baseline_triangle_quality_below_point1']=int(sliver.sum())
 checks['affected_original_triangle_quality_below_point1']=int((affected&sliver).sum())
 checks['minimum_affected_original_triangle_quality']=float(quality[affected].min())
 cohortstats={'rounded_position_cohort_count':len(cohortcount),'duplicate_cohort_count':int((cohortcount>1).sum()),'vertices_in_duplicate_cohorts':int(cohortcount[cohortcount>1].sum()),'cohort_delta_tied_before_float32':True,'maximum_inset_difference_inside_cohort_before_float32':0.0}
 checks['coincident_seam_policy']=cohortstats
 return candidate,normals,hm,changed,normalchanged,affected,checks,spec

def append3(d,b,values):
 while len(b)%4:b.append(0)
 values=np.asarray(values,dtype='<f4');data=values.tobytes();vi=len(d['bufferViews']);ai=len(d['accessors'])
 d['bufferViews'].append({'buffer':0,'byteOffset':len(b),'byteLength':len(data),'target':34962});b.extend(data)
 d['accessors'].append({'bufferView':vi,'componentType':5126,'count':len(values),'type':'VEC3','min':values.min(0).astype(float).tolist(),'max':values.max(0).astype(float).tolist()})
 return ai

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--variant',choices=list(VARIANTS),required=True);a=ap.parse_args();outdir=HERE/a.variant
 require(not outdir.exists(),'Fresh owned candidate directory required')
 raw=SOURCE.read_bytes();require(sha(raw)==SOURCE_PIN,'Source pin');require(sha(REF.read_bytes())==REF_PIN,'Reference pin')
 original,oldbin=read_glb(raw);require(len(original['meshes'])==3 and original['nodes'][2]['rotation']==[0,1,0,0],'Source frame/topology contract')
 prim=original['meshes'][0]['primitives'][0];require(len(original['meshes'][0]['primitives'])==1,'One original core primitive')
 p_local=accessor(original,oldbin,prim['attributes']['POSITION']);n_local=accessor(original,oldbin,prim['attributes']['NORMAL']);c=accessor(original,oldbin,prim['attributes']['COLOR_0']).astype(float)
 p=p_local.astype(float)*[-1,1,-1];n=n_local.astype(float)*[-1,1,-1];f=accessor(original,oldbin,prim['indices']).reshape(-1,3)
 require(len(p)==252943 and np.isfinite(p).all() and np.isfinite(n).all(),'Source original counts/finite')
 q,qn,hm,changed,nchanged,affected,checks,spec=carve(a.variant,p,n,c,f)
 d=copy.deepcopy(original);binary=bytearray(oldbin);pa=append3(d,binary,q*[-1,1,-1]);na=append3(d,binary,qn*[-1,1,-1])
 d['meshes'][0]['primitives'][0]['attributes']['POSITION']=pa;d['meshes'][0]['primitives'][0]['attributes']['NORMAL']=na;d['buffers'][0]['byteLength']=len(binary)
 expected=copy.deepcopy(original['meshes']);expected[0]['primitives'][0]['attributes'].update(POSITION=pa,NORMAL=na)
 require(d['meshes']==expected and d['meshes'][1:]==original['meshes'][1:],'Mesh scope')
 require(d['accessors'][:-2]==original['accessors'] and d['bufferViews'][:-2]==original['bufferViews'],'Old accessor preservation')
 for key in original:
  if key not in ('meshes','accessors','bufferViews','buffers'):require(d[key]==original[key],'Unchanged document field '+key)
 require(binary[:len(oldbin)]==oldbin,'Original BIN prefix')
 require(np.array_equal((q*[-1,1,-1]).astype('<f4')[~changed],p_local[~changed]),'Protected position exact')
 require(np.array_equal((qn*[-1,1,-1]).astype('<f4')[~nchanged],n_local[~nchanged]),'Protected normal exact')
 js=json.dumps(d,separators=(',',':')).encode();js+=b' '*((-len(js))%4);binary+=b'\0'*((-len(binary))%4)
 result=struct.pack('<4sII',b'glTF',2,28+len(js)+len(binary))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(binary),0x004e4942)+binary
 outdir.mkdir();out=outdir/'alexia.glb';out.write_bytes(result)
 npz=outdir/'sculpt-masks.npz';np.savez_compressed(npz,hard_hair_mask_indices=np.flatnonzero(hm),changed_position_indices=np.flatnonzero(changed),changed_normal_indices=np.flatnonzero(nchanged),affected_face_indices=np.flatnonzero(affected))
 delta=q-p;changedp=q[changed];magnitude=np.linalg.norm(delta,axis=1)
 report={'schema':'crwt.alexia.rear_hair_sculpt.v1','approved':False,'gameIntegrated':False,'variant':a.variant,'source_path':str(SOURCE.resolve()),'source_sha256':SOURCE_PIN,'reference_path':str(REF.resolve()),'reference_sha256':REF_PIN,'candidate_path':str(out.resolve()),'candidate_sha256':sha(result),'candidate_bytes':len(result),'recipe_path':str(pathlib.Path(__file__).resolve()),'recipe_sha256':sha(pathlib.Path(__file__).read_bytes()),'source_BIN_byte_prefix_identical':True,'original_accessors_and_bufferViews_identical':True,'unchanged_non_position_normal_accessors':True,'unchanged_mesh1_mesh2':True,'all_node_transforms_materials_images_uv_colors_indices_skins_animations_identical':True,'original_total_vertices':sum(original['accessors'][pp['attributes']['POSITION']]['count'] for mesh in original['meshes'] for pp in mesh['primitives']),'original_core_vertices':len(p),'original_core_triangles':len(f),'original_mesh_vertices_changed':int(changed.sum()),'original_normals_changed':int(nchanged.sum()),'affected_original_faces':int(affected.sum()),'hard_hair_mask_vertex_count':int(hm.sum()),'mesh_count_before_after':[3,3],'added_meshes':0,'added_nodes':0,'added_materials':0,'added_vertices':0,'added_triangles':0,'new_position_accessor':pa,'new_normal_accessor':na,'old_position_accessor':prim['attributes']['POSITION'],'old_normal_accessor':prim['attributes']['NORMAL'],'mask_parameters':MASK,'mask_npz_path':str(npz.resolve()),'mask_npz_sha256':sha(npz.read_bytes()),'guide_paths':PATHS,'sculpt_parameters':spec,'maximum_world_delta':float(magnitude.max()),'mean_changed_world_delta':float(magnitude[changed].mean()),'world_delta_bounds':[delta.min(0).tolist(),delta.max(0).tolist()],'changed_world_bounds':[changedp.min(0).tolist(),changedp.max(0).tolist()],'position_xy_byte_exact':True,'geometry_checks':checks,'passed':True,'scope':'Shallow actual rear-core surface inset grooves following manually approximated S-valleys. Front face/eyes/body/equipment, colors, UV, topology and existing two S curl volume meshes retain exact source data. Original normals remain exact except changed-face immediate hair adjacency.','limits':['Paths and roots are manual reference-supported interpretation with inferred depth, not a camera-calibrated match or reference precision claim.','Shallow grooves improve separation on the original merged surface; they cannot create deep open gaps, fully separated sculpted clumps, rigged hair or a production mesh.','Face safety checks are baseline-relative; inherited geometric pathologies are recorded separately. No exhaustive global self-intersection certification.','Material is still unlit with original baked colors. Gray geometry renders are needed to judge the carved surface independently of the colors.']}
 (outdir/'alexia.geometry-proof.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
 print(json.dumps({k:report[k] for k in ['variant','candidate_path','candidate_sha256','candidate_bytes','original_mesh_vertices_changed','original_normals_changed','affected_original_faces','maximum_world_delta','geometry_checks']}))

if __name__=='__main__':main()

"""Continuous rear hair inset and spatially smoothed differential normals.

Reads only pinned baseline/reference and recipe helpers, never rejected GLBs.
Shallow scalar S-field uses spatial falloffs, compatible seam ties and a smooth
Euclidean distance to hard protected boundaries. Sliver quality is diagnostic,
not a categorical pin. Original smooth normal differential is Gaussian-smoothed
over spatially close, source-normal-compatible hair and applied only in scope.
"""
import argparse,copy,hashlib,importlib.util,json,pathlib,struct,sys
import numpy as np
HERE=pathlib.Path(__file__).resolve().parent
HELPER=HERE/'build_hair_sculpt.py';HELPER_PIN='75437b85e74d4452194cc508a9eda15abd4652109090653b0e25aa985cdcdb05'
NORMAL_HELPER=HERE/'build_hair_sculpt_smooth_normals.py';NORMAL_HELPER_PIN='9f25470b9f656ccf8878f2335d1c4ac58adf1e03b6094fff73ba1947e2b85282'
sha=lambda b:hashlib.sha256(b).hexdigest()
def require(ok,message):
 if not ok:raise ValueError(message)
sys.dont_write_bytecode=True
for path,pin in [(HELPER,HELPER_PIN),(NORMAL_HELPER,NORMAL_HELPER_PIN)]:require(sha(path.read_bytes())==pin,'Frozen helper pin')
spec=importlib.util.spec_from_file_location('frozen_s_field',HELPER);f=importlib.util.module_from_spec(spec);spec.loader.exec_module(f)
spec2=importlib.util.spec_from_file_location('frozen_normal_rotation',NORMAL_HELPER);nr=importlib.util.module_from_spec(spec2);spec2.loader.exec_module(nr)

def grouped_indices(points,cell):
 keys=np.floor(points/cell).astype(np.int64);groups={}
 for j,key in enumerate(keys):groups.setdefault(tuple(key),[]).append(j)
 return {key:np.asarray(ids,dtype=np.int64) for key,ids in groups.items()}

def nearest_boundary_fade(p,faces,allowed,radius):
 crossing=~np.all(allowed[faces],axis=1)&np.any(allowed[faces],axis=1)
 seeds=np.unique(faces[crossing]);seeds=seeds[~allowed[seeds]]
 if not len(seeds):return np.ones(len(p))
 targets=np.flatnonzero(allowed);sg=grouped_indices(p[seeds],radius);tg=grouped_indices(p[targets],radius)
 distance=np.full(len(p),radius)
 for key,localids in tg.items():
  nearby=[sg[tuple(np.asarray(key)+[dx,dy,dz])] for dx in [-1,0,1] for dy in [-1,0,1] for dz in [-1,0,1] if tuple(np.asarray(key)+[dx,dy,dz]) in sg]
  if not nearby:continue
  source=seeds[np.concatenate(nearby)];ids=targets[localids]
  for start in range(0,len(ids),128):
   take=ids[start:start+128];dist2=np.sum((p[take,None,:]-p[source][None,:,:])**2,axis=2)
   distance[take]=np.minimum(radius,np.sqrt(dist2.min(axis=1)))
 fade=f.smooth(0,radius,distance);fade[~allowed]=0
 return fade

def analytic_positions(p,n,c,faces,variant):
 hm=f.hardmask(p,n,c);oldcross,oldarea=f.geometry(p,faces);allowed=hm.copy()
 tiny=oldarea<=1e-12;allowed[np.unique(faces[tiny])]=False
 _,cohort,counts=np.unique(np.round(p,6),axis=0,return_inverse=True,return_counts=True)
 cohortallowed=np.ones(len(counts),bool);np.logical_and.at(cohortallowed,cohort,allowed);allowed &= cohortallowed[cohort]
 x,y,z=p.T;spec=f.VARIANTS[variant]
 spatial=(1-f.smooth(.205,.245,np.abs(x)))*f.smooth(-.065,-.02,y)*(1-f.smooth(.29,.345,y))*f.smooth(.095,.125,-z)
 boundary=nearest_boundary_fade(p,faces,allowed,.025)
 paths=[]
 for guide in f.PATHS:
  knots=np.asarray(guide['xy']);knots=knots[np.argsort(knots[:,1])];s=f.NaturalCubic(knots[:,1],knots[:,0]);yc=np.clip(y,knots[0,1],knots[-1,1]);cx=s(yc);slope=s(yc,1)
  rr=np.abs(x-cx)/np.sqrt(1+slope*slope)/spec['sigma'];kernel=np.exp(-.5*rr*rr)*(1-f.smooth(2,3,rr))
  kernel[(y<knots[0,1])|(y>knots[-1,1])]=0;paths.append(kernel*guide['strength'])
 # Upper cap gets a quieter carve; lower flowing valleys retain full depth.
 upper=.55+.45*(1-f.smooth(.12,.23,y))
 delta=spec['depth']*np.max(paths,axis=0)*spatial*boundary*upper
 delta[~allowed]=0;minimum=np.full(len(counts),np.inf);np.minimum.at(minimum,cohort,delta);delta=minimum[cohort]
 q=p.copy();q[:,2]+=delta;q=(q*[-1,1,-1]).astype('<f4').astype(float)*[-1,1,-1]
 changed=np.any(q!=p,axis=1);require(np.all(hm[changed]),'Position outside source hard hair mask')
 after,newarea=f.geometry(q,faces);affected=np.any(changed[faces],axis=1);dot=np.einsum('ij,ij->i',oldcross,after);valid=oldarea>1e-12
 flips=(oldarea>0)&(dot<=0);newdeg=valid&(newarea<=1e-12);ratio=newarea[affected]/oldarea[affected];cos=dot[affected]/np.maximum((2*oldarea[affected])*(2*newarea[affected]),1e-300)
 require(not np.any(flips|newdeg),'Continuous field rejected: flips='+str(flips.sum())+' newdeg='+str(newdeg.sum()))
 edge2=sum(np.sum((p[faces[:,(j+1)%3]]-p[faces[:,j]])**2,axis=1) for j in range(3));quality=4*np.sqrt(3)*oldarea/np.maximum(edge2,1e-300)
 checks={'baseline_area_below_or_equal_1e_minus12':int(tiny.sum()),'affected_baseline_area_below_or_equal_1e_minus12':int((affected&tiny).sum()),'baseline_area_below_or_equal_1e_minus14':int((oldarea<=1e-14).sum()),'new_degenerate_faces_at_1e_minus12_relative_baseline':int(newdeg.sum()),'new_flipped_faces_relative_original':int(flips.sum()),'minimum_affected_original_area':float(oldarea[affected].min()),'minimum_affected_candidate_area':float(newarea[affected].min()),'minimum_affected_area_ratio':float(ratio.min()),'minimum_affected_face_cosine_vs_original':float(cos.min()),'baseline_triangle_quality_below_point1':int((quality<.1).sum()),'affected_original_triangle_quality_below_point1':int((affected&(quality<.1)).sum()),'minimum_affected_original_triangle_quality':float(quality[affected].min()),'triangle_quality_pin_policy':'Diagnostic only; no categorical sliver pins. All actually affected original faces pass relative cross-product orientation and non-collapse checks.','cohort_duplicate_count':int((counts>1).sum()),'vertices_in_duplicate_cohorts':int(counts[counts>1].sum()),'inset_cohort_tied':True}
 require(ratio.min()>.2 and cos.min()>.15,'Excessive continuous-field triangle distortion')
 return q,hm,changed,affected,checks,oldarea

def smooth_correction(p,n,delta,hm,normalmask,weights,sigma=.010,radius=.025,compatible_dot=.95):
 source=np.flatnonzero(hm);targets=np.flatnonzero(normalmask);sg=grouped_indices(p[source],radius);tg=grouped_indices(p[targets],radius);out=np.zeros_like(delta)
 for key,localids in tg.items():
  nearby=[sg[tuple(np.asarray(key)+[dx,dy,dz])] for dx in [-1,0,1] for dy in [-1,0,1] for dz in [-1,0,1] if tuple(np.asarray(key)+[dx,dy,dz]) in sg]
  src=source[np.concatenate(nearby)];ids=targets[localids]
  for start in range(0,len(ids),64):
   take=ids[start:start+64];dist2=np.sum((p[take,None,:]-p[src][None,:,:])**2,axis=2);ndot=n[take]@n[src].T
   weight=np.exp(-.5*dist2/(sigma*sigma))*weights[src][None,:]
   weight[(dist2>radius*radius)|(ndot<compatible_dot)]=0
   total=weight.sum(1);require(np.all(total>0),'Empty differential smoothing neighborhood')
   out[take]=(weight@delta[src])/total[:,None]
 return out,{'method':'Area-weighted spatial Gaussian smoothing of differential correction, then normalize(original stored smooth normal + smoothed correction).','sigma_world':sigma,'radius_world':radius,'original_normal_neighbor_compatibility_min_dot':compatible_dot,'neighbor_scope':'Source hard hair mask, including unchanged zero-correction neighbors to taper corrections; output limited to incident changed-face vertices within same hard hair mask.'}

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--variant',choices=['mild','moderate'],required=True);a=ap.parse_args();outdir=HERE/(a.variant+'-continuous-smooth')
 require(not outdir.exists(),'Fresh owned output directory')
 raw=f.SOURCE.read_bytes();require(sha(raw)==f.SOURCE_PIN,'Original19f source pin');require(sha(f.REF.read_bytes())==f.REF_PIN,'Reference pin')
 original,oldbin=f.read_glb(raw);prim=original['meshes'][0]['primitives'][0];p_local=f.accessor(original,oldbin,prim['attributes']['POSITION']);n_local=f.accessor(original,oldbin,prim['attributes']['NORMAL']);p=p_local.astype(float)*[-1,1,-1];n=n_local.astype(float)*[-1,1,-1];c=f.accessor(original,oldbin,prim['attributes']['COLOR_0']).astype(float);faces=f.accessor(original,oldbin,prim['indices']).reshape(-1,3)
 q,hm,changed,affected,checks,oldarea=analytic_positions(p,n,c,faces,a.variant)
 normalmask=np.zeros(len(p),bool);normalmask[np.unique(faces[affected])]=True;normalmask &=hm
 rotated,_,rotationstats=nr.smooth_rotation_normals(p,q,n,faces,normalmask);delta=rotated-n
 dualarea=np.zeros(len(p))
 for k in range(3):np.add.at(dualarea,faces[:,k],oldarea/3)
 correction,smoothingstats=smooth_correction(p,n,delta,hm,normalmask,np.maximum(dualarea,1e-16))
 qn=n.copy();qn[normalmask]=nr.unit(n[normalmask]+correction[normalmask]);qn=(qn*[-1,1,-1]).astype('<f4').astype(float)*[-1,1,-1];nchanged=np.any(qn!=n,axis=1);require(np.all(hm[nchanged]) and np.all(nchanged<=normalmask),'Normal scope escape')
 require(np.isfinite(qn).all() and np.max(np.abs(np.linalg.norm(qn,axis=1)-1))<2e-6,'Finite/unit normals')
 d=copy.deepcopy(original);binary=bytearray(oldbin);pa=f.append3(d,binary,q*[-1,1,-1]);na=f.append3(d,binary,qn*[-1,1,-1]);d['meshes'][0]['primitives'][0]['attributes'].update(POSITION=pa,NORMAL=na);d['buffers'][0]['byteLength']=len(binary)
 expected=copy.deepcopy(original['meshes']);expected[0]['primitives'][0]['attributes'].update(POSITION=pa,NORMAL=na);require(d['meshes']==expected,'Mesh scope');require(d['accessors'][:-2]==original['accessors'] and d['bufferViews'][:-2]==original['bufferViews'],'Accessor prefixes')
 for key in original:
  if key not in ('meshes','accessors','bufferViews','buffers'):require(d[key]==original[key],'Original metadata '+key)
 require(binary[:len(oldbin)]==oldbin,'Original BIN prefix');require(np.array_equal((qn*[-1,1,-1]).astype('<f4')[~nchanged],n_local[~nchanged]),'Protected original normals exact')
 js=json.dumps(d,separators=(',',':')).encode();js+=b' '*((-len(js))%4);binary+=b'\0'*((-len(binary))%4);result=struct.pack('<4sII',b'glTF',2,28+len(js)+len(binary))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(binary),0x004e4942)+binary
 outdir.mkdir();out=outdir/'alexia.glb';out.write_bytes(result);npz=outdir/'sculpt-masks.npz';np.savez_compressed(npz,hard_hair_mask_indices=np.flatnonzero(hm),changed_position_indices=np.flatnonzero(changed),changed_normal_indices=np.flatnonzero(nchanged),affected_face_indices=np.flatnonzero(affected))
 mask=copy.deepcopy(f.MASK);mask.update(position_mask_policy='Hard original hair mask, protected near-degenerate incident vertices and tied original-position cohorts only. No quality/geometric-normal categorical pins and no face-neighbor erosion. Smooth Euclidean boundary-distance fade, no vertex-color amplitude modulation.',normal_mask_policy='Only incident changed-face vertices also inside the original hard hair mask; protected original normals exact.',source_geometric_face_protection={'pin_incident_original_area_below_or_equal':1e-12,'triangle_quality_pin':False,'geometric_facing_pin':False,'opposing_normal_pin':False},confidence_smoothing_neighbor_iterations=0,final_inset_smoothing_neighbor_iterations=0,continuous_field={'boundary_distance':'Euclidean distance to protected original boundary vertices, smoothstep(0,.025,d)','upper_depth_factor':'.55 + .45*(1-smoothstep(.12,.23,worldY))','color_normal_amplitude_modulation':False})
 pd=q-p;mag=np.linalg.norm(pd,axis=1)
 report={'schema':'crwt.alexia.rear_hair_sculpt_continuous.v1','approved':False,'gameIntegrated':False,'passed':True,'variant':a.variant+'-continuous-smooth','source_path':str(f.SOURCE.resolve()),'source_sha256':f.SOURCE_PIN,'reference_path':str(f.REF.resolve()),'reference_sha256':f.REF_PIN,'candidate_path':str(out.resolve()),'candidate_sha256':sha(result),'candidate_bytes':len(result),'recipe_path':str(pathlib.Path(__file__).resolve()),'recipe_sha256':sha(pathlib.Path(__file__).read_bytes()),'recipe_helpers':[{'path':str(HELPER),'sha256':HELPER_PIN,'used_functions':'read_glb, accessor, append3, smooth, NaturalCubic, hardmask, geometry; manually frozen PATHS/VARIANTS only. Rejected carve() is not called.'},{'path':str(NORMAL_HELPER),'sha256':NORMAL_HELPER_PIN,'used_functions':'smooth_rotation_normals, unit only. No rejected geometry GLB is read.'}],'rejected_candidate_glb_dependency':False,'source_BIN_byte_prefix_identical':True,'original_accessors_and_bufferViews_identical':True,'unchanged_non_position_normal_accessors':True,'unchanged_mesh1_mesh2':True,'all_node_transforms_materials_images_uv_colors_indices_skins_animations_identical':True,'original_total_vertices':sum(original['accessors'][pp['attributes']['POSITION']]['count'] for mesh in original['meshes'] for pp in mesh['primitives']),'original_core_vertices':len(p),'original_core_triangles':len(faces),'original_mesh_vertices_changed':int(changed.sum()),'original_normals_changed':int(nchanged.sum()),'affected_original_faces':int(affected.sum()),'hard_hair_mask_vertex_count':int(hm.sum()),'mesh_count_before_after':[3,3],'added_meshes':0,'added_nodes':0,'added_materials':0,'added_vertices':0,'added_triangles':0,'new_position_accessor':pa,'new_normal_accessor':na,'old_position_accessor':prim['attributes']['POSITION'],'old_normal_accessor':prim['attributes']['NORMAL'],'mask_parameters':mask,'mask_npz_path':str(npz.resolve()),'mask_npz_sha256':sha(npz.read_bytes()),'guide_paths':f.PATHS,'sculpt_parameters':f.VARIANTS[a.variant],'maximum_world_delta':float(mag.max()),'mean_changed_world_delta':float(mag[changed].mean()),'world_delta_bounds':[pd.min(0).tolist(),pd.max(0).tolist()],'changed_world_bounds':[q[changed].min(0).tolist(),q[changed].max(0).tolist()],'position_xy_byte_exact':True,'geometry_checks':checks,'normal_correction':rotationstats,'normal_differential_smoothing':smoothingstats,'scope':'Continuous shallow S-field carving of original rear hair surface. Original smooth normals plus spatially smoothed deformation response. Exact original protected positions/normals, colors, UV, topology and existing meshes1/2 retained.','limits':['Manual approximate reference-supported S paths, inferred depth/attachments; no reference precision claim.','Numerical passing remains provisional until actual gray/color visual review.','Original near-degeneracies and low-quality triangles are recorded separately; no exhaustive self-intersection certificate.','No separate deep open hair gaps, rigging, production approval or game integration.']}
 (outdir/'alexia.geometry-proof.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps({k:report[k] for k in ['variant','candidate_path','candidate_sha256','candidate_bytes','original_mesh_vertices_changed','original_normals_changed','maximum_world_delta','geometry_checks']}))

if __name__=='__main__':main()

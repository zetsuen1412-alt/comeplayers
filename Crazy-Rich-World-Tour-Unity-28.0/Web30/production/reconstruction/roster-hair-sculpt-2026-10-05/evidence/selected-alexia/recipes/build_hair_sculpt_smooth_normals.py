"""Preserve original smooth normal style while responding to the frozen carve.

Direct-from-19f derivatives: v1 POSITION arrays are reused exactly; original
smooth normals receive only differential geometric rotation. Compatible exact
position seams share before/after normal accumulation. Everything outside
changed-face rear-hair adjacency is byte-exact. No colors/topology are changed.
"""
import argparse,copy,hashlib,importlib.util,json,pathlib,struct,sys
import numpy as np
HERE=pathlib.Path(__file__).resolve().parent
HELPER=HERE/'build_hair_sculpt.py'
HELPER_PIN='75437b85e74d4452194cc508a9eda15abd4652109090653b0e25aa985cdcdb05'
SOURCE_PINS={'mild':'c1ec938ea64257cf9c081841c9c2454e9dffd6ed3c334541959cb8846081972b','moderate':'87d0c3d7aef22a0ce8c3aadc32934329100e6994725252e3bddb9d57a288d624'}
sha=lambda b:hashlib.sha256(b).hexdigest()
def require(condition,message):
 if not condition:raise ValueError(message)
sys.dont_write_bytecode=True
require(sha(HELPER.read_bytes())==HELPER_PIN,'Frozen helper pin')
spec=importlib.util.spec_from_file_location('frozen_sculpt_recipe',HELPER);frozen=importlib.util.module_from_spec(spec);spec.loader.exec_module(frozen)

def unit(v):
 length=np.linalg.norm(v,axis=1);require(np.all(length>0),'Zero geometric normal')
 return v/length[:,None]

def smooth_rotation_normals(p,q,n,faces,mask):
 before,_=frozen.geometry(p,faces);after,_=frozen.geometry(q,faces)
 g0=np.zeros_like(p);g1=np.zeros_like(q)
 for k in range(3):np.add.at(g0,faces[:,k],before);np.add.at(g1,faces[:,k],after)
 _,cohort,counts=np.unique(p,axis=0,return_inverse=True,return_counts=True)
 nmean=np.zeros((len(counts),3));np.add.at(nmean,cohort,n)
 nmean=unit(nmean)
 ndot=np.einsum('ij,ij->i',n,nmean[cohort])
 minimum_dot=np.full(len(counts),np.inf);np.minimum.at(minimum_dot,cohort,ndot)
 # Tight original-normal agreement is typical of UV duplicates. If vectors
 # diverge, preserve the original edge's independent geometric correction.
 compatibility_threshold=.999
 compatible=(minimum_dot>=compatibility_threshold)&(counts>1)
 pooled0=np.zeros_like(nmean);pooled1=np.zeros_like(nmean);np.add.at(pooled0,cohort,g0);np.add.at(pooled1,cohort,g1)
 weld=compatible[cohort]
 g0[weld]=pooled0[cohort[weld]];g1[weld]=pooled1[cohort[weld]]
 selected=np.flatnonzero(mask);a=unit(g0[selected]);b=unit(g1[selected])
 cosine=np.einsum('ij,ij->i',a,b);require(np.all(cosine>-.999),'Opposing normal rotation')
 axis=np.cross(a,b);w=1+cosine;qlength=np.sqrt(np.einsum('ij,ij->i',axis,axis)+w*w)
 qv=axis/qlength[:,None];qw=w/qlength
 ns=n[selected]
 rotated=ns+2*np.cross(qv,np.cross(qv,ns)+qw[:,None]*ns)
 out=n.copy();out[selected]=rotated
 out=(out*[-1,1,-1]).astype('<f4').astype(float)*[-1,1,-1]
 changed=np.any(out!=n,axis=1)
 require(np.all(changed<=mask),'Normal change outside mask')
 normlength=np.linalg.norm(out,axis=1);require(np.isfinite(out).all() and np.max(np.abs(normlength-1))<2e-6,'Finite/unit smooth normals')
 stats={'method':'Shortest quaternion rotation of original stored smooth normal from original to deformed area-weighted geometric vertex normal. Original normal angular offset and smoothing style are preserved; no absolute geometric normal replacement.',
  'geometric_accumulation':'Area-weighted triangle cross products before/after, all incident original triangles.',
  'weld_policy':'Exact original-position cohorts share geometric accumulation only when every stored source normal has dot>=.999 to the cohort mean normal. Original normal discontinuities retain separate geometric corrections.',
  'exact_original_position_cohort_count':len(counts),'exact_duplicate_cohort_count':int((counts>1).sum()),'compatible_welded_duplicate_cohort_count':int(compatible.sum()),'incompatible_duplicate_cohort_count':int(((counts>1)&~compatible).sum()),'compatible_welded_vertex_count':int(weld.sum()),'compatible_welded_normal_mask_vertex_count':int((weld&mask).sum()),'original_normal_compatibility_min_dot_to_mean':compatibility_threshold,'maximum_geometric_normal_rotation_degrees':float(np.degrees(np.arccos(np.clip(cosine,-1,1))).max()),'maximum_normal_unit_length_error':float(np.abs(normlength-1).max()),'normal_delta_maximum_length':float(np.linalg.norm(out-n,axis=1).max()),'normal_mask_vertex_count':int(mask.sum()),'original_normals_changed':int(changed.sum())}
 return out,changed,stats

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--variant',choices=list(SOURCE_PINS),required=True);a=ap.parse_args();outdir=HERE/(a.variant+'-smooth-normals')
 require(not outdir.exists(),'Fresh owned derivative path required')
 raw=frozen.SOURCE.read_bytes();require(sha(raw)==frozen.SOURCE_PIN,'Original source pin');require(sha(frozen.REF.read_bytes())==frozen.REF_PIN,'Reference pin')
 original,oldbin=frozen.read_glb(raw);baseprimitive=original['meshes'][0]['primitives'][0]
 p_local=frozen.accessor(original,oldbin,baseprimitive['attributes']['POSITION']);n_local=frozen.accessor(original,oldbin,baseprimitive['attributes']['NORMAL']);c=frozen.accessor(original,oldbin,baseprimitive['attributes']['COLOR_0']).astype(float)
 p=p_local.astype(float)*[-1,1,-1];n=n_local.astype(float)*[-1,1,-1];faces=frozen.accessor(original,oldbin,baseprimitive['indices']).reshape(-1,3)
 geopath=HERE/a.variant/'alexia.glb';georaw=geopath.read_bytes();require(sha(georaw)==SOURCE_PINS[a.variant],'Frozen v1 geometry pin');gd,gb=frozen.read_glb(georaw)
 q_local=frozen.accessor(gd,gb,gd['meshes'][0]['primitives'][0]['attributes']['POSITION']);q=q_local.astype(float)*[-1,1,-1]
 changed=np.any(q_local!=p_local,axis=1);affected=np.any(changed[faces],axis=1);mask=np.zeros(len(p),bool);mask[np.unique(faces[affected])]=True
 hm=frozen.hardmask(p,n,c);require(np.all(hm[changed]) and np.all(hm[mask]),'Position/normal adjacency outside explicit source hair mask')
 qn,nchanged,normalstats=smooth_rotation_normals(p,q,n,faces,mask)
 d=copy.deepcopy(original);binary=bytearray(oldbin);pa=frozen.append3(d,binary,q_local);na=frozen.append3(d,binary,qn*[-1,1,-1]);d['meshes'][0]['primitives'][0]['attributes'].update(POSITION=pa,NORMAL=na);d['buffers'][0]['byteLength']=len(binary)
 expected=copy.deepcopy(original['meshes']);expected[0]['primitives'][0]['attributes'].update(POSITION=pa,NORMAL=na)
 require(d['meshes']==expected and d['meshes'][1:]==original['meshes'][1:],'Mesh record scope')
 require(d['accessors'][:-2]==original['accessors'] and d['bufferViews'][:-2]==original['bufferViews'],'Original accessor/view prefixes')
 for key in original:
  if key not in ('meshes','accessors','bufferViews','buffers'):require(d[key]==original[key],'Unchanged document '+key)
 require(binary[:len(oldbin)]==oldbin,'Original BIN prefix')
 require(np.array_equal((qn*[-1,1,-1]).astype('<f4')[~nchanged],n_local[~nchanged]),'Protected normals exact')
 js=json.dumps(d,separators=(',',':')).encode();js+=b' '*((-len(js))%4);binary+=b'\0'*((-len(binary))%4)
 result=struct.pack('<4sII',b'glTF',2,28+len(js)+len(binary))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(binary),0x004e4942)+binary
 cd,cb=frozen.read_glb(result);require(np.array_equal(frozen.accessor(cd,cb,pa),q_local),'Position array changed from frozen v1')
 geo_proofpath=HERE/a.variant/'alexia.geometry-proof.json';geoproof=json.loads(geo_proofpath.read_text(encoding='utf-8'));require(geoproof['candidate_sha256']==SOURCE_PINS[a.variant] and geoproof['recipe_sha256']==HELPER_PIN,'Geometry proof pins')
 outdir.mkdir();out=outdir/'alexia.glb';out.write_bytes(result);npz=outdir/'sculpt-masks.npz';np.savez_compressed(npz,hard_hair_mask_indices=np.flatnonzero(hm),changed_position_indices=np.flatnonzero(changed),changed_normal_indices=np.flatnonzero(nchanged),affected_face_indices=np.flatnonzero(affected))
 report=copy.deepcopy(geoproof);report.update(schema='crwt.alexia.rear_hair_sculpt_smooth_normals.v1',variant=a.variant+'-smooth-normals',candidate_path=str(out.resolve()),candidate_sha256=sha(result),candidate_bytes=len(result),recipe_path=str(pathlib.Path(__file__).resolve()),recipe_sha256=sha(pathlib.Path(__file__).read_bytes()),geometry_recipe_path=str(HELPER),geometry_recipe_sha256=HELPER_PIN,geometry_source_path=str(geopath.resolve()),geometry_source_sha256=SOURCE_PINS[a.variant],geometry_source_proof_path=str(geo_proofpath.resolve()),geometry_source_proof_sha256=sha(geo_proofpath.read_bytes()),position_array_matches_geometry_source_exact=True,normal_correction=normalstats,original_normals_changed=int(nchanged.sum()),mask_npz_path=str(npz.resolve()),mask_npz_sha256=sha(npz.read_bytes()))
 report['scope']='Same actual S-valley position deformation as frozen v1, with original smooth normals differentially rotated inside changed-face rear-hair adjacency only. All protected positions/normals, UV/colors/topology, mesh1/2, transforms/materials/images remain exact.'
 report['limits'].append('The earlier absolute-normal v1 visually regressed in gray and is rejected; this differential-normal derivative needs new actual gray review. Numerical face safety is not visual approval.')
 report['mask_parameters']['normal_mask_policy']='Only original vertices incident to POSITION-changed faces and inside the original hard hair mask receive differential rotations; all other stored normals are retained byte-exact.'
 (outdir/'alexia.geometry-proof.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
 print(json.dumps({k:report[k] for k in ['variant','candidate_path','candidate_sha256','candidate_bytes','original_mesh_vertices_changed','original_normals_changed','position_array_matches_geometry_source_exact','normal_correction']}))

if __name__=='__main__':main()

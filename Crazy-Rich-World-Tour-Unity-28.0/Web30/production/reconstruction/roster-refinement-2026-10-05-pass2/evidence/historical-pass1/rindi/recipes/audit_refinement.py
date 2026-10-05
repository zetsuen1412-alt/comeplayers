"""Read-only exact integrity and new bridge-contact audit (run with Blender)."""
from pathlib import Path
import sys,json,hashlib,argparse,copy
from collections import Counter
import numpy as np
ROOT=Path(__file__).resolve().parent;sys.path.insert(0,str(ROOT.parents[1]/'local-sculpt-toolchain'));sys.path.insert(0,str(ROOT.parents[1]/'model-rebuild/tools'))
import audit_hair_caps_exact as exact
from audit_glb_components import load_glb,read_accessor
from validate_roster_candidate import validate_model
p=argparse.ArgumentParser();p.add_argument('--candidate-dir',type=Path,required=True);a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);folder=a.candidate_dir.resolve();out=folder/'independent-integrity-and-bridge-audit.json';assert not out.exists()
source=ROOT.parents[2]/'outputs/model-review-2026-10-04/viewer/models/rindi.glb';candidate=folder/'rindi-reaching-hand-candidate.glb';proof_path=folder/'hand-refinement-proof.json';proof=json.loads(proof_path.read_text())
raw,doc,binary,_=load_glb(source);cr,c,cb,_=load_glb(candidate);sha=lambda x:hashlib.sha256(x).hexdigest();assert sha(raw)==proof['source_sha256'] and sha(cr)==proof['candidate_sha256']
def geometry(d,b):
 pr=d['meshes'][0]['primitives'][0];ps=read_accessor(d,b,pr['attributes']['POSITION'])[0];uv=read_accessor(d,b,pr['attributes']['TEXCOORD_0'])[0];no=read_accessor(d,b,pr['attributes']['NORMAL'])[0];fs=read_accessor(d,b,pr['indices'])[0].reshape(-1,3);return ps,uv,no,fs
op,ou,on,of=geometry(doc,binary);v,u,n,f=geometry(c,cb)
assert cb[:len(binary)]==binary
for old,new in ((op,v),(ou,u),(on,n)):assert old.tobytes()==new[:len(old)].tobytes()
for key in ('nodes','scenes','scene','materials','images','textures','samplers','asset'):assert c.get(key)==doc.get(key)
assert c['bufferViews'][:len(doc['bufferViews'])]==doc['bufferViews'] and c['accessors'][:len(doc['accessors'])]==doc['accessors']
removed=set(proof['removed_source_face_ids']);retained=np.asarray([row for i,row in enumerate(of) if i not in removed],dtype=np.int64);nr=len(retained);assert np.array_equal(f[:nr],retained)
nb=len(proof['bridge_faces']);assert np.array_equal(f[nr:nr+nb],np.asarray(proof['bridge_faces']))
actual=validate_model(cr)
# Canonical exact-position IDs allow intentional UV-seam duplicate vertices.
weld={};canonical=[];welded=[]
for point in v:
 key=tuple(map(float,point))
 if key not in weld:weld[key]=len(welded);welded.append(key)
 canonical.append(weld[key])
vf=np.asarray(welded,dtype=np.float64);wf=np.asarray(canonical,dtype=np.int64)[f];ret=wf[:nr];bridge=wf[nr:nr+nb];hand=wf[nr+nb:]
parent=list(range(len(vf)))
def find(i):
 while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
 return i
for face in wf:
 a0=find(int(face[0]));parent[find(int(face[1]))]=a0;parent[find(int(face[2]))]=a0
new_active=set(map(int,wf[nr:].ravel()));body_roots={find(int(x)) for x in ret.ravel()};assert all(find(x) in body_roots for x in new_active)
all_improper=[];expected=0;tested=0;broad=0
def check(left,right,label,symmetric=False):
 global expected,tested,broad
 ts=vf[right];low=np.nextafter(ts.min(axis=1),-np.inf);high=np.nextafter(ts.max(axis=1),np.inf)
 for i,face in enumerate(left):
  t=vf[face];lo=np.nextafter(t.min(axis=0),-np.inf);hi=np.nextafter(t.max(axis=0),np.inf);choices=np.flatnonzero(np.all(high>=lo,axis=1)&np.all(low<=hi,axis=1))
  if symmetric:choices=choices[choices<i]
  broad+=len(choices)
  for j in choices:
   record=exact.pair_record(vf,face,right[j],i,int(j));tested+=1
   if record['intersection_vertex_count'] and not record['contact_only_on_shared_topological_feature']:all_improper.append({'category':label,**record})
   elif record['intersection_vertex_count']:expected+=1
# First safely exclude retained triangles disjoint from the entire hand patch;
# every remaining new/retained pair receives outward AABB and exact predicates.
patch_bounds=vf[wf[nr:]].reshape(-1,3);plo=np.nextafter(patch_bounds.min(axis=0),-np.inf);phi=np.nextafter(patch_bounds.max(axis=0),np.inf);rt=vf[ret];rlo=np.nextafter(rt.min(axis=1),-np.inf);rhi=np.nextafter(rt.max(axis=1),np.inf);chosen=np.flatnonzero(np.all(rhi>=plo,axis=1)&np.all(rlo<=phi,axis=1));selected_ret=ret[chosen]
check(wf[nr:],selected_ret,'new-patch/retained')
check(bridge,hand,'bridge/new-voxel-hand')
check(bridge,bridge,'bridge/bridge',True)
report={'schema':'crwt.rindi_hand_exact_integrity.v1','candidate_sha256':sha(cr),'source_sha256':sha(raw),'generator_proof_sha256':sha(proof_path.read_bytes()),'source_unchanged':source.read_bytes()==raw,'original_bin_prefix_identical':True,'all_source_position_uv_normal_bytes_identical':True,'retained_source_triangle_indices_and_order_identical':True,'original_materials_images_nodes_orientation_identical':True,'removed_hand_face_count':len(removed),'original_vertex_position_delta_count':0,'actual':actual,'new_patch_vertices_connected_to_body':True,'welded_component_count':len({find(int(x)) for x in wf.ravel()}),'exhaustive_new_patch_retained_pairs':len(wf[nr:])*nr,'retained_triangles_surviving_global_patch_aabb':len(chosen),'bridge_hand_pairs_covered':len(bridge)*len(hand),'bridge_bridge_pairs_covered':len(bridge)*(len(bridge)-1)//2,'aabb_overlap_pairs':broad,'exact_pairs_tested':tested,'expected_shared_feature_contacts':expected,'improper_intersection_count':len(all_improper),'improper_intersections':all_improper,'no_new_patch_retained_or_bridge_crossings':not all_improper,'method':'Outward float64 AABB exclusion, then exact binary-coordinate integer SAT and rational complete intersection. UV seams canonicalized by exact position.','voxel_hand_internal_pair_intersections_tested':False,'production_approved':False,'limits':['Voxel hand internal face pairs and retained/retained global self-intersections are outside this audit.','Hand shape/skin and hidden thickness remain a visual candidate, not final approval.']}
out.write_text(json.dumps(report,indent=2));print(json.dumps({k:report[k] for k in ('candidate_sha256','exhaustive_new_patch_retained_pairs','exact_pairs_tested','improper_intersection_count','new_patch_vertices_connected_to_body')}),flush=True)

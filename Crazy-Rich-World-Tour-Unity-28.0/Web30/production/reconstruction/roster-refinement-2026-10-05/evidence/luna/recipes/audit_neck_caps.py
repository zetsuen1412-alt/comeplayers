"""Exact finite-coordinate audit of new neck caps against retained source only."""
import sys,pathlib,json,hashlib
root=pathlib.Path(__file__).resolve().parents[3]
sys.path.insert(0,str(root/'work/pydeps'));sys.path.insert(0,str(root/'work/model-rebuild/Mochi-tail'));sys.path.insert(0,str(root/'work/local-sculpt-toolchain'))
import numpy as np
from inspect_components import read_glb,accessor
from audit_hair_caps_exact import pair_record
folder=pathlib.Path(__file__).parent/'trial-v1';source=folder/'luna-staff-head-refined-candidate.glb'
raw,doc,binary=read_glb(source);proof=json.loads(source.with_suffix('.source-preservation.json').read_text());p=doc['meshes'][0]['primitives'][0]
vertices=np.asarray(accessor(doc,binary,p['attributes']['POSITION']),dtype=np.float64)
faces=np.asarray([i[0] for i in accessor(doc,binary,p['indices'])],dtype=np.int64).reshape(-1,3)
unique,inverse=np.unique(vertices,axis=0,return_inverse=True);faces=inverse[faces];vertices=unique
retained=proof['retained_source_faces'];cap_ids=list(range(retained,len(faces)));assert len(cap_ids)==11
tri=vertices[faces];lo=tri.min(axis=1);hi=tri.max(axis=1)
checked=[];failures=[];candidate_pairs=0
for cap in cap_ids:
    ids=np.flatnonzero(((hi[:retained]>=lo[cap])&(lo[:retained]<=hi[cap])).all(axis=1))
    candidate_pairs+=len(ids)
    for other in ids:
        r=pair_record(vertices,faces[cap],faces[other],cap,other)
        if r['intersection_vertex_count']:checked.append(r)
        if r['intersection_vertex_count'] and not r['contact_only_on_shared_topological_feature']:failures.append(r)
for i,cap in enumerate(cap_ids):
    for other in cap_ids[:i]:
        r=pair_record(vertices,faces[cap],faces[other],cap,other)
        if r['intersection_vertex_count']:checked.append(r)
        if r['intersection_vertex_count'] and not r['contact_only_on_shared_topological_feature']:failures.append(r)
report={'candidate_sha256':hashlib.sha256(raw).hexdigest(),'new_cap_faces':11,'retained_faces':retained,'complete_new_cap_retained_pair_coverage':retained*11,'aabb_candidate_pairs_exact_tested':candidate_pairs,'cap_cap_pairs':55,'improper_contacts':len(failures),'failures':failures,'allowed_shared_feature_contacts':checked,'scope':'New caps vs retained source and cap/cap only; not retained/retained or accessory volume intersections','passed':not failures,'visual_approved':False}
out=folder/'neck-cap-exact-audit.json';assert not out.exists();out.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps({k:v for k,v in report.items() if k not in ['failures','allowed_shared_feature_contacts']}))
sys.exit(0 if not failures else 1)

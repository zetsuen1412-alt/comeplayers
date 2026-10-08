"""Read-only exact-binary cap/retained triangle intersection audit.

Exhaustive coordinate AABB exclusion followed by arbitrary-precision integer
separating axes and exact rational intersection clipping. Shared mesh vertices
or edges are allowed contacts only if the complete intersection is contained
in that specific shared feature. Does not audit retained/retained pairs.
"""
import argparse, hashlib, json, pathlib, sys
from fractions import Fraction as Q
import numpy as np
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "v11-diagnostic"))
from audit_glb_components import load_glb, read_accessor


def sub(a, b): return tuple(x-y for x, y in zip(a, b))
def dot(a, b): return sum(x*y for x, y in zip(a, b))
def cross(a, b): return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])
def normal(t): return cross(sub(t[1], t[0]), sub(t[2], t[0]))
def orient(a, b, p, keep):
    i, j = keep
    return (b[i]-a[i])*(p[j]-a[j])-(b[j]-a[j])*(p[i]-a[i])


def integers(points):
    ratios = [[float(v).as_integer_ratio() for v in row] for row in points]
    d = max(q for row in ratios for n, q in row)
    return [tuple(n*(d//q) for n, q in row) for row in ratios]


def strict_axis_separated(a, b):
    ea = [sub(a[(i+1)%3], a[i]) for i in range(3)]
    eb = [sub(b[(i+1)%3], b[i]) for i in range(3)]
    na, nb = normal(a), normal(b)
    # In-plane edge normals also cover coplanar disjoint triangles.
    axes = [na, nb] + [cross(x,y) for x in ea for y in eb] + [cross(na,x) for x in ea] + [cross(nb,x) for x in eb]
    for axis in axes:
        if axis == (0,0,0): continue
        pa, pb = [dot(p,axis) for p in a], [dot(p,axis) for p in b]
        if max(pa) < min(pb) or max(pb) < min(pa): return True
    return False


def in_triangle(p, t, n):
    if dot(n, sub(p,t[0])) != 0: return False
    signs = [dot(n, cross(sub(t[(i+1)%3],t[i]),sub(p,t[i]))) for i in range(3)]
    return all(v >= 0 for v in signs)


def clip_coplanar(a, b, n):
    keep = tuple(i for i in range(3) if i != max(range(3),key=lambda k:abs(n[k])))
    s = 1 if orient(b[0],b[1],b[2],keep)>0 else -1
    polygon = [tuple(Q(x) for x in p) for p in a]
    for i in range(3):
        out = []
        if not polygon: break
        for p, q in zip(polygon, polygon[1:]+polygon[:1]):
            dp, dq = s*orient(b[i],b[(i+1)%3],p,keep), s*orient(b[i],b[(i+1)%3],q,keep)
            if dp >= 0: out.append(p)
            if (dp < 0) != (dq < 0):
                t = Q(dp,dp-dq)
                out.append(tuple(p[k]+t*(q[k]-p[k]) for k in range(3)))
        polygon = out
    return set(polygon)


def exact_intersection(a, b):
    na, nb = normal(a), normal(b)
    if na == (0,0,0) or nb == (0,0,0): raise ValueError("Degenerate triangle encountered")
    if strict_axis_separated(a,b): return set(), "strict-separation"
    if all(dot(nb,sub(p,b[0])) == 0 for p in a):
        return clip_coplanar(a,b,nb), "coplanar-rational-clipping"
    points = set()
    for t, other, n in [(a,b,nb),(b,a,na)]:
        for i in range(3):
            p, q = t[i],t[(i+1)%3]
            dp, dq = dot(n,sub(p,other[0])), dot(n,sub(q,other[0]))
            if dp == 0 and in_triangle(p,other,n): points.add(tuple(Q(x) for x in p))
            if dp*dq < 0:
                f = Q(dp,dp-dq)
                r = tuple(Q(p[k])+f*(q[k]-p[k]) for k in range(3))
                if in_triangle(r,other,n): points.add(r)
    return points, "noncoplanar-rational-edge-plane"


def expected_feature_only(points, shared):
    if not points: return True
    if len(shared) == 1:
        return all(p == shared[0] for p in points)
    if len(shared) == 2:
        a, b = shared; d = sub(b,a); k=max(range(3),key=lambda i:abs(d[i]))
        if d[k] == 0: return False
        return all(cross(sub(p,a),d) == (0,0,0) and 0 <= Q(p[k]-a[k],d[k]) <= 1 for p in points)
    return False


def pair_record(vertices, face_a, face_b, id_a, id_b):
    coords = integers([*vertices[face_a],*vertices[face_b]])
    a,b=coords[:3],coords[3:]
    points, method=exact_intersection(a,b)
    shared_ids=sorted(set(map(int,face_a)) & set(map(int,face_b)))
    # All six coordinates use the same exact power-of-two scale.
    shared=[a[list(map(int,face_a)).index(i)] for i in shared_ids]
    valid=expected_feature_only(points,shared)
    return {"cap_id":int(id_a),"other_face_id":int(id_b),"method":method,
            "intersection_vertex_count":len(points),"shared_vertex_ids":shared_ids,
            "contact_only_on_shared_topological_feature":valid,
            "intersection_coordinates_in_exact_scaled_units":[[str(v) for v in p] for p in sorted(points)]}


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--candidate",type=pathlib.Path,required=True)
    p.add_argument("--proof",type=pathlib.Path,required=True)
    p.add_argument("--out",type=pathlib.Path,required=True)
    args=p.parse_args()
    if args.out.exists(): raise FileExistsError("Preserve prior audit")
    proof_raw=args.proof.read_bytes(); proof=json.loads(proof_raw)
    raw,doc,binary,chunks=load_glb(args.candidate)
    sha=lambda x:hashlib.sha256(x).hexdigest()
    if sha(raw) != proof["candidate_sha256"]: raise ValueError("Candidate hash differs from preserved edit proof")
    primitive=doc["meshes"][0]["primitives"][0]
    vertices,pmeta=read_accessor(doc,binary,primitive["attributes"]["POSITION"])
    indices,imeta=read_accessor(doc,binary,primitive["indices"])
    faces=indices.reshape(-1,3).astype(np.int64); vertices=vertices.astype(np.float64)
    nr=proof["retained_faces"]; caps=np.array(proof["new_cap_source_vertex_ids"],dtype=np.int64)
    if len(faces)!=proof["candidate_faces"] or len(caps)!=31 or not np.array_equal(faces[nr:],caps): raise ValueError("Candidate caps/order changed")
    if pmeta["raw_attribute_sha256"] != proof["source_position_bytes_sha256"]: raise ValueError("Candidate positions changed")
    retained=faces[:nr]; triangles=vertices[retained]
    low=np.nextafter(triangles.min(axis=1),-np.inf); high=np.nextafter(triangles.max(axis=1),np.inf)
    improper=[]; expected_contacts=[]; tested=0; broad=0; strict=0
    for ci,cap in enumerate(caps):
        t=vertices[cap]; lo=np.nextafter(t.min(axis=0),-np.inf); hi=np.nextafter(t.max(axis=0),np.inf)
        candidates=np.flatnonzero(np.all(high>=lo,axis=1)&np.all(low<=hi,axis=1))
        broad+=len(candidates)
        for ri in candidates:
            rec=pair_record(vertices,cap,retained[ri],ci,int(ri)); tested+=1
            if rec["intersection_vertex_count"] == 0: strict+=1
            elif rec["contact_only_on_shared_topological_feature"]: expected_contacts.append(rec)
            else: improper.append(rec)
        for cj in range(ci):
            rec=pair_record(vertices,cap,caps[cj],ci,nr+cj); tested+=1
            if rec["intersection_vertex_count"] == 0: strict+=1
            elif rec["contact_only_on_shared_topological_feature"]: expected_contacts.append(rec)
            else: improper.append(rec)
        print(json.dumps({"cap":ci+1,"of":len(caps),"broad_phase_retained_pairs":len(candidates),"improper_contacts_so_far":len(improper)}),flush=True)
    report={"schema":"crwt.read_only_hair_cap_intersections.v1","candidate_sha256":sha(raw),"edit_proof_sha256":sha(proof_raw),
            "retained_triangles":nr,"new_cap_triangles":len(caps),"exhaustive_cap_retained_pair_count":nr*len(caps),
            "aabb_overlap_retained_pair_count":broad,"exact_narrow_phase_pair_count_including_cap_cap":tested,
            "disjoint_exact_narrow_pairs":strict,"expected_shared_feature_contact_pairs":len(expected_contacts),
            "improper_contact_pair_count":len(improper),"improper_contact_pairs":improper,
            "expected_contact_pairs":expected_contacts,
            "no_new_cap_intersections_beyond_shared_topological_features":len(improper)==0,
            "method":"Every cap vs every retained triangle excluded by outward float64 AABB bounds or tested with exact integer separating axes and rational complete convex intersection. Coplanar polygons clipped exactly; noncoplanar intersection endpoints obtained from both triangle edge/plane directions. All cap/cap pairs tested. Float32 positions promoted exactly; pair coordinates scaled to common exact power-of-two integer units.",
            "source_unchanged":sha(args.candidate.read_bytes())==sha(raw) and sha(args.proof.read_bytes())==sha(proof_raw),
            "retained_retained_self_intersections_tested":False,"production_visual_approval":False,
            "limitation":"This tests new cap contacts only. It does not establish global embedding, repaired anatomy, approved hair shape, texture or rig readiness."}
    args.out.parent.mkdir(parents=True,exist_ok=True)
    args.out.write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({k:report[k] for k in ["candidate_sha256","exhaustive_cap_retained_pair_count","exact_narrow_phase_pair_count_including_cap_cap","improper_contact_pair_count","no_new_cap_intersections_beyond_shared_topological_features","source_unchanged"]}),flush=True)


if __name__=="__main__":main()

"""Independent read-only baseline/candidate audit; does not certify visual fidelity."""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import struct
import numpy as np

EXPECTED_SOURCE_SHA = '19f007950c8651e81ee2c49374f28af3785e3710171f142324bf67cb7ce74b24'
DTYPES = {5120:'<i1',5121:'<u1',5122:'<i2',5123:'<u2',5125:'<u4',5126:'<f4'}
WIDTH = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}
AREA2_LIMIT = 1e-14
PRACTICAL_AREA2_LIMIT = 2e-12

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def parse(path):
    raw = Path(path).read_bytes()
    assert struct.unpack_from('<4sII',raw) == (b'glTF',2,len(raw))
    jl,jt = struct.unpack_from('<II',raw,12)
    assert jt == 0x4e4f534a
    d = json.loads(raw[20:20+jl])
    bl,bt = struct.unpack_from('<II',raw,20+jl)
    assert bt == 0x004e4942 and 28+jl+bl == len(raw)
    assert len(d['buffers'])==1 and 'uri' not in d['buffers'][0]
    assert d['buffers'][0]['byteLength'] <= bl <= d['buffers'][0]['byteLength']+3
    return raw,d,raw[28+jl:]

def read(d,b,i):
    a=d['accessors'][i];v=d['bufferViews'][a['bufferView']]
    assert 'sparse' not in a and a['type'] in WIDTH
    n,w=a['count'],WIDTH[a['type']];dt=np.dtype(DTYPES[a['componentType']]);off=v.get('byteOffset',0)+a.get('byteOffset',0)
    stride=v.get('byteStride',w*dt.itemsize)
    return np.ndarray((n,w),dtype=dt,buffer=b,offset=off,strides=(stride,dt.itemsize)).copy()

def spans(d,i):
    a=d['accessors'][i];v=d['bufferViews'][a['bufferView']];w=WIDTH[a['type']];size=w*np.dtype(DTYPES[a['componentType']]).itemsize
    off=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',size)
    return [(off+k*stride,off+k*stride+size) for k in range(a['count'])]

def geom(p,f):
    p=p.astype(np.float64)
    cross=np.cross(p[f[:,1]]-p[f[:,0]],p[f[:,2]]-p[f[:,0]])
    area2=np.linalg.norm(cross,axis=1)
    return cross,area2

def inventory(d,b):
    rows=[]
    for mi,m in enumerate(d['meshes']):
        for pi,pr in enumerate(m['primitives']):
            p=read(d,b,pr['attributes']['POSITION']);n=read(d,b,pr['attributes']['NORMAL']);f=read(d,b,pr['indices']).reshape(-1,3)
            c,a=geom(p,f);nl=np.linalg.norm(n.astype(np.float64),axis=1);deg=a<=AREA2_LIMIT
            valid=~deg;sn=n[f].sum(axis=1);dot=(c*sn).sum(axis=1)
            rows.append({'mesh':mi,'primitive':pi,'vertices':len(p),'triangles':len(f),'position_accessor':pr['attributes']['POSITION'],'normal_accessor':pr['attributes']['NORMAL'],'finite_positions':bool(np.isfinite(p).all()),'finite_normals':bool(np.isfinite(n).all()),'minimum_area':float(a.min()/2),'degenerate_area_threshold':AREA2_LIMIT/2,'degenerate_faces':int(deg.sum()),'repeated_index_faces':int(((f[:,0]==f[:,1])|(f[:,1]==f[:,2])|(f[:,0]==f[:,2])).sum()),'zero_normals':int((nl<1e-12).sum()),'nonunit_normals_tolerance_1e-4':int((abs(nl-1)>1e-4).sum()),'normal_length_range':[float(nl.min()),float(nl.max())],'face_average_vertex_normal_disagreement':int((valid&(dot<0)).sum()),'bounds_local':[p.min(axis=0).tolist(),p.max(axis=0).tolist()]})
            rows[-1]['near_degenerate_area_threshold']=PRACTICAL_AREA2_LIMIT/2
            rows[-1]['near_degenerate_faces']=int((a<=PRACTICAL_AREA2_LIMIT).sum())
    return rows

def scrub(d,ids):
    d=copy.deepcopy(d)
    for i in ids:
        d['accessors'][i].pop('min',None);d['accessors'][i].pop('max',None)
    return d

def normalized_candidate(source,candidate):
    """Permit only appended replacement arrays and their two mesh0 references."""
    d=copy.deepcopy(candidate)
    for field in ('accessors','bufferViews'):
        d[field]=d[field][:len(source[field])]
    d['buffers'][0]['byteLength']=source['buffers'][0]['byteLength']
    d['meshes'][0]['primitives'][0]['attributes']['POSITION']=source['meshes'][0]['primitives'][0]['attributes']['POSITION']
    d['meshes'][0]['primitives'][0]['attributes']['NORMAL']=source['meshes'][0]['primitives'][0]['attributes']['NORMAL']
    return d

def diff_paths(a,b,p=''):
    if type(a)!=type(b): return [p]
    if isinstance(a,dict):
        out=[]
        for k in a.keys()|b.keys():
            out+=diff_paths(a.get(k),b.get(k),p+'/'+str(k))
        return out
    if isinstance(a,list):
        if len(a)!=len(b): return [p+'/length']
        return [q for i,(x,y) in enumerate(zip(a,b)) for q in diff_paths(x,y,p+'/'+str(i))]
    return [] if a==b else [p]

def run(source,candidate=None,selection=None):
    br,bd,bb=parse(source)
    assert sha(br)==EXPECTED_SOURCE_SHA,'Unexpected source SHA'
    out={'schema':'crwt.alexia_hair_core_independent_audit.v1','source_path':str(Path(source).resolve()),'source_sha256':sha(br),'approved':False,'gameIntegrated':False,'visual_verdict':'pending actual candidate renders','scope':'Only appended replacement mesh0 POSITION/NORMAL arrays, two appended accessors/views, buffer length, and mesh0 POSITION/NORMAL references may change. Original BIN/accessor/view prefixes remain exact. No universal manifold or self-intersection certification.','baseline_inventory':inventory(bd,bb)}
    if candidate is None:
        out['passed']=all(r['finite_positions'] and r['finite_normals'] for r in out['baseline_inventory']);return out
    cr,cd,cb=parse(candidate);pr=bd['meshes'][0]['primitives'][0];pos,norm=pr['attributes']['POSITION'],pr['attributes']['NORMAL'];cpr=cd['meshes'][0]['primitives'][0];cpos,cnorm=cpr['attributes']['POSITION'],cpr['attributes']['NORMAL']
    out.update(candidate_path=str(Path(candidate).resolve()),candidate_sha256=sha(cr),candidate_inventory=inventory(cd,cb))
    docdiff=diff_paths(bd,normalized_candidate(bd,cd))
    source_prefix_exact=cb[:len(bb)]==bb
    appended_contract=(len(cd['accessors'])==len(bd['accessors'])+2 and len(cd['bufferViews'])==len(bd['bufferViews'])+2 and set((cpos,cnorm))==set(range(len(bd['accessors']),len(cd['accessors']))) and set(cd['accessors'][i]['bufferView'] for i in (cpos,cnorm))==set(range(len(bd['bufferViews']),len(cd['bufferViews']))))
    appended_bytes_expected=0
    if appended_contract:
        for ci,bi in ((cpos,pos),(cnorm,norm)):
            ca,ba=cd['accessors'][ci],bd['accessors'][bi];v=cd['bufferViews'][ca['bufferView']]
            appended_contract &= all(ca.get(k)==ba.get(k) for k in ('componentType','count','type')) and ca.get('byteOffset',0)==0 and 'sparse' not in ca and 'byteStride' not in v and v.get('buffer',0)==0 and v.get('byteOffset',0)>=len(bb) and v['byteLength']==ba['count']*3*4
            appended_bytes_expected += ba['count']*3*4
        appended_contract &= len(cb)==len(bb)+appended_bytes_expected
        views=sorted([cd['bufferViews'][cd['accessors'][i]['bufferView']] for i in (cpos,cnorm)],key=lambda v:v['byteOffset'])
        appended_contract &= views[0]['byteOffset']==len(bb) and views[1]['byteOffset']==len(bb)+views[0]['byteLength']
    bp=read(bd,bb,pos);cp=read(cd,cb,cpos);bn=read(bd,bb,norm);cn=read(cd,cb,cnorm)
    pp=np.any(bp!=cp,axis=1);nn=np.any(bn!=cn,axis=1);changed=pp|nn;world=bp.astype(np.float64)*np.array([-1,1,-1])
    col=read(bd,bb,pr['attributes']['COLOR_0'])[:,:3]
    lavender=(col[:,2]-col[:,1]>.008)&(col[:,2]-col[:,0]>-.005)&(col.min(axis=1)>.075)
    backward=(-bn[:,2]<-.12)
    hard=(world[:,2]<-.095)&(abs(world[:,0])<.245)&(world[:,1]>=-.065)&(world[:,1]<=.365)&lavender&backward
    # Geometric protection excludes frontal face/bangs/headphones, lower body and bag.
    protection=~hard
    selection_match=None
    if selection:
        sf=Path(selection)
        if sf.suffix=='.npz':
            z=np.load(sf);key='selected_indices' if 'selected_indices' in z.files else ('indices' if 'indices' in z.files else z.files[0]);ix=z[key]
        elif sf.suffix=='.npy':ix=np.load(sf)
        else:ix=np.asarray(json.loads(sf.read_text()))
        selected=np.zeros(len(bp),bool)
        if ix.dtype==bool: selected=ix
        else:selected[ix.astype(np.int64)]=True
        selection_match=bool(not np.any(changed&~selected))
    f=read(bd,bb,pr['indices']).reshape(-1,3);bc,ba=geom(bp,f);cc,ca=geom(cp,f)
    bdeg=ba<=AREA2_LIMIT;cdeg=ca<=AREA2_LIMIT;newdeg=np.flatnonzero(cdeg&~bdeg)
    new_near_degenerate=np.flatnonzero((ca<=PRACTICAL_AREA2_LIMIT)&(ba>PRACTICAL_AREA2_LIMIT))
    dots=(bc*cc).sum(axis=1);valid=~bdeg&~cdeg;flips=np.flatnonzero(valid&(dots<=0));angles=np.zeros(len(f));angles[valid]=np.degrees(np.arccos(np.clip(dots[valid]/(ba[valid]*ca[valid]),-1,1)))
    delta=np.linalg.norm(cp.astype(np.float64)-bp,axis=1)
    out['checks']={'document_preserved_except_appended_core_arrays_and_refs':not docdiff,'document_difference_paths':docdiff,'original_binary_prefix_exact':source_prefix_exact,'exact_two_appended_core_arrays_layout':bool(appended_contract),'appended_bytes':len(cb)-len(bb),'mesh0_position_vertices_changed':int(pp.sum()),'mesh0_normal_vertices_changed':int(nn.sum()),'any_changed_vertices_outside_rear_hair_color_normal_hard_gate':int((changed&protection).sum()),'selected_region_matches':selection_match,'max_displacement':float(delta.max()),'changed_bounds_world': [world[changed].min(axis=0).tolist(),world[changed].max(axis=0).tolist()] if changed.any() else None,'unchanged_front_position_and_normal':bool(not np.any(changed&(world[:,2]>=-.095))),'unchanged_lower_body_position_and_normal':bool(not np.any(changed&(world[:,1]<-.065))),'new_degenerate_faces':int(len(newdeg)),'new_degenerate_first_face_ids':newdeg[:50].tolist(),'relative_original_triangle_face_flips':int(len(flips)),'relative_original_triangle_faceflip_first_ids':flips[:50].tolist(),'maximum_original_to_candidate_face_angle_degrees':float(angles.max()),'finite_all_positions_and_normals':all(r['finite_positions'] and r['finite_normals'] for r in out['candidate_inventory'])}
    out['checks']['unchanged_mesh0_x_y_coordinates']=bool(np.array_equal(bp[:,:2],cp[:,:2]))
    out['checks']['unit_all_normals_within_1e_4']=all(r['zero_normals']==0 and r['nonunit_normals_tolerance_1e-4']==0 for r in out['candidate_inventory'])
    out['checks']['new_near_degenerate_faces_at_area_1e_12']=int(len(new_near_degenerate))
    ch=out['checks'];out['passed']=bool(ch['document_preserved_except_appended_core_arrays_and_refs'] and source_prefix_exact and appended_contract and ch['any_changed_vertices_outside_rear_hair_color_normal_hard_gate']==0 and selection_match is not False and ch['new_degenerate_faces']==0 and ch['new_near_degenerate_faces_at_area_1e_12']==0 and ch['relative_original_triangle_face_flips']==0 and ch['finite_all_positions_and_normals'] and ch['unit_all_normals_within_1e_4'])
    return out

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('source');p.add_argument('candidate',nargs='?');p.add_argument('--selection');p.add_argument('--output',required=True);a=p.parse_args();r=run(a.source,a.candidate,a.selection);Path(a.output).write_text(json.dumps(r,indent=2));print(json.dumps({'output':a.output,'passed':r['passed'],'source_sha256':r['source_sha256'],'candidate_sha256':r.get('candidate_sha256'),'checks':r.get('checks'),'baseline_inventory':r['baseline_inventory']}));raise SystemExit(0 if r['passed'] else 1)

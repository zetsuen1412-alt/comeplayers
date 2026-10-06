"""Independent COLOR-only audit, numeric scope only until actual renders reviewed."""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import struct
import numpy as np
from PIL import Image
from independent_reference_sampling import profile_xy,samples

SOURCE_SHA='a605eedeaf86740d14f92d04553b25c016a1c0bf362a2265036fadb5aa60acd4'
DT={5120:'<i1',5121:'<u1',5122:'<i2',5123:'<u2',5125:'<u4',5126:'<f4'}
WIDTH={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}
def sha(raw): return hashlib.sha256(raw).hexdigest()
def parse(path):
    raw=Path(path).read_bytes()
    assert struct.unpack_from('<4sII',raw)==(b'glTF',2,len(raw))
    jl,jt=struct.unpack_from('<II',raw,12)
    assert jt==0x4e4f534a
    d=json.loads(raw[20:20+jl])
    bl,bt=struct.unpack_from('<II',raw,20+jl)
    assert bt==0x004e4942 and 28+jl+bl==len(raw)
    assert len(d['buffers'])==1 and 'uri' not in d['buffers'][0]
    assert d['buffers'][0]['byteLength']<=bl<=d['buffers'][0]['byteLength']+3
    return raw,d,raw[28+jl:]
def read(d,b,i):
    a=d['accessors'][i];v=d['bufferViews'][a['bufferView']]
    assert 'sparse' not in a
    w=WIDTH[a['type']];dt=np.dtype(DT[a['componentType']]);stride=v.get('byteStride',w*dt.itemsize)
    return np.ndarray((a['count'],w),dtype=dt,buffer=b,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(stride,dt.itemsize)).copy()
def diff(a,b,p=''):
    if type(a)!=type(b):return[p]
    if isinstance(a,dict):return[q for k in a.keys()|b.keys() for q in diff(a.get(k),b.get(k),p+'/'+str(k))]
    if isinstance(a,list):
        if len(a)!=len(b):return[p+'/length']
        return[q for i,(u,v) in enumerate(zip(a,b)) for q in diff(u,v,p+'/'+str(i))]
    return[] if a==b else[p]
def normal_doc(source,candidate):
    d=copy.deepcopy(candidate)
    for field in ('accessors','bufferViews'):d[field]=d[field][:len(source[field])]
    d['buffers'][0]['byteLength']=source['buffers'][0]['byteLength']
    d['meshes'][0]['primitives'][0]['attributes']['COLOR_0']=source['meshes'][0]['primitives'][0]['attributes']['COLOR_0']
    return d
def active_scope(world,normal):
    """Independent literal mask, confirmed against actual 2026-10-06 recipe/proof."""
    x,y,z=world.T;nx,ny,nz=normal.T
    ear=((z-.077)/.068)**2+((y-.258)/.107)**2<=1.2**2
    hard=(y>-.095)&(y<.455)&(z>-.235)&(z<.035)&(abs(x+.006)>.085)&(abs(x+.006)<.35)&(nz<.55)&(abs(nx)>.10)&(((y>.19)&(z<-.025))|(z<-.105))&~ear
    return hard,ear
def verify_mask_parameters(m):
    expected={'world_axis_signs':[-1,1,-1],'world_x_center':-.006,'world_y_min':-.095,'world_y_max':.455,'world_z_min':-.235,'world_z_max':.035,'world_abs_centered_x_min':.085,'world_abs_centered_x_max':.35,'original_world_normal_z_max':.55,'original_world_abs_normal_x_min':.10,'semantic_upper_y_min':.19,'semantic_upper_z_max':-.025,'semantic_lower_z_max':-.105,'semantic_formula':'((worldY>.19 and worldZ<-.025) or worldZ<-.105)','protected_headphone_ellipse':{'world_z_center':.077,'world_y_center':.258,'world_z_radius':.068,'world_y_radius':.107,'protected_radius_squared_max':1.44},'reference_confidence_required':True,'source_color_hair_membership_required':False}
    return not diff(expected,{k:m.get(k) for k in expected})
def upper_extension(world,normal,base,ear,proof,rgb):
    x,y,z=world.T;nx,ny,nz=normal.T
    expected={'world_y_min':.39,'world_y_max':.455,'world_z_min':-.235,'world_z_max':.055,'world_abs_centered_x_min':.085,'world_abs_centered_x_max':.35,'original_world_normal_z_max':.35,'original_world_abs_normal_x_min':.35,'same_protected_headphone_ellipse':True,'direct_lavender_confidence_min_exclusive':.90,'local_lavender_support_min_exclusive':.60,'reference_highlights_accepted':False,'reference_kernel_radius_pixels':6,'reference_kernel_sigma_pixels':2.8,'reference_support_smoothstep':[.025,.20]}
    parameters_exact=proof['mask_parameters']['upper_extension']==expected
    geom=(y>.39)&(y<.455)&(z>-.235)&(z<.055)&(abs(x+.006)>.085)&(abs(x+.006)<.35)&(nz<.35)&(abs(nx)>.35)&~ear&~base
    ids=np.flatnonzero(geom);xy=np.zeros((len(ids),2));support=np.zeros(len(ids));direct=np.zeros(len(ids))
    for side,select in [('plus',np.flatnonzero(x[ids]>-.006)),('minus',np.flatnonzero(x[ids]<-.006))]:
        xy[select]=profile_xy(world[ids[select]],side,proof['calibration'])
        _,support[select],direct[select]=samples(rgb,side,proof['calibration'],xy[select],include_white=False)
    qualify=np.zeros(len(world),bool);qualify[ids]=(direct>.90)&(support>.60)
    critical=((z>=-.025)&~qualify)|(nz>=.55)|ear
    return base|qualify,geom,qualify,critical,xy,support,direct,parameters_exact
def lavender_extension(world,normal,colors,current,upper_qualified,ear,proof,rgb):
    x,y,z=world.T;nx,ny,nz=normal.T
    expected={'world_y_min':-.095,'world_y_max':.455,'world_z_min':-.235,'world_z_max':-.025,'world_abs_centered_x_min':.075,'world_abs_centered_x_max':.35,'original_normal_gate_required':False,'same_protected_headphone_ellipse':True,'source_gamma_rgb_scale':255,'source_palette':{'blue_minus_green_min_exclusive':14,'blue_minus_red_min_exclusive':7,'red_minus_green_min_exclusive':3,'minimum_channel_min_exclusive':70},'direct_lavender_confidence_min_exclusive':.90,'local_lavender_support_min_exclusive':.60,'reference_highlights_accepted':False,'reference_kernel_radius_pixels':6,'reference_kernel_sigma_pixels':2.8,'reference_support_smoothstep':[.025,.20]}
    m=proof['mask_parameters']['source_lavender_expansion'];parameters_exact=all(m.get(k)==v for k,v in expected.items())
    c=colors[:,:3].astype(float);g=np.where(c<=.0031308,12.92*c,1.055*c**(1/2.4)-.055)*255
    palette=(g[:,2]-g[:,1]>14)&(g[:,2]-g[:,0]>7)&(g[:,0]-g[:,1]>3)&(g.min(1)>70)
    geom=(y>-.095)&(y<.455)&(z>-.235)&(z<-.025)&(abs(x+.006)>.075)&(abs(x+.006)<.35)&~ear&palette&~current
    ids=np.flatnonzero(geom);xy=np.zeros((len(ids),2));support=np.zeros(len(ids));direct=np.zeros(len(ids))
    for side,select in [('plus',np.flatnonzero(x[ids]>-.006)),('minus',np.flatnonzero(x[ids]<-.006))]:
        xy[select]=profile_xy(world[ids[select]],side,proof['calibration'])
        _,support[select],direct[select]=samples(rgb,side,proof['calibration'],xy[select],include_white=False)
    qualify=np.zeros(len(world),bool);qualify[ids]=(direct>.90)&(support>.60)
    critical=((z>=-.025)&~upper_qualified)|((nz>=.55)&~qualify)|ear
    return current|qualify,geom,qualify,critical,xy,support,direct,parameters_exact,palette
def run(source,candidate,mask_npz=None,proof_path=None):
    br,bd,bb=parse(source);cr,cd,cb=parse(candidate)
    assert sha(br)==SOURCE_SHA,'Unexpected source'
    bp=bd['meshes'][0]['primitives'][0];cp=cd['meshes'][0]['primitives'][0]
    bi=bp['attributes']['COLOR_0'];ci=cp['attributes']['COLOR_0'];bc=read(bd,bb,bi);cc=read(cd,cb,ci)
    changed=np.any(bc!=cc,axis=1)
    ndiff=diff(bd,normal_doc(bd,cd))
    append=(len(cd['accessors'])==len(bd['accessors'])+1 and len(cd['bufferViews'])==len(bd['bufferViews'])+1 and ci==len(bd['accessors']))
    if append:
        ca=cd['accessors'][ci];va=cd['bufferViews'][ca['bufferView']]
        append=bool(ca['bufferView']==len(bd['bufferViews']) and ca.get('byteOffset',0)==0 and ca.get('componentType')==5126 and ca.get('type')=='VEC4' and ca['count']==len(bc) and 'sparse' not in ca and not ca.get('normalized',False) and 'byteStride' not in va and va.get('buffer',0)==0 and va['byteOffset']==len(bb) and va['byteLength']==len(bc)*16 and len(cb)==len(bb)+len(bc)*16 and cd['buffers'][0]['byteLength']==len(cb))
    exact=[]
    for mi,m in enumerate(bd['meshes']):
        for pi,p in enumerate(m['primitives']):
            q=cd['meshes'][mi]['primitives'][pi]
            for name,i in p['attributes'].items():
                if (mi,pi,name)==(0,0,'COLOR_0'):continue
                exact.append({'mesh':mi,'primitive':pi,'attribute':name,'accessor':i,'reference_exact':q['attributes'].get(name)==i,'bytes_exact':read(bd,bb,i).tobytes()==read(cd,cb,q['attributes'][name]).tobytes()})
            exact.append({'mesh':mi,'primitive':pi,'attribute':'indices','accessor':p['indices'],'reference_exact':q['indices']==p['indices'],'bytes_exact':read(bd,bb,p['indices']).tobytes()==read(cd,cb,q['indices']).tobytes()})
    pos=read(bd,bb,bp['attributes']['POSITION']).astype(float)*np.array([-1,1,-1])
    norms=read(bd,bb,bp['attributes']['NORMAL']).astype(float)*np.array([-1,1,-1])
    allowed,ear=active_scope(pos,norms)
    proof_path=Path(proof_path) if proof_path else Path(candidate).parent/'alexia.side-color-proof.json'
    proof=json.loads(proof_path.read_text())
    parameters_exact=verify_mask_parameters(proof['mask_parameters'])
    proof_identity=proof['source_sha256']==sha(br) and proof['candidate_sha256']==sha(cr)
    recipe_path=Path(proof['recipe_path']);recipe_bound=sha(recipe_path.read_bytes())==proof['recipe_sha256'] and proof['recipe_helpers']==[]
    reference_path=Path(proof['reference_path']);reference_bytes=reference_path.read_bytes()
    reference_bound=sha(reference_bytes)=='935b1f8f7d2be4a6a453a089041844f2cd4470eb64be17d9d72568efb3708933'==proof['reference_sha256']
    rgb=np.asarray(Image.open(reference_path).convert('RGB'),dtype=float)
    assert rgb.shape==(1024,1536,3)
    extension=None;base_allowed=allowed.copy()
    if 'upper_extension' in proof['mask_parameters']:
        allowed,extgeom,qualified,critical,extxy,extsupport,extdirect,extparameters=upper_extension(pos,norms,base_allowed,ear,proof,rgb)
    lavender=None
    if 'source_lavender_expansion' in proof['mask_parameters']:
        allowed,lavgeom,lavqualified,critical,lavxy,lavsupport,lavdirect,lavparameters,source_lavender=lavender_extension(pos,norms,bc,allowed,qualified,ear,proof,rgb)
    mask_npz=mask_npz or Path(candidate).parent/'color-masks.npz'
    selection=None
    if mask_npz:
        z=np.load(mask_npz)
        stored_allowed=z['allowed_color_indices'];stored_changed=z['changed_color_indices'];stored_protected=z['protected_color_indices']
        weights=z['changed_weights'];support=z['changed_reference_support'];xy=z['changed_profile_xy']
        selection={'path':str(Path(mask_npz).resolve()),'sha256':sha(Path(mask_npz).read_bytes()),'mask_key':'allowed_color_indices','allowed_count':int(allowed.sum()),'changed_outside':int((changed&~allowed).sum()),'formula_independently_reconstructed':parameters_exact,'actual_allowed_indices_exact':np.array_equal(stored_allowed,np.flatnonzero(allowed)),'actual_changed_indices_exact':np.array_equal(stored_changed,np.flatnonzero(changed)),'actual_protected_indices_exact':np.array_equal(stored_protected,np.flatnonzero(~allowed)),'proof_mask_sha_exact':proof['mask_npz_sha256']==sha(Path(mask_npz).read_bytes()),'changed_weights_finite_positive_and_at_most_one':bool(weights.shape==(changed.sum(),) and np.isfinite(weights).all() and (weights>0).all() and (weights<=1).all()),'changed_reference_support_finite_positive_and_at_most_one':bool(support.shape==(changed.sum(),) and np.isfinite(support).all() and (support>0).all() and (support<=1).all()),'changed_profile_xy_finite':bool(xy.shape==(changed.sum(),2) and np.isfinite(xy).all())}
        if 'upper_extension' in proof['mask_parameters']:
            extension={'parameters_exact':extparameters,'original_side_hair_indices_exact':np.array_equal(z['original_side_hair_indices'],np.flatnonzero(base_allowed)),'geometric_extension_indices_exact':np.array_equal(z['geometric_extension_indices'],np.flatnonzero(extgeom)),'reference_qualified_extension_indices_exact':np.array_equal(z['reference_qualified_extension_indices'],np.flatnonzero(qualified)),'protected_critical_indices_exact':np.array_equal(z['protected_critical_color_indices'],np.flatnonzero(critical)),'reference_palette_only_direct_confidence_all_recomputed':bool(np.allclose(z['extension_direct_lavender_confidence'],extdirect,atol=1e-12,rtol=0)),'reference_palette_only_local_support_all_recomputed':bool(np.allclose(z['extension_local_lavender_support'],extsupport,atol=1e-12,rtol=0)),'all_extension_profile_xy_recomputed':bool(np.allclose(z['extension_profile_xy'],extxy,atol=1e-10,rtol=0)),'base_mask_vertices':int(base_allowed.sum()),'geometric_extension_vertices':int(extgeom.sum()),'reference_qualified_extension_vertices':int(qualified.sum()),'protected_critical_vertices':int(critical.sum()),'changed_extension_vertices':int((changed&qualified).sum()),'changed_critical_vertices':int((changed&critical).sum()),'minimum_qualified_direct_lavender_confidence':float(extdirect[(extdirect>.90)&(extsupport>.60)].min()),'minimum_qualified_local_lavender_support':float(extsupport[(extdirect>.90)&(extsupport>.60)].min()),'highlights_accepted_for_qualification':False}
        if 'source_lavender_expansion' in proof['mask_parameters']:
            lower_shallow=(pos[:,1]<=.19)&(pos[:,2]>=-.105)
            lavender={'parameters_exact':lavparameters,'geometric_source_lavender_indices_exact':np.array_equal(z['geometric_source_lavender_expansion_indices'],np.flatnonzero(lavgeom)),'reference_qualified_source_lavender_indices_exact':np.array_equal(z['reference_qualified_source_lavender_expansion_indices'],np.flatnonzero(lavqualified)),'all_source_lavender_direct_confidence_recomputed':bool(np.allclose(z['source_lavender_expansion_direct_confidence'],lavdirect,atol=1e-12,rtol=0)),'all_source_lavender_local_support_recomputed':bool(np.allclose(z['source_lavender_expansion_local_support'],lavsupport,atol=1e-12,rtol=0)),'all_source_lavender_profile_xy_recomputed':bool(np.allclose(z['source_lavender_expansion_profile_xy'],lavxy,atol=1e-10,rtol=0)),'geometric_source_lavender_vertices':int(lavgeom.sum()),'reference_qualified_source_lavender_vertices':int(lavqualified.sum()),'changed_source_lavender_vertices':int((changed&lavqualified).sum()),'new_expansion_contains_only_original_source_lavender':bool(source_lavender[lavqualified].all()),'changed_new_lower_shallow_rear_vertices':int((changed&lavqualified&lower_shallow).sum()),'changed_non_lavender_lower_shallow_rear_vertices':int((changed&~source_lavender&lower_shallow).sum()),'all_non_lavender_lower_shallow_rear_colors_exact':bool(not np.any(changed&~source_lavender&lower_shallow)),'all_lower_body_y_at_most_minus_point095_colors_exact':bool(not np.any(changed&(pos[:,1]<=-.095))),'changed_critical_vertices':int((changed&critical).sum()),'highlights_accepted_for_qualification':False}
        ids=np.flatnonzero(changed);computed_xy=np.zeros_like(xy)
        sample_errors=[];support_errors=[];sample_ids=[]
        for side,side_indices in [('plus',np.flatnonzero(pos[ids,0]>-.006)),('minus',np.flatnonzero(pos[ids,0]<-.006))]:
            computed_xy[side_indices]=profile_xy(pos[ids[side_indices]],side,proof['calibration'])
            take=side_indices[np.linspace(0,len(side_indices)-1,min(64,len(side_indices)),dtype=int)]
            sample,sup,confidence=samples(rgb,side,proof['calibration'],computed_xy[take],detail='detail_sampling' in proof['calibration'])
            expected=(bc[ids[take],:3].astype(float)*(1-weights[take,None])+sample*weights[take,None]).astype('<f4')
            sample_errors.extend(abs(expected-cc[ids[take],:3]).max(axis=1).tolist());support_errors.extend(abs(sup-support[take]).tolist());sample_ids.extend(ids[take].tolist())
        replay={'reference_sha_bound':reference_bound,'recipe_sha_bound':recipe_bound,'independent_sampler_sha256':sha(Path(__file__).with_name('independent_reference_sampling.py').read_bytes()),'all_changed_profile_xy_independently_recomputed':bool(np.allclose(computed_xy,xy,rtol=0,atol=1e-10)),'deterministic_reference_blend_samples':len(sample_ids),'sample_vertex_ids':sample_ids,'maximum_float32_rgb_replay_error':float(max(sample_errors)),'maximum_reference_support_error':float(max(support_errors)),'sample_rgb_and_support_exact_within_numeric_tolerance':bool(max(sample_errors)<2e-7 and max(support_errors)<1e-10)}
    checks={'original_binary_prefix_exact':cb[:len(bb)]==bb,'document_preserved_except_one_appended_color_stream_and_reference':not ndiff,'document_difference_paths':ndiff,'exact_one_appended_VEC4_float32_color_stream':append,'all_other_actual_accessor_bytes_and_references_exact':all(x['bytes_exact'] and x['reference_exact'] for x in exact),'rgba_shape_exact':bc.shape==cc.shape,'finite_color_values':bool(np.isfinite(cc).all()),'rgba_range_zero_to_one':bool((cc>=0).all() and (cc<=1).all()),'all_alpha_bytes_exact':bc[:,3].tobytes()==cc[:,3].tobytes(),'changed_colors':int(changed.sum()),'unchanged_colors':int((~changed).sum()),'maximum_abs_rgb_delta':float(abs(cc[:,:3]-bc[:,:3]).max()),'changed_vertex_id_sha256':sha(np.flatnonzero(changed).astype('<u4').tobytes()),'changed_world_bounds':[pos[changed].min(axis=0).tolist(),pos[changed].max(axis=0).tolist()] if changed.any() else None,'changed_front_normal_z_greater_equal_point55':int((changed&(norms[:,2]>=.55)).sum()),'changed_front_world_z_greater_equal_point035':int((changed&(pos[:,2]>=.035)).sum())}
    checks['mask_diagnostic']=selection
    checks['independent_reference_replay']=replay
    checks['independent_upper_extension']=extension
    checks['independent_source_lavender_expansion']=lavender
    checks['active_mask_contract']={'formula_status':'independently literal-reconstructed and serialized numerical parameters compared','parameters_exact':parameters_exact,'source_and_candidate_proof_identity_exact':proof_identity,'hard_scope_vertices':int(allowed.sum()),'changed_outside':int((changed&~allowed).sum()),'changed_world_z_greater_equal_minus_point025':int((changed&(pos[:,2]>=-.025)).sum()),'changed_world_normal_z_greater_equal_point55':int((changed&(norms[:,2]>=.55)).sum()),'ear_ellipse_changed':int((changed&ear).sum())}
    required=['original_binary_prefix_exact','document_preserved_except_one_appended_color_stream_and_reference','exact_one_appended_VEC4_float32_color_stream','all_other_actual_accessor_bytes_and_references_exact','rgba_shape_exact','finite_color_values','rgba_range_zero_to_one','all_alpha_bytes_exact']
    structural=all(checks[k] for k in required)
    mask_verified=selection is not None and all(selection[k] for k in ['formula_independently_reconstructed','actual_allowed_indices_exact','actual_changed_indices_exact','actual_protected_indices_exact','proof_mask_sha_exact','changed_weights_finite_positive_and_at_most_one','changed_reference_support_finite_positive_and_at_most_one','changed_profile_xy_finite'])
    passed=structural and parameters_exact and proof_identity and mask_verified and selection['changed_outside']==0 and reference_bound and recipe_bound and replay['all_changed_profile_xy_independently_recomputed'] and replay['sample_rgb_and_support_exact_within_numeric_tolerance']
    if extension:
        passed=passed and all(extension[k] for k in ['parameters_exact','original_side_hair_indices_exact','geometric_extension_indices_exact','reference_qualified_extension_indices_exact','protected_critical_indices_exact','reference_palette_only_direct_confidence_all_recomputed','reference_palette_only_local_support_all_recomputed','all_extension_profile_xy_recomputed']) and extension['changed_critical_vertices']==0
    if lavender:
        passed=passed and all(lavender[k] for k in ['parameters_exact','geometric_source_lavender_indices_exact','reference_qualified_source_lavender_indices_exact','all_source_lavender_direct_confidence_recomputed','all_source_lavender_local_support_recomputed','all_source_lavender_profile_xy_recomputed','new_expansion_contains_only_original_source_lavender','all_non_lavender_lower_shallow_rear_colors_exact','all_lower_body_y_at_most_minus_point095_colors_exact']) and lavender['changed_critical_vertices']==0
    return {'schema':'crwt.alexia_side_color_independent_audit.v1','source_path':str(Path(source).resolve()),'candidate_path':str(Path(candidate).resolve()),'source_sha256':sha(br),'candidate_sha256':sha(cr),'source_bytes':len(br),'candidate_bytes':len(cr),'proof_path':str(proof_path.resolve()),'proof_sha256':sha(proof_path.read_bytes()),'numeric_passed':passed,'passed':False,'visual_accepted':False,'approved':False,'gameIntegrated':False,'scope':'One appended replacement mesh0 COLOR_0 only. Geometry, normals, UV, topology, materials, embedded images, meshes1/2, nodes, skins and clips exact. Numeric pass alone does not accept the color change.','checks':checks,'unchanged_accessor_checks':exact,'limits':['Actual five matched renders required before final acceptance.','No exact six-view registration, separated-lock geometry, manifold, rig or production-readiness claim.']}
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('source');p.add_argument('candidate');p.add_argument('--mask');p.add_argument('--proof');p.add_argument('--output',required=True);a=p.parse_args();r=run(a.source,a.candidate,a.mask,a.proof);Path(a.output).write_text(json.dumps(r,indent=2));print(json.dumps({'output':a.output,'numeric_passed':r['numeric_passed'],'passed':r['passed'],'source_sha256':r['source_sha256'],'candidate_sha256':r['candidate_sha256'],'checks':r['checks']}));raise SystemExit(0 if r['numeric_passed'] else 1)

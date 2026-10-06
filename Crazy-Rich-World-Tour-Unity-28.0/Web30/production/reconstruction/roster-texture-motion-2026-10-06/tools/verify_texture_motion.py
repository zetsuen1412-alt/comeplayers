"""Read-only source preservation and skeletal rest-pose gate; standard library.

Checks actual GLB data. This cannot certify appearance or animation quality.
"""
import argparse, ast, hashlib, io, json, math, pathlib, struct, sys, zipfile
sys.dont_write_bytecode = True
from validate_roster_candidate import Accessors, parse_glb, require, validate_model

BASELINE = 'aa2a57b3e8c15535d0b29914fdfe0b7da18289f91dbf99fce515346795394000'
IDENTITY = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]

def multiply(a,b):
    return [sum(a[r*4+k]*b[k*4+c] for k in range(4)) for r in range(4) for c in range(4)]

def matrix(node):
    if 'matrix' in node:
        a=node['matrix']; return [a[c*4+r] for r in range(4) for c in range(4)]
    x,y,z,w=node.get('rotation',[0,0,0,1]); sx,sy,sz=node.get('scale',[1,1,1]); tx,ty,tz=node.get('translation',[0,0,0])
    require(abs(x*x+y*y+z*z+w*w-1)<2e-5,'Node quaternion is not normalized')
    return [(1-2*(y*y+z*z))*sx,2*(x*y-z*w)*sy,2*(x*z+y*w)*sz,tx,
            2*(x*y+z*w)*sx,(1-2*(x*x+z*z))*sy,2*(y*z-x*w)*sz,ty,
            2*(x*z-y*w)*sx,2*(y*z+x*w)*sy,(1-2*(x*x+y*y))*sz,tz,0,0,0,1]

def worlds(doc):
    result={}
    def visit(i,parent):
        require(i not in result,'Multiply parented or cyclic node')
        result[i]=multiply(parent,matrix(doc['nodes'][i]))
        for c in doc['nodes'][i].get('children',[]): visit(c,result[i])
    for i in doc['scenes'][doc.get('scene',0)]['nodes']: visit(i,IDENTITY)
    return result

def error(a,b): return max(abs(x-y) for x,y in zip(a,b))

def read_semantic_hair(raw):
    require(hashlib.sha256(raw).hexdigest()=='10618a926e013a8a8f9f8d932412f17170197bba2cecd3217c838bdc02ba3649','Accepted immutable semantic mask differs')
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        names=archive.namelist(); require(len(names)==len(set(names)),'Duplicate mask entries')
        info=archive.getinfo('hair_indices.npy'); require(info.file_size<1000000,'Hair mask payload is oversized')
        data=archive.read(info)
    require(data[:8]==b'\x93NUMPY\x01\x00','Expected portable NPY v1 index array')
    n=struct.unpack_from('<H',data,8)[0]; header=ast.literal_eval(data[10:10+n].decode('ascii'))
    require(header=={'descr':'<i8','fortran_order':False,'shape':(99032,)},'Expected accepted hair index shape/type')
    payload=data[10+n:];require(len(payload)==99032*8,'Hair mask payload count differs')
    indices=[v[0] for v in struct.iter_unpack('<q',payload)]
    require(indices==sorted(set(indices)),'Hair mask indices are not unique sorted');return indices

def verify(source,candidate,semantic_mask):
    raw0=source.read_bytes(); raw1=candidate.read_bytes(); mask_raw=semantic_mask.read_bytes(); hair_indices=read_semantic_hair(mask_raw)
    digest=lambda raw:hashlib.sha256(raw).hexdigest()
    require(digest(raw0)==BASELINE,'Wrong current source checkpoint')
    src,sbin=parse_glb(raw0); dst,dbin=parse_glb(raw1)
    actual=validate_model(raw1)
    require(dbin[:len(sbin)]==sbin,'Original embedded BIN data changed')
    for key in ['accessors','bufferViews']:
        require(dst[key][:len(src[key])]==src[key],'Original '+key+' changed')
    for key in ['materials','images','textures','samplers','extensionsRequired','extensionsUsed']:
        require(dst.get(key)==src.get(key),'Original '+key+' changed')
    require(len(dst['meshes'])==len(src['meshes'])==3,'Source mesh count changed')
    require(dst.get('skins') and len(dst.get('animations',[]))>=2,'Actual skeletal animations required')
    sdata=Accessors(src,sbin); ddata=Accessors(dst,dbin)
    for mi,(sm,dm) in enumerate(zip(src['meshes'],dst['meshes'])):
        require({k:v for k,v in sm.items() if k!='primitives'}=={k:v for k,v in dm.items() if k!='primitives'},'Mesh metadata changed')
        require(len(sm['primitives'])==len(dm['primitives']),'Primitive count changed')
        for sp,dp in zip(sm['primitives'],dm['primitives']):
            require({k:v for k,v in sp.items() if k!='attributes'}=={k:v for k,v in dp.items() if k!='attributes'},'Indices/material/topology changed')
            sa,da=sp['attributes'],dp['attributes']
            require(set(da)==set(sa)|{'JOINTS_0','WEIGHTS_0'},'Unexpected attribute changes')
            for key,value in sa.items():
                if mi==0 and key=='COLOR_0': continue
                require(da[key]==value,'Original active '+key+' changed')
    for i,node in enumerate(src['nodes']):
        n=dst['nodes'][i]
        require({k:v for k,v in node.items() if k not in ['children','skin']}=={k:v for k,v in n.items() if k not in ['children','skin']},'Original node transform/mesh changed')
        oldchildren=node.get('children',[]); newchildren=n.get('children',[])
        require(newchildren[:len(oldchildren)]==oldchildren and all(c>=len(src['nodes']) for c in newchildren[len(oldchildren):]),'Original node hierarchy changed')
    sw,dw=worlds(src),worlds(dst)
    max_bind=0.; weight_error=0.; weighted_vertices=0
    for ni,node in enumerate(dst['nodes']):
        if 'mesh' not in node: continue
        require(ni in sw and error(sw[ni],dw[ni])<1e-12,'Original mesh world transform changed')
        require('skin' in node,'Unskinned character mesh')
        skin=dst['skins'][node['skin']]; joints=skin['joints']
        ibms=ddata.read(skin['inverseBindMatrices']); used=set()
        for primitive in dst['meshes'][node['mesh']]['primitives']:
            attrs=primitive['attributes']; weights=ddata.read(attrs['WEIGHTS_0']); ids=ddata.read(attrs['JOINTS_0'])
            require(dst['accessors'][attrs['WEIGHTS_0']]['componentType']==5126,'Weights must be FLOAT')
            require(len(weights)==len(ids)==dst['accessors'][attrs['POSITION']]['count'],'Skin attribute counts differ')
            for js,ws in zip(ids,weights):
                require(all(0<=w<=1 and math.isfinite(w) for w in ws),'Nonfinite/negative weight')
                weight_error=max(weight_error,abs(sum(ws)-1))
                require(abs(sum(ws)-1)<2e-6,'Weights do not sum to one')
                for j,w in zip(js,ws):
                    require(0<=j<len(joints),'Joint index out of range')
                    if w>0: used.add(j)
            weighted_vertices+=len(weights)
        for j in used:
            v=ibms[j]; ibm=[v[c*4+r] for r in range(4) for c in range(4)]
            max_bind=max(max_bind,error(multiply(dw[joints[j]],ibm),sw[ni]))
    require(max_bind<2e-5,'Skin does not preserve the actual source rest pose')
    sa=src['meshes'][0]['primitives'][0]['attributes']; da=dst['meshes'][0]['primitives'][0]['attributes']
    oldcolors=sdata.read(sa['COLOR_0']); newcolors=ddata.read(da['COLOR_0']); positions=sdata.read(sa['POSITION'])
    require(all(0<=i<len(positions) for i in hair_indices),'Hair mask vertex index out of range')
    hair_position_bytes={struct.pack('<3f',*positions[i]) for i in hair_indices}
    closure_indices=[i for i,p in enumerate(positions) if struct.pack('<3f',*p) in hair_position_bytes]
    require(len(closure_indices)==99250,'Exact shared-position hair closure count differs')
    core_node=next(i for i,n in enumerate(src['nodes']) if n.get('mesh')==0)
    skin=dst['skins'][dst['nodes'][core_node]['skin']]; head_ids=[i for i,j in enumerate(skin['joints']) if dst['nodes'][j].get('name')=='AlexiaPrototype_Head']
    require(len(head_ids)==1,'Exactly one actual shared head joint required'); head_index=head_ids[0]
    weights=ddata.read(da['WEIGHTS_0']); ids=ddata.read(da['JOINTS_0'])
    for i in closure_indices:
        require(sum(w for j,w in zip(ids[i],weights[i]) if j==head_index)==1 and all(w==0 for j,w in zip(ids[i],weights[i]) if j!=head_index),'Semantic hair/shared-position closure vertex is not rigidly attached to Head: '+str(i))
    require(len(oldcolors)==len(newcolors),'Color count changed')
    protected=hand_protected=changed=0
    core_node=next(i for i,n in enumerate(src['nodes']) if n.get('mesh')==0); wm=sw[core_node]
    for p,old,new in zip(positions,oldcolors,newcolors):
        require(all(0<=c<=1 and math.isfinite(c) for c in new),'Color range/finite check failed')
        require(old[3]==new[3],'Original alpha changed')
        changed+=old!=new
        x,y,z=[sum(wm[r*4+k]*(*p,1)[k] for k in range(4)) for r in range(3)]
        if y>.135 and z>.035 and abs(x)<.12:
            protected+=1; require(old==new,'Central face colors changed')
        if abs(x+.006)>.155 and -.24<y<-.065 and z>.02:
            hand_protected+=1; require(old==new,'Inner hand/wrist colors changed')
    require(changed>0 and protected>0,'Texture edit or actual protected face missing')
    names=[a.get('name') for a in dst['animations']]
    require('IdleBreath' in names and 'Walk' in names,'Expected authored clips missing')
    clip_evidence=[]
    for anim in dst['animations']:
        rotations=[]; duration=0
        for channel in anim['channels']:
            sampler=anim['samplers'][channel['sampler']]; times=ddata.read(sampler['input']); values=ddata.read(sampler['output'])
            duration=max(duration,times[-1][0]); target=channel['target']
            require(target['node']>=len(src['nodes']),'Animation must target actual added joints')
            if target['path']=='rotation':
                require(all(abs(sum(q*q for q in row)-1)<2e-5 for row in values),'Animation quaternion is not normalized')
                if any(error(values[0],v)>1e-5 for v in values[1:]): rotations.append(dst['nodes'][target['node']]['name'])
        require(duration>0 and rotations,'Clip has no actual joint rotation')
        if anim['name']=='Walk': require(any('ThighL' in n for n in rotations) and any('ThighR' in n for n in rotations),'Walk must alternate actual leg joints')
        clip_evidence.append({'name':anim['name'],'duration_seconds':duration,'rotating_joints':rotations})
    require(source.read_bytes()==raw0 and candidate.read_bytes()==raw1 and semantic_mask.read_bytes()==mask_raw,'Input changed during check')
    return {'schema':'crwt.alexia_texture_motion_source_gate.v3_exact_hair_closure','passed':True,'baseline_sha256':digest(raw0),'candidate_sha256':digest(raw1),
            'semantic_mask_sha256':digest(mask_raw),'semantic_hair_head_rigid_vertices':len(hair_indices),'all_semantic_hair_rigid_head':True,'exact_hair_position_closure_vertices':len(closure_indices),'shared_position_extra_vertices':len(closure_indices)-len(hair_indices),'all_exact_hair_position_closure_rigid_head':True,
            'original_bin_accessors_views_exact':True,'shape_normals_uv_indices_materials_images_exact':True,'source_alpha_exact':True,
            'central_face_vertices_protected':protected,'inner_hand_vertices_protected':hand_protected,'changed_core_color_vertices':changed,'weighted_vertices':weighted_vertices,
            'max_weight_sum_error':weight_error,'max_rest_bind_matrix_error':max_bind,'actual_model':actual,'clips':clip_evidence,
            'all_inputs_unchanged':True,'approved':False,'gameIntegrated':False,
            'limits':['Manual prototype. Numerical integrity does not certify appearance, gait, foot contact, retopology or production approval.']}

def main():
    p=argparse.ArgumentParser(description=__doc__); p.add_argument('--baseline',type=pathlib.Path,required=True); p.add_argument('--candidate',type=pathlib.Path,required=True); p.add_argument('--receipt',type=pathlib.Path,required=True); p.add_argument('--semantic-mask',type=pathlib.Path,required=True)
    a=p.parse_args(); require(not a.receipt.exists(),'Receipt must be fresh'); result=verify(a.baseline,a.candidate,a.semantic_mask)
    a.receipt.parent.mkdir(parents=True,exist_ok=True); a.receipt.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8'); print(json.dumps(result))
if __name__=='__main__': main()

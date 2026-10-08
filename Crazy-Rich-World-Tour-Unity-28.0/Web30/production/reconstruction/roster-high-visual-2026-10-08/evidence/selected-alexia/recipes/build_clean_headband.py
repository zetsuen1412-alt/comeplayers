"""Author a fitted closed headphone strap over an actual skinned Alexia GLB.

New surfaces use the existing Head joint. The source front-face and cup rows,
skin bind matrices and animation tracks are retained. A narrowly bounded
upper-band color correction removes baked mottling on the inherited strap.
This is an approximate reference-guided accessory, not a collision certificate.
"""
import argparse, copy, hashlib, json, math, pathlib, struct
import numpy as np

AXES=np.array([-1.,1.,-1.]); sha=lambda b:hashlib.sha256(b).hexdigest()
def read(raw):
    assert struct.unpack_from('<4sII',raw)==(b'glTF',2,len(raw))
    n,k=struct.unpack_from('<II',raw,12); assert k==0x4e4f534a
    return json.loads(raw[20:20+n]),raw[28+n:]
def acc(d,b,i):
    a=d['accessors'][i];v=d['bufferViews'][a['bufferView']]
    w={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
    return np.frombuffer(b,{5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']],count=a['count']*w,offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(a['count'],w)
def append(d,b,a,target,kind=5126):
    while len(b)%4:b.append(0)
    a=np.asarray(a,dtype={5126:'<f4',5125:'<u4',5123:'<u2'}[kind]); w=a.shape[1] if a.ndim>1 else 1
    vi=len(d['bufferViews']);d['bufferViews'].append({'buffer':0,'byteOffset':len(b),'byteLength':a.nbytes,'target':target});b.extend(a.tobytes())
    ai=len(d['accessors']);q={'bufferView':vi,'componentType':kind,'count':len(a),'type':{1:'SCALAR',2:'VEC2',3:'VEC3',4:'VEC4'}[w]}
    if w==3 and kind==5126:q.update(min=a.min(0).tolist(),max=a.max(0).tolist())
    d['accessors'].append(q);return ai
def unit(a):return a/np.maximum(np.linalg.norm(a,axis=-1,keepdims=True),1e-20)
def linear(c):return np.where(c<=.04045,c/12.92,((c+.055)/1.055)**2.4)
def catmull(q,t):
    n=len(q)-1;j=min(n-1,int(t*n));u=t*n-j;a=q[max(0,j-1)];b=q[j];c=q[j+1];e=q[min(n,j+2)]
    return .5*(2*b+(-a+c)*u+(2*a-5*b+4*c-e)*u*u+(-a+3*b-3*c+e)*u*u*u)
def loft(controls,t0,t1,width,thickness,count):
    t=np.linspace(t0,t1,count);centers=np.array([catmull(controls,float(v)) for v in t]);tang=unit(np.gradient(centers,axis=0))
    fore=np.tile([0.,0.,1.],(count,1));fore=unit(fore-tang*(fore*tang).sum(1)[:,None]);out=unit(np.cross(fore,tang))
    verts=[];faces=[];radial=24
    for j,c in enumerate(centers):
        for k in range(radial):
            a=2*math.pi*k/radial;cs=math.cos(a);sn=math.sin(a)
            # Rounded flattened strap, rather than a cylindrical cable.
            verts.append(c+fore[j]*width*.5*np.sign(cs)*abs(cs)**.6+out[j]*thickness*.5*np.sign(sn)*abs(sn)**.6)
    for j in range(count-1):
        for k in range(radial):
            a=j*radial+k;z=j*radial+(k+1)%radial;c=(j+1)*radial+k;e=(j+1)*radial+(k+1)%radial;faces.extend([[a,z,c],[z,e,c]])
    root=len(verts);verts.extend(centers[[0,-1]].tolist())
    for k in range(radial):faces.extend([[root,(k+1)%radial,k],[root+1,(count-1)*radial+k,(count-1)*radial+(k+1)%radial]])
    p=np.asarray(verts,float);f=np.asarray(faces,dtype='<u4');volume=np.einsum('ij,ij->',p[f[:,0]],np.cross(p[f[:,1]],p[f[:,2]]))/6
    if volume<0:f=f[:,[0,2,1]];volume=-volume
    cross=np.cross(p[f[:,1]]-p[f[:,0]],p[f[:,2]]-p[f[:,0]]);n=np.zeros_like(p)
    for k in range(3):np.add.at(n,f[:,k],cross)
    n=unit(n); assert np.linalg.norm(cross,axis=1).min()>1e-12 and volume>1e-8
    return p,n,f
def main():
    ap=argparse.ArgumentParser();ap.add_argument('--source',required=True,type=pathlib.Path);ap.add_argument('--masks',required=True,type=pathlib.Path);ap.add_argument('--output',required=True,type=pathlib.Path);a=ap.parse_args()
    assert not a.output.exists();raw=a.source.read_bytes();source_sha=sha(raw);d,old=read(raw);original=copy.deepcopy(d);b=bytearray(old)
    core=d['meshes'][0]['primitives'][0];p=acc(d,old,core['attributes']['POSITION']).astype(float)*AXES;c=acc(d,old,core['attributes']['COLOR_0']).copy()
    masks=np.load(a.masks);protect=np.zeros(len(p),bool);hair=np.zeros(len(p),bool)
    for key in ['mandatory_face_indices','cup_indices']:protect[masks[key]]=True
    hair[masks['hair_indices']]=True
    x,y,z=p.T;band=(y>.30)&(z>.026)&(z<.15)&~protect&~hair
    c[band,:3]=linear(np.array([.135,.125,.155]));core['attributes']['COLOR_0']=append(d,b,c,34962)
    # Measure actual rendered high crown around the intended front-to-back
    # strap position. Existing core data alone includes hidden old hair, so use
    # active appended PBR cap/lock primitives where available.
    candidates=[p]
    for pr in d['meshes'][0]['primitives'][1:]:
        mat=d['materials'][pr['material']]
        if 'KHR_materials_unlit' not in mat.get('extensions',{}):candidates.append(acc(d,old,pr['attributes']['POSITION']).astype(float)*AXES)
    hp=np.concatenate(candidates);controls=[[-.204,.287,.063],[-.206,.341,.064]]
    samples=[]
    for xx in np.linspace(-.19,.155,12):
        near=hp[(abs(hp[:,0]-xx)<.018)&(hp[:,1]>.34)&(hp[:,2]>.045)&(hp[:,2]<.12)]
        assert len(near)>0,'Crown support '+str(xx)
        yy=float(np.quantile(near[:,1],.995))+.006
        zz=float(np.interp(xx,[-.204,.163],[.067,.095]));controls.append([xx,yy,zz]);samples.append([xx,yy,len(near)])
    controls.extend([[.173,.345,.095],[.163,.286,.095]])
    controls=np.asarray(controls,float)
    head=d['skins'][0]['joints'].index(next(i for i,n in enumerate(d['nodes']) if n.get('name')=='AlexiaPrototype_Head'));assert head==5
    parts=[]
    for label,t0,t1,width,thick,count,rgb,metal,rough in [
        ('Graphite fitted headphone strap',0,1,.029,.009,193,[.105,.095,.128],.25,.42),
        ('Gold left strap collar',.012,.072,.032,.011,21,[.97,.66,.21],.6,.32),
        ('Gold right strap collar',.928,.988,.032,.011,21,[.97,.66,.21],.6,.32),
        ('Gold crown strap badge',.485,.515,.031,.0105,13,[.96,.68,.25],.55,.34)]:
        pp,nn,ff=loft(controls,t0,t1,width,thick,count);j=np.zeros((len(pp),4),dtype='<u2');j[:,0]=head;w=np.zeros((len(pp),4),dtype='<f4');w[:,0]=1
        attrs={'POSITION':append(d,b,pp*AXES,34962),'NORMAL':append(d,b,nn*AXES,34962),'JOINTS_0':append(d,b,j,34962,5123),'WEIGHTS_0':append(d,b,w,34962)}
        mi=len(d['materials']);d['materials'].append({'name':label,'pbrMetallicRoughness':{'baseColorFactor':[*linear(np.array(rgb)).tolist(),1],'metallicFactor':metal,'roughnessFactor':rough}})
        d['meshes'][0]['primitives'].append({'attributes':attrs,'indices':append(d,b,ff.reshape(-1),34963,5125),'material':mi,'mode':4})
        parts.append({'name':label,'vertices':len(pp),'triangles':len(ff),'world_bounds':[pp.min(0).tolist(),pp.max(0).tolist()]})
    for key in ['nodes','skins','animations','images','textures','samplers']:assert d.get(key)==original.get(key),'Source '+key
    assert b[:len(old)]==old
    d['buffers'][0]['byteLength']=len(b);js=json.dumps(d,separators=(',',':')).encode();js+=b' '*((-len(js))%4);b+=b'\0'*((-len(b))%4)
    out=struct.pack('<4sII',b'glTF',2,28+len(js)+len(b))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(b),0x004e4942)+b
    a.output.parent.mkdir(parents=True,exist_ok=True);a.output.open('xb').write(out)
    proof={'schema':'crwt.alexia_high_visual_headband.v1','source_sha256':source_sha,'candidate_sha256':sha(out),'candidate_bytes':len(out),'source_upper_band_rgb_rows':int(band.sum()),'protected_face_cup_rgb_exact':bool(np.array_equal(c[protect],acc(original,old,original['meshes'][0]['primitives'][0]['attributes']['COLOR_0'])[protect])),'original_binary_prefix_exact':True,'skeleton_bind_and_clip_documents_exact':True,'new_head_joint_slot':head,'crown_control_samples':samples,'world_controls':controls.tolist(),'parts':parts,'source_mtime_sha_unchanged':sha(a.source.read_bytes())==source_sha,'visual_accepted':False,'collision_certified':False}
    a.output.with_suffix('.headband-proof.json').open('x',encoding='utf-8').write(json.dumps(proof,indent=2)+'\n');print(json.dumps(proof))
if __name__=='__main__':main()

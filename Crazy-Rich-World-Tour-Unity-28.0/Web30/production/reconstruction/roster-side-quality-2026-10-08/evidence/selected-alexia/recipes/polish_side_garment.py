"""Append bounded upper-side garment RGB to a selected layered-hair candidate.

Uses the exact independently inspected 5,174-vertex mask. No geometry, raster,
material, rig, alpha, face, hand, hair or cuff modification.
"""
import argparse, copy, hashlib, json, pathlib, struct
import numpy as np

MASK_SHA = 'b517b0f7b8437284206c1ee4f8bf0b4864b02add0ee835d398b54823ae7be511'

def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def require(ok,msg):
    if not ok:raise ValueError(msg)
def read(raw):
    require(struct.unpack_from('<4sII',raw)==(b'glTF',2,len(raw)), 'GLB header')
    n,k=struct.unpack_from('<II',raw,12);require(k==0x4e4f534a,'GLB JSON')
    nb,k=struct.unpack_from('<II',raw,20+n);require(k==0x004e4942 and len(raw)==28+n+nb,'GLB BIN')
    return json.loads(raw[20:20+n]),raw[28+n:]
def acc(d,b,i):
    a=d['accessors'][i];v=d['bufferViews'][a['bufferView']];width={'VEC3':3,'VEC4':4}[a['type']]
    require(a['componentType']==5126 and 'sparse' not in a,'Simple FLOAT32 stream')
    return np.ndarray((a['count'],width),dtype='<f4',buffer=b,
      offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',width*4),4)).copy()
def smooth(a,b,x):
    t=np.clip((x-a)/(b-a),0,1);return t*t*(3-2*t)
def gamma(c):return np.where(c<=.0031308,12.92*c,1.055*np.maximum(c,0)**(1/2.4)-.055)
def linear(c):return np.where(c<=.04045,c/12.92,((c+.055)/1.055)**2.4)

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source',type=pathlib.Path,required=True);p.add_argument('--source-sha256',required=True)
    p.add_argument('--garment-mask',type=pathlib.Path,required=True);p.add_argument('--output',type=pathlib.Path,required=True)
    a=p.parse_args();a.source=a.source.resolve(strict=True);a.garment_mask=a.garment_mask.resolve(strict=True);a.output=a.output.resolve()
    before={str(f):(sha(f),f.stat().st_mtime_ns) for f in [a.source,a.garment_mask]}
    require(sha(a.source)==a.source_sha256 and sha(a.garment_mask)==MASK_SHA,'Pinned source/mask')
    require(not a.output.exists(),'Fresh candidate output required')
    d,b=read(a.source.read_bytes());original=copy.deepcopy(d);attrs=d['meshes'][0]['primitives'][0]['attributes']
    c=acc(d,b,attrs['COLOR_0']);position=acc(d,b,attrs['POSITION']).astype(float)*[-1,1,-1]
    normal=acc(d,b,attrs['NORMAL']).astype(float)*[-1,1,-1]
    with np.load(a.garment_mask,allow_pickle=False) as m:
        ids=m['allowed_color_indices'];require(len(ids)==5174 and len(np.unique(ids))==len(ids),'Frozen garment count')
        for key in ['protected_critical_indices','cup_indices','cuff_indices','hands_indices','mandatory_face_indices','exact_hair_closure_indices']:
            require(not np.intersect1d(ids,m[key]).size,'Protected overlap '+key)
    oldgamma=gamma(c[ids,:3].astype(float));x,y,z=position[ids].T
    light=np.array([-.35,.75,.45]);light/=np.linalg.norm(light)
    shade=np.clip(normal[ids]@light,-1,1)*.010+.008*np.sin(y*10)
    charcoal=np.tile([.207,.184,.213],(len(ids),1))+shade[:,None]
    # Keep only confidently warm trim, with a small coherent shoulder edging.
    r,g,blue=oldgamma.T
    source_gold=smooth(.11,.22,r-g)*smooth(.10,.20,g-blue)*smooth(.40,.62,r)
    shoulder_edge=smooth(.101,.105,y)*(1-smooth(.109,.115,y))*(1-smooth(.105,.145,z))
    gold_weight=np.maximum(.82*source_gold,.78*shoulder_edge)
    gold=np.tile([.74,.52,.29],(len(ids),1))
    target=charcoal*(1-gold_weight[:,None])+gold*gold_weight[:,None]
    updated=c.copy();updated[ids,:3]=linear(np.clip(target,0,1)).astype('<f4')
    require(np.array_equal(updated[:,3],c[:,3]) and np.isfinite(updated).all(),'Alpha and finite')
    changed=np.any(updated!=c,axis=1);allowed=np.zeros(len(c),bool);allowed[ids]=True
    require(np.all(allowed[changed]),'RGB scope escaped')
    binary=bytearray(b)
    while len(binary)%4:binary.append(0)
    view=len(d['bufferViews']);accessor=len(d['accessors']);data=updated.astype('<f4').tobytes()
    d['bufferViews'].append({'buffer':0,'byteOffset':len(binary),'byteLength':len(data),'target':34962});binary.extend(data)
    d['accessors'].append({'bufferView':view,'componentType':5126,'count':len(updated),'type':'VEC4'})
    attrs['COLOR_0']=accessor;d['buffers'][0]['byteLength']=len(binary)
    expected=copy.deepcopy(original);expected['meshes'][0]['primitives'][0]['attributes']['COLOR_0']=accessor
    expected['accessors']=d['accessors'];expected['bufferViews']=d['bufferViews'];expected['buffers']=d['buffers']
    require(d==expected and binary[:len(b)]==b,'Only appended RGB replacement permitted')
    js=json.dumps(d,separators=(',',':')).encode();js+=b' '*((-len(js))%4);binary+=b'\0'*((-len(binary))%4)
    raw=struct.pack('<4sII',b'glTF',2,28+len(js)+len(binary))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(binary),0x004e4942)+binary
    a.output.parent.mkdir(parents=True,exist_ok=True)
    with a.output.open('xb') as f:f.write(raw)
    require(before=={str(f):(sha(f),f.stat().st_mtime_ns) for f in [a.source,a.garment_mask]},'Inputs changed')
    proof={'schema':'crwt.alexia_side_garment_polish.v1','passed':True,'source_sha256':a.source_sha256,
      'candidate_sha256':sha(a.output),'candidate_bytes':len(raw),'garment_mask_sha256':MASK_SHA,
      'recipe_sha256':sha(pathlib.Path(__file__).resolve()),'allowed_color_vertices':len(ids),'changed_color_vertices':int(changed.sum()),
      'protected_face_hands_cups_cuffs_hair_and_alpha_exact':True,'all_source_geometry_rig_clip_material_image_data_exact':True,
      'confident_source_gold_rows':int((source_gold>.5).sum()),'shoulder_edge_rows':int((shoulder_edge>.5).sum()),
      'source_inputs_hash_and_mtime_unchanged':True,'approved':False,'gameIntegrated':False,
      'limits':['Only the upper side jacket mask is polished; lower sleeve/hem/shoe/suitcase paint remains inherited.',
                'Manual charcoal/gold palette, with coarse source geometry. Actual profile review is required.']}
    with a.output.with_suffix('.garment-proof.json').open('x',encoding='utf8',newline='\n') as f:json.dump(proof,f,indent=2);f.write('\n')
    print(json.dumps(proof))

if __name__=='__main__':main()

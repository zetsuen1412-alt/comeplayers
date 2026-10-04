"""Create an explicitly recorded PBR parameter variation; preserve all texture/geometry bytes."""
import argparse,pathlib,json,struct,hashlib
from normalize_sf3d_orientation import chunks,digest
def refine(source,target,normal_scale,roughness):
    if target.exists(): raise FileExistsError(target)
    raw=source.read_bytes();parts=chunks(raw);doc=json.loads(parts[0][1]);before=json.loads(parts[0][1]);changes=[]
    for i,m in enumerate(doc.get('materials',[])):
        prior=json.loads(json.dumps(m))
        if 'normalTexture' in m: m['normalTexture']['scale']=normal_scale
        m.setdefault('pbrMetallicRoughness',{})['roughnessFactor']=roughness
        changes.append({'material_index':i,'before':prior,'after':m})
    payload=json.dumps(doc,separators=(',',':')).encode();payload+=b' '*((-len(payload))%4)
    body=struct.pack('<I4s',len(payload),b'JSON')+payload
    for k,b in parts[1:]: body+=struct.pack('<I4s',len(b),k)+b
    output=struct.pack('<4sII',b'glTF',2,len(body)+12)+body
    if chunks(output)[1:]!=parts[1:] or any(doc.get(k)!=before.get(k) for k in before if k!='materials'): raise ValueError('nonmaterial content changed')
    target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(output)
    proof={'source':str(source.resolve()),'source_sha256':digest(raw),'output':str(target.resolve()),'output_sha256':digest(output),'raw_bin_chunks_identical':True,'positions_indices_normals_uv_images_unchanged':True,'operation':'PBR material parameter refinement only','changes':changes,'production_approved':False}
    target.with_suffix('.material-refinement.json').write_text(json.dumps(proof,indent=2));return proof
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('source',type=pathlib.Path);p.add_argument('target',type=pathlib.Path);p.add_argument('--normal-scale',type=float,required=True);p.add_argument('--roughness',type=float,required=True);a=p.parse_args();print(json.dumps(refine(a.source,a.target,a.normal_scale,a.roughness)))

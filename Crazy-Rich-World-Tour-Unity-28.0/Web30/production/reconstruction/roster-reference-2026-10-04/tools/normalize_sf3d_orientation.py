"""Add a +180 degree Y parent to make SF3D forward +Z; preserve source mesh/texture bytes."""
import argparse,pathlib,json,struct,hashlib
def digest(b): return hashlib.sha256(b).hexdigest()
def chunks(data):
    magic,ver,total=struct.unpack_from('<4sII',data)
    if magic!=b'glTF' or ver!=2 or total!=len(data): raise ValueError('invalid GLB')
    result=[];i=12
    while i<len(data):
        n,t=struct.unpack_from('<I4s',data,i);i+=8
        result.append((t,data[i:i+n]));i+=n
    if i!=len(data) or result[0][0]!=b'JSON': raise ValueError('invalid chunk framing')
    return result
def normalize(source,target):
    if target.exists(): raise FileExistsError(target)
    data=source.read_bytes(); parts=chunks(data);doc=json.loads(parts[0][1])
    if doc.get('skins') or doc.get('animations'): raise ValueError('This transform is only for static SF3D candidates')
    before={k:doc.get(k) for k in ['meshes','accessors','bufferViews','buffers','images','textures','materials']}
    nodes=doc.setdefault('nodes',[])
    for s in doc.get('scenes',[]):
        roots=s.get('nodes',[])
        if not roots: continue
        idx=len(nodes)
        nodes.append({'name':'SF3D orientation: forward +Z','rotation':[0,1,0,0],'children':roots,'extras':{'orientation_only':True,'source_sha256':digest(data),'rotation_degrees_y':180,'mirror':False}})
        s['nodes']=[idx]
    payload=json.dumps(doc,separators=(',',':')).encode();payload+=b' '*((-len(payload))%4)
    body=struct.pack('<I4s',len(payload),b'JSON')+payload
    for kind,b in parts[1:]: body+=struct.pack('<I4s',len(b),kind)+b
    output=struct.pack('<4sII',b'glTF',2,len(body)+12)+body
    target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(output)
    recovered=chunks(output)
    if parts[1:]!=recovered[1:] or any(doc.get(k)!=v for k,v in before.items()): raise ValueError('geometry or material changed')
    proof={'source':str(source.resolve()),'source_sha256':digest(data),'output':str(target.resolve()),'output_sha256':digest(output),'bytes':len(output),'transformation':'rotation 180 degrees around Y via scene root parent; determinant +1','raw_bin_chunks_identical':True,'meshes_accessors_buffers_images_textures_materials_identical':True,'mirrored':False,'geometry_edited':False,'production_approved':False}
    target.with_suffix('.orientation.json').write_text(json.dumps(proof,indent=2))
    return proof
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('source',type=pathlib.Path);p.add_argument('target',type=pathlib.Path);a=p.parse_args();print(json.dumps(normalize(a.source,a.target)))

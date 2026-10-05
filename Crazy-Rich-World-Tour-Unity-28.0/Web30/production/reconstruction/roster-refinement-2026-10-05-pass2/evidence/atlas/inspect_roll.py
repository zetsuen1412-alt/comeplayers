"""Read-only Atlas source positions/UV/albedo inspection through Blender."""
import argparse,sys,json,struct,hashlib
from pathlib import Path
import bpy,numpy as np
ROOT=Path(__file__).resolve().parent
WORKSPACE=ROOT.parents[2]
SOURCE=WORKSPACE/'outputs/model-review-2026-10-05/viewer/models/atlas.glb'
REFERENCE=WORKSPACE/'outputs/model-review-2026-10-05/viewer/references/atlas.png'
SOURCE_SHA='9c9cd775fa42fbab656e0116a937b8ec0902b4da7df9f1882a999e4bf8f5242f'
p=argparse.ArgumentParser();p.add_argument('--output',type=Path,default=ROOT/'source-inspection');a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);out=a.output.resolve();assert not out.exists();out.mkdir(parents=True)
raw=SOURCE.read_bytes();assert hashlib.sha256(raw).hexdigest()==SOURCE_SHA
assert struct.unpack_from('<4sII',raw)==(b'glTF',2,len(raw));jlen,jkind=struct.unpack_from('<II',raw,12);doc=json.loads(raw[20:20+jlen]);binary=raw[28+jlen:]
def data(i):
 ac=doc['accessors'][i];view=doc['bufferViews'][ac['bufferView']];n={'SCALAR':1,'VEC2':2,'VEC3':3}[ac['type']];code={5126:'f',5125:'I',5123:'H'}[ac['componentType']];fmt='<'+code*n;start=view.get('byteOffset',0)+ac.get('byteOffset',0);stride=view.get('byteStride',struct.calcsize(fmt));return np.array([struct.unpack_from(fmt,binary,start+k*stride) for k in range(ac['count'])])
primitive=doc['meshes'][0]['primitives'][0];points=data(primitive['attributes']['POSITION']);uv=data(primitive['attributes']['TEXCOORD_0']);normals=data(primitive['attributes']['NORMAL']);indices=data(primitive['indices']).reshape(-1,3)
material=doc['materials'][primitive.get('material',0)];ti=material['pbrMetallicRoughness']['baseColorTexture']['index'];image=doc['images'][doc['textures'][ti]['source']];v=doc['bufferViews'][image['bufferView']];image_bytes=binary[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']];imgpath=out/'source-albedo-exact.jpg';imgpath.write_bytes(image_bytes)
img=bpy.data.images.load(str(imgpath));w,h=img.size;pixels=np.empty(w*h*4,dtype=np.float32);img.pixels.foreach_get(pixels);pixels=pixels.reshape(h,w,4);xy=np.stack(((uv[:,0]*w).astype(int)%w,((1-uv[:,1])*h).astype(int)%h),axis=1);rgb=pixels[xy[:,1],xy[:,0],:3]
green=(rgb[:,1]>rgb[:,0]*1.025)&(rgb[:,1]>rgb[:,2]*1.07)&(points[:,1]>.12)&(points[:,2]>0)
ids=np.flatnonzero(green);selection=[{'vertex_id':int(i),'position':points[i].tolist(),'uv':uv[i].tolist(),'rgb':rgb[i].tolist()} for i in ids]
report={'source_sha256':SOURCE_SHA,'reference_sha256':hashlib.sha256(REFERENCE.read_bytes()).hexdigest(),'position_accessor':primitive['attributes']['POSITION'],'vertices':len(points),'faces':len(indices),'bounds_raw':np.stack((points.min(0),points.max(0))).tolist(),'green_upper_back_vertices':len(ids),'green_bounds_raw':np.stack((points[ids].min(0),points[ids].max(0))).tolist(),'green_vertices':selection,'node_transforms':doc['nodes'],'source_coordinate_note':'Raw source front -Z; unchanged orientation node yields canonical front+Z; Blender world [-rawX,rawZ,rawY].','albedo_sha256':hashlib.sha256(image_bytes).hexdigest()}
(out/'source-roll-inspection.json').write_text(json.dumps(report,indent=2))
np.savez(out/'source-positions-uv-normals-faces-colors.npz',points=points,uv=uv,normals=normals,faces=indices,rgb=rgb)
print(json.dumps({k:v for k,v in report.items() if k not in ['green_vertices','node_transforms']}),flush=True)

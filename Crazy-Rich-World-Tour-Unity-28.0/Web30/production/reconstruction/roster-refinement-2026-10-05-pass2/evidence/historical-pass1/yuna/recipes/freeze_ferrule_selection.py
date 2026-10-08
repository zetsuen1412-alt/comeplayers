"""Read source geometry/albedo to freeze a narrow cream ferrule face selection; no image/source edits."""
import hashlib,io,json,pathlib,struct,importlib.util
from PIL import Image
folder=pathlib.Path(__file__).resolve().parent;root=folder.parents[2]
spec=importlib.util.spec_from_file_location('yuna_builder',folder/'build_yuna_accessory_details.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
source=root/'outputs/model-review-2026-10-04/viewer/models/yuna.glb';raw=source.read_bytes();assert m.sha(raw)==m.SOURCE_SHA;d,b=m.parse(raw);p=d['meshes'][0]['primitives'][0]
pos=[(-x,y,-z) for x,y,z in m.acc(d,b,p['attributes']['POSITION'])];normal=[(-x,y,-z) for x,y,z in m.acc(d,b,p['attributes']['NORMAL'])];indices=[x[0] for x in m.acc(d,b,p['indices'])]
aa=d['accessors'][p['attributes']['TEXCOORD_0']];vv=d['bufferViews'][aa['bufferView']];uv=[struct.unpack_from('<2f',b,vv.get('byteOffset',0)+aa.get('byteOffset',0)+i*vv.get('byteStride',8)) for i in range(aa['count'])]
material=d['materials'][p['material']];image=d['images'][d['textures'][material['pbrMetallicRoughness']['baseColorTexture']['index']]['source']];view=d['bufferViews'][image['bufferView']]
im=Image.open(io.BytesIO(b[view['byteOffset']:view['byteOffset']+view['byteLength']])).convert('RGB')
def color(i):
    u,v=uv[i];return im.getpixel((max(0,min(im.width-1,int(u*im.width))),max(0,min(im.height-1,int(v*im.height)))))
selected=[];records=[]
for face in range(len(indices)//3):
    ids=indices[face*3:face*3+3];q=[pos[i] for i in ids]
    # The cream ferrule between blue handle and paint bulb; no hand/body/head is in this tiny forward-facing region.
    if not all(.265<x<.328 and .142<y<.192 and .065<z<.165 for x,y,z in q):continue
    rgb=[sum(color(i)[k] for i in ids)/3 for k in range(3)];r,g,bb=rgb
    if not (r>=145 and g>=115 and bb>=100 and r-bb<120 and bb-r<20 and g-r<28):continue
    fn=m.unit(m.cross(m.sub(q[1],q[0]),m.sub(q[2],q[0])))
    if min(m.dot(fn,normal[i]) for i in ids)<.15:continue
    selected.append(face);records.append({'source_face':face,'source_vertex_ids':ids,'world_vertices':q,'average_source_albedo_rgb':rgb})
assert selected and len(selected)<250
out=folder/'ferrule-source-face-selection.json'
report={'schema':'crwt.yuna_ferrule_selection.v1','source_sha256':m.SOURCE_SHA,'source_faces':len(indices)//3,'source_face_ids':selected,'selection_count':len(selected),'bounds':[[min(v[k] for r in records for v in r['world_vertices']) for k in range(3)],[max(v[k] for r in records for v in r['world_vertices']) for k in range(3)]],'criteria':'All vertices in [.265,.328] x [.142,.192] x [.065,.165] world GLTF; cream albedo and normal agreement; source geometry and image bytes read-only.','protected_source_geometry_modified':False,'records':records,'approved':False,'gameIntegrated':False}
with out.open('x',encoding='utf-8',newline='\n') as f:f.write(json.dumps(report,indent=2)+'\n')
print(json.dumps({'selection':str(out),'sha256':m.sha(out.read_bytes()),'faces':len(selected),'bounds':report['bounds']}))

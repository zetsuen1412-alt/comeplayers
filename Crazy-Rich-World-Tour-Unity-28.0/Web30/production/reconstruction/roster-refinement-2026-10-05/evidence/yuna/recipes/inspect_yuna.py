import hashlib,json,pathlib,struct,collections,io
from PIL import Image
root=pathlib.Path(__file__).resolve().parents[3];src=root/'outputs/model-review-2026-10-04/viewer/models/yuna.glb'
b=src.read_bytes();n,t=struct.unpack_from('<II',b,12);d=json.loads(b[20:20+n]);o=20+n;bn,bt=struct.unpack_from('<II',b,o);blob=b[o+8:o+8+bn]
def data(i):
    a=d['accessors'][i];v=d['bufferViews'][a['bufferView']];off=v.get('byteOffset',0)+a.get('byteOffset',0);arity={'VEC2':2,'VEC3':3,'SCALAR':1}[a['type']];s=struct.Struct('<'+{5126:'f',5125:'I',5123:'H'}[a['componentType']]*arity)
    return [s.unpack_from(blob,off+j*v.get('byteStride',s.size)) for j in range(a['count'])]
p=d['meshes'][0]['primitives'][0];pos=[(-x,y,-z) for x,y,z in data(p['attributes']['POSITION'])];uv=data(p['attributes']['TEXCOORD_0']);ids=[x[0] for x in data(p['indices'])]
norm=[(-x,y,-z) for x,y,z in data(p['attributes']['NORMAL'])]
mat=d['materials'][p['material']];tex=d['textures'][mat['pbrMetallicRoughness']['baseColorTexture']['index']];im=d['images'][tex['source']];view=d['bufferViews'][im['bufferView']]
img=Image.open(io.BytesIO(blob[view['byteOffset']:view['byteOffset']+view['byteLength']])).convert('RGB')
def color(i):
    u,v=uv[i];return img.getpixel((max(0,min(img.width-1,int(u*img.width))),max(0,min(img.height-1,int(v*img.height)))))
palette_front=[(i,v) for i,v in enumerate(pos) if -.395<v[0]<-.16 and -.205<v[1]<.045 and v[2]>.015 and norm[i][2]>.55]
cream=[(i,v) for i,v in palette_front if min(color(i))>120 and max(color(i))-min(color(i))<95]
dark=[(i,v) for i,v in palette_front if max(color(i))<120]
feature={'palette_cream_front':{'count':len(cream),'bounds':[[min(v[k] for i,v in cream) for k in range(3)],[max(v[k] for i,v in cream) for k in range(3)]],'sample_points':[{'v':v,'rgb':color(i)} for i,v in cream[::max(1,len(cream)//25)]]},'palette_dark_grip_points':[{'v':v,'rgb':color(i),'n':norm[i]} for i,v in dark]}
regions={}
for name,box in [('palette',(-.395,-.14,-.21,.05)),('brush',(.24,.40,.10,.32))]:
    q=[(i,v) for i,v in enumerate(pos) if box[0]<v[0]<box[1] and box[2]<v[1]<box[3]]
    regions[name]={'vertices':len(q),'bounds':[[min(v[k] for i,v in q) for k in range(3)],[max(v[k] for i,v in q) for k in range(3)]],'samples':[]}
    if name=='brush':
        for lo in [x/100 for x in range(12,32,2)]:
            ss=[v for i,v in q if lo<=v[1]<lo+.02]
            if ss:regions[name]['samples'].append({'y':[lo,lo+.02],'count':len(ss),'bounds':[[min(v[k] for v in ss) for k in range(3)],[max(v[k] for v in ss) for k in range(3)]],'center':[sum(v[k] for v in ss)/len(ss) for k in range(3)]})
    if name=='palette':
        for x in [-.34,-.31,-.28,-.25,-.22,-.19]:
            ss=[v for i,v in q if x<=v[0]<x+.025 and -.16<v[1]<-.02]
            if ss:regions[name]['samples'].append({'x':[x,x+.025],'bounds':[[min(v[k] for v in ss) for k in range(3)],[max(v[k] for v in ss) for k in range(3)]]})
report={'sha256':hashlib.sha256(b).hexdigest(),'nodes':d['nodes'],'regions':regions,'features':feature}
out=pathlib.Path(__file__).parent/'source-inspection.json';out.write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(feature))

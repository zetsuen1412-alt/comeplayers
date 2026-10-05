import json, struct, pathlib, hashlib, collections
ROOT=pathlib.Path(__file__).resolve().parents[3]
src=ROOT/'outputs/model-review-2026-10-04/viewer/models/nox.glb'
b=src.read_bytes(); n,t=struct.unpack_from('<II',b,12); d=json.loads(b[20:20+n]); off=20+n
bn,bt=struct.unpack_from('<II',b,off); blob=b[off+8:off+8+bn]
def data(index):
    a=d['accessors'][index]; v=d['bufferViews'][a['bufferView']]; off=v.get('byteOffset',0)+a.get('byteOffset',0)
    arity={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]; fmt={5126:'f',5125:'I',5123:'H',5121:'B'}[a['componentType']]
    st=struct.Struct('<'+fmt*arity); stride=v.get('byteStride',st.size)
    return [st.unpack_from(blob,off+i*stride) for i in range(a['count'])]
p=d['meshes'][0]['primitives'][0]; pos=data(p['attributes']['POSITION']); faces=[x[0] for x in data(p['indices'])]
par=list(range(len(pos)))
def root(i):
    while par[i]!=i: par[i]=par[par[i]];i=par[i]
    return i
for i in range(0,len(faces),3):
    a,c,e=faces[i:i+3];r=root(a)
    for v in (c,e):par[root(v)]=r
groups=collections.defaultdict(list)
for i in range(len(pos)):groups[root(i)].append(i)
report={'source_sha256':hashlib.sha256(b).hexdigest(),'nodes':d['nodes'],'scenes':d['scenes'],'materials':d['materials'],'accessors':d['accessors'],'components':[{'verts':len(ids),'raw_bounds':[[min(pos[j][k] for j in ids) for k in range(3)],[max(pos[j][k] for j in ids) for k in range(3)]],'raw_center':[sum(pos[j][k] for j in ids)/len(ids) for k in range(3)]} for ids in sorted(groups.values(),key=len,reverse=True)]}
out=pathlib.Path(__file__).parent/'source-inspection.json';out.write_text(json.dumps(report,indent=2),encoding='utf-8')
world=[(-x,y,-z) for x,y,z in pos]
regions={}
for name,box in [('card-target',(.16,.27,-.06,.05)),('existing-left-upper-card',(-.27,-.2,.015,.09))]:
    q=[v for v in world if box[0]<v[0]<box[1] and box[2]<v[1]<box[3]]
    regions[name]={'vertices':len(q),'bounds':[[min(v[k] for v in q) for k in range(3)],[max(v[k] for v in q) for k in range(3)]]} if q else {'vertices':0}
print(json.dumps({'nodes':report['nodes'],'scenes':report['scenes'],'component_count_unwelded':len(groups),'regions':regions}))

import hashlib, io, json, math, pathlib, struct
from PIL import Image

ROOT=pathlib.Path(__file__).resolve().parents[3]
SOURCE=ROOT/'outputs/model-review-2026-10-05/viewer/models/mochi.glb'
REFERENCE=ROOT/'outputs/model-review-2026-10-05/viewer/references/mochi.png'
EXPECTED='15449dcf923bbee701bdf1c69b2eacd5446fe5beeec067dfd611384d05d635b8'
REF_EXPECTED='4cda42d5015a25fb900ae69808f6b7cf77bd9ce28c9c8034e5d13d34edbc016b'
sha=lambda raw:hashlib.sha256(raw).hexdigest()

def parse(raw):
    assert struct.unpack_from('<4sII',raw)==(b'glTF',2,len(raw))
    n,k=struct.unpack_from('<II',raw,12); assert k==0x4e4f534a
    d=json.loads(raw[20:20+n]); p=20+n
    size,kind=struct.unpack_from('<II',raw,p);assert kind==0x004e4942 and p+8+size==len(raw)
    return d,raw[p+8:]

def accessor(d,blob,i):
    a=d['accessors'][i];v=d['bufferViews'][a['bufferView']]
    arity={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]
    s=struct.Struct('<'+{5126:'f',5125:'I',5123:'H',5121:'B'}[a['componentType']]*arity)
    start=v.get('byteOffset',0)+a.get('byteOffset',0)
    return [s.unpack_from(blob,start+j*v.get('byteStride',s.size)) for j in range(a['count'])]

def load():
    raw=SOURCE.read_bytes();assert sha(raw)==EXPECTED and sha(REFERENCE.read_bytes())==REF_EXPECTED
    d,blob=parse(raw);p=d['meshes'][0]['primitives'][0]
    assert d['nodes'][2]['rotation']==[0,1,0,0] and d['scenes'][0]['nodes']==[2]
    points=[(-x,y,-z) for x,y,z in accessor(d,blob,p['attributes']['POSITION'])]
    indices=[q[0] for q in accessor(d,blob,p['indices'])]
    uv=accessor(d,blob,p['attributes']['TEXCOORD_0'])
    im=d['images'][d['textures'][d['materials'][0]['pbrMetallicRoughness']['baseColorTexture']['index']]['source']]
    view=d['bufferViews'][im['bufferView']];texture=Image.open(io.BytesIO(blob[view['byteOffset']:view['byteOffset']+view['byteLength']])).convert('RGB')
    triangles=[(i//3,tuple(points[j] for j in indices[i:i+3]),tuple(uv[j] for j in indices[i:i+3]),tuple(indices[i:i+3])) for i in range(0,len(indices),3)]
    return raw,d,blob,points,indices,triangles,texture

def visible_surface(triangles,x,y):
    best=None
    for face_id,q,uv,ids in triangles:
        a,b,c=q;det=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
        if abs(det)<1e-18:continue
        w0=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/det
        w1=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/det;w2=1-w0-w1
        if min(w0,w1,w2)<-1e-10:continue
        z=sum(w*q0[2] for w,q0 in zip((w0,w1,w2),q))
        if best is None or z>best['z']:
            best={'face_id':face_id,'ids':ids,'xyz':q,'z':z,'weights':[w0,w1,w2],
                  'uv':[sum(w*t[k] for w,t in zip((w0,w1,w2),uv)) for k in (0,1)]}
    if best is None:raise ValueError('No source front surface')
    return best

def main():
    raw,d,blob,points,indices,triangles,texture=load()
    lo=[min(v[k] for v in points) for k in range(3)];hi=[max(v[k] for v in points) for k in range(3)]
    center=[(lo[k]+hi[k])/2 for k in range(3)];extent=max(hi[k]-lo[k] for k in range(3));scale=640/(extent*1.16)
    samples=[]
    for px,py in [(269,383),(258,374),(279,374),(284,384),(270,395),(397,435),(390,430),(400,450),(388,458),(386,470),(330,450)]:
        x=center[0]+(px-320)/scale;y=center[1]+(320-py)/scale;hit=visible_surface(triangles,x,y)
        uv=hit['uv'];color=texture.getpixel((round(uv[0]*(texture.width-1)),round(uv[1]*(texture.height-1))))
        samples.append({'front_pixel640':[px,py],'world_gltf':[x,y,hit['z']],'source_face_id':hit['face_id'],'source_uv':uv,'source_texture_rgb':color})
    out=pathlib.Path(__file__).with_name('accessory-inspection.json');assert not out.exists()
    report={'source_sha256':EXPECTED,'reference_sha256':REF_EXPECTED,'world_gltf_bounds':[lo,hi],'front_orthographic_scale':extent*1.16,'front_pixel_scale':scale,'world_gltf_center':center,'samples':samples,'source_positions_accessor_count':len(points),'source_faces':len(indices)//3,'source_preserved':sha(SOURCE.read_bytes())==EXPECTED,'note':'Both original appendages and Oct04 connector retained; accessory inspection only.'}
    out.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report,indent=2))

if __name__=='__main__':main()

"""Read-only UV/color/coordinate audit of the actual frozen Alexia surface."""
import collections,hashlib,io,json,pathlib,struct
ROOT=pathlib.Path(__file__).resolve().parents[3]
SOURCE=ROOT/'outputs/model-review-2026-10-05-pass2/viewer/models/alexia.glb'
PIN='d9d868ffd4dbd0829a858df953eced16715742fa5f48dd290d3f08339038a0ae'
def read(path):
    r=path.read_bytes();assert struct.unpack_from('<4sII',r)==(b'glTF',2,len(r));n,k=struct.unpack_from('<II',r,12);assert k==0x4e4f534a;d=json.loads(r[20:20+n]);n,k=struct.unpack_from('<II',r,20+n);assert k==0x004e4942;return r,d,r[-n:]
def acc(d,b,i):
    a=d['accessors'][i];v=d['bufferViews'][a['bufferView']];width={'VEC2':2,'VEC3':3,'SCALAR':1}[a['type']];fmt={5126:'f',5125:'I',5123:'H'}[a['componentType']];s=struct.Struct('<'+fmt*width);o=v.get('byteOffset',0)+a.get('byteOffset',0);return [s.unpack_from(b,o+j*v.get('byteStride',s.size)) for j in range(a['count'])]
def main():
    from PIL import Image
    out=pathlib.Path(__file__).with_name('source-roi-inspection.json');assert not out.exists();raw,d,b=read(SOURCE);assert hashlib.sha256(raw).hexdigest()==PIN
    p=d['meshes'][0]['primitives'][0];pos=[(-x,y,-z) for x,y,z in acc(d,b,p['attributes']['POSITION'])];uvs=acc(d,b,p['attributes']['TEXCOORD_0']);image=d['images'][d['textures'][d['materials'][p['material']]['pbrMetallicRoughness']['baseColorTexture']['index']]['source']];view=d['bufferViews'][image['bufferView']];o=view.get('byteOffset',0);im=Image.open(io.BytesIO(b[o:o+view['byteLength']])).convert('RGB');w,h=im.size
    rows=[]
    for i,(x,y,z) in enumerate(pos):
        if -.13<y<.36 and z<-.025 and abs(x)<.29:
            u,v=uvs[i];color=im.getpixel((min(w-1,max(0,int(u*w))),min(h-1,max(0,int(v*h)))))
            rows.append({'vertex':i,'world_gltf':[x,y,z],'color_rgb':color})
    hair=[r for r in rows if r['color_rgb'][2]>=r['color_rgb'][0]*.97 and r['color_rgb'][2]>=r['color_rgb'][1]*1.03 and min(r['color_rgb'])>90]
    report={'source_sha256':PIN,'vertices':len(pos),'coordinate_roi_vertices':len(rows),'hair_color_vertices':len(hair),'hair_bounds':[[min(r['world_gltf'][k] for r in hair) for k in range(3)],[max(r['world_gltf'][k] for r in hair) for k in range(3)]],'color_rule':'B>=.97R and B>=1.03G and minRGB>90; diagnostic only, not final semantic certificate','rows':rows,'hair_vertex_ids':[r['vertex'] for r in hair],'source_unchanged':True}
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==PIN;out.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items() if k not in {'rows','hair_vertex_ids'}}))
if __name__=='__main__':main()

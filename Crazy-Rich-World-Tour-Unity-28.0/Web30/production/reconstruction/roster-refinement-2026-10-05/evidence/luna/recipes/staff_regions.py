import sys,pathlib,json,io
root=pathlib.Path(__file__).resolve().parents[3]
sys.path.insert(0,str(root/'work/pydeps'))
sys.path.insert(0,str(root/'work/model-rebuild/Mochi-tail'))
from PIL import Image
from inspect_components import read_glb,accessor,world_blender
raw,doc,binary=read_glb(root/'outputs/model-review-2026-10-04/viewer/models/luna.glb')
p=doc['meshes'][0]['primitives'][0]
pos=[world_blender(v) for v in accessor(doc,binary,p['attributes']['POSITION'])]
uv=accessor(doc,binary,p['attributes']['TEXCOORD_0'])
indices=[v[0] for v in accessor(doc,binary,p['indices'])]
im=doc['images'][doc['textures'][doc['materials'][0]['pbrMetallicRoughness']['baseColorTexture']['index']]['source']]
view=doc['bufferViews'][im['bufferView']]
tex=Image.open(io.BytesIO(binary[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']])).convert('RGB')
records=[]
for fi in range(len(indices)//3):
    ids=indices[fi*3:fi*3+3];centroid=[sum(pos[v][j] for v in ids)/3 for j in range(3)]
    if centroid[0]>.18 and -.39<centroid[2]<.29:
        u,v=[sum(uv[i][j] for i in ids)/3 for j in range(2)]
        color=tex.getpixel((min(tex.width-1,max(0,int(u*tex.width))),min(tex.height-1,max(0,int(v*tex.height)))))
        records.append({'face':fi,'center':centroid,'color':color,'ids':ids})
path=pathlib.Path(__file__).with_name('staff-region-faces.json');assert not path.exists()
path.write_text(json.dumps(records),encoding='utf-8')
summary=[]
for zlow,zhigh in [(.08,.29),(-.19,-.08),(-.39,-.21)]:
    for xlow in [.18,.22,.26]:
        selected=[r for r in records if zlow<r['center'][2]<zhigh and r['center'][0]>xlow]
        gold=[r for r in selected if r['color'][0]>1.18*r['color'][2] and r['color'][1]>1.12*r['color'][2]]
        if not selected:continue
        def bounds(a):return [[round(min(r['center'][j] for r in a),5) for j in range(3)],[round(max(r['center'][j] for r in a),5) for j in range(3)]] if a else None
        summary.append({'z':[zlow,zhigh],'xlow':xlow,'all':len(selected),'gold':len(gold),'bounds':bounds(selected),'goldbounds':bounds(gold)})
print(json.dumps(summary,indent=2))

import sys,pathlib,importlib.util,json,io
R=pathlib.Path(__file__).resolve().parents[3]
sys.path.insert(0,str(R/'work/pydeps'))
import numpy as np
from PIL import Image
spec=importlib.util.spec_from_file_location('read',R/'work/model-rebuild/Mochi-tail/inspect_components.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
raw,d,b=m.read_glb(R/'outputs/model-review-2026-10-05/viewer/models/alexia.glb');p=d['meshes'][0]['primitives'][0]
v=np.array(m.accessor(d,b,p['attributes']['POSITION']))*[-1,1,-1];uv=np.array(m.accessor(d,b,p['attributes']['TEXCOORD_0']))
im=d['images'][0];bv=d['bufferViews'][im['bufferView']];im=Image.open(io.BytesIO(b[bv['byteOffset']:bv['byteOffset']+bv['byteLength']])).convert('RGB');pix=np.array(im);col=pix[np.clip((uv[:,1]*im.height).astype(int),0,im.height-1),np.clip((uv[:,0]*im.width).astype(int),0,im.width-1)]
print('bounds',v.min(0),v.max(0))
roi=(abs(v[:,0])>.13)&(v[:,1]>.15)&(v[:,1]<.4)
out=[{'index':int(i),'pos':list(v[i]),'rgb':list(map(int,col[i]))} for i in np.where(roi)[0]]
(pathlib.Path(__file__).parent/'ear-samples.json').write_text(json.dumps(out,indent=2))
for y in np.arange(.15,.4,.025):
 q=v[roi & (v[:,1]>=y)&(v[:,1]<y+.025)];print('band',y,'count',len(q),'bounds',q.min(0).tolist() if len(q) else None,q.max(0).tolist() if len(q) else None)

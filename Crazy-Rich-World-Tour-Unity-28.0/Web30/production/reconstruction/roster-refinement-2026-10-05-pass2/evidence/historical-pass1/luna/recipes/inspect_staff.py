import sys,pathlib,json,hashlib
root=pathlib.Path(__file__).resolve().parents[3]
sys.path.insert(0,str(root/'work/model-rebuild/Mochi-tail'))
from inspect_components import read_glb,inspect,world_blender
source=root/'outputs/model-review-2026-10-04/viewer/models/luna.glb'
raw,doc,binary=read_glb(source)
assert hashlib.sha256(raw).hexdigest()=='33f8426e3a4d13957c854f6da62d0105ed98555134154ab96d8b38e7c5a58fcc'
positions,faces,components=inspect(doc,binary)
world=[world_blender(p) for p in positions]
report={'sha256':hashlib.sha256(raw).hexdigest(),'components':components,'positions':world,'faces':faces}
target=pathlib.Path(__file__).with_name('staff-inspection.json')
assert not target.exists()
target.write_text(json.dumps(report),encoding='utf-8')
print(json.dumps({'bounds':[[min(p[j] for p in world) for j in range(3)],[max(p[j] for p in world) for j in range(3)]],'components':[{k:v for k,v in c.items() if k not in ('face_ids','vertex_ids')} for c in components[:24]]},indent=2))

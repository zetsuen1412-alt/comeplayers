"""Read-only original Rindi hand selection and exact-position boundary audit."""
from pathlib import Path
import json, struct, hashlib
from collections import Counter, defaultdict
ROOT=Path(__file__).resolve().parent
SOURCE=ROOT.parents[2]/'outputs/model-review-2026-10-04/viewer/models/rindi.glb'
EXPECTED='b696a2995797148a8471e62b13285a23bda51ea05fe2918f99ac331941d2856c'
raw=SOURCE.read_bytes(); assert hashlib.sha256(raw).hexdigest()==EXPECTED
n,_=struct.unpack_from('<II',raw,12); doc=json.loads(raw[20:20+n]); binary=raw[28+n:]
def values(i):
 a=doc['accessors'][i];v=doc['bufferViews'][a['bufferView']]; size={'SCALAR':1,'VEC2':2,'VEC3':3}[a['type']];fmt='<'+('f' if a['componentType']==5126 else 'I')*size;start=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',struct.calcsize(fmt));return [struct.unpack_from(fmt,binary,start+k*stride) for k in range(a['count'])]
points=values(1);indices=[row[0] for row in values(0)];faces=[tuple(indices[i:i+3]) for i in range(0,len(indices),3)]
weld={};representatives=[];ids=[]
for i,p in enumerate(points):
 if p not in weld:weld[p]=len(representatives);representatives.append(i)
 ids.append(weld[p])
for cut in (-.28,-.275,-.27,-.265):
 selected={i for i,p in enumerate(points) if .08<p[0]<.24 and .035<p[1]<.17 and p[2]<cut}
 removed=[i for i,f in enumerate(faces) if any(v in selected for v in f)]
 edgecounts=Counter();directed={}
 for i in removed:
  f=[ids[v] for v in faces[i]]
  for a,b in zip(f,f[1:]+f[:1]):edgecounts[tuple(sorted((a,b)))]+=1;directed[tuple(sorted((a,b)))]=(a,b)
 boundary=[directed[e] for e,c in edgecounts.items() if c==1];graph=defaultdict(list)
 for a,b in boundary:graph[a].append(b);graph[b].append(a)
 degrees=Counter(map(len,graph.values()));loops=[];seen=set()
 for start in graph:
  if start in seen:continue
  stack=[start];comp=[]
  while stack:
   v=stack.pop()
   if v in seen:continue
   seen.add(v);comp.append(v);stack.extend(graph[v])
  loops.append(comp)
 print(json.dumps({'cut':cut,'selected_vertices':len(selected),'removed_faces':len(removed),'boundary_edges':len(boundary),'boundary_degrees':dict(degrees),'loop_components':[len(c) for c in loops],'bounds':[[min(points[representatives[v]][k] for v in graph),max(points[representatives[v]][k] for v in graph)] for k in range(3)]}))
 if cut==-.275:
  report={'source_sha256':EXPECTED,'cut_source_z':cut,'selected_source_vertex_ids':sorted(selected),'removed_source_face_ids':removed,'source_boundary_edges':[[representatives[a],representatives[b]] for a,b in boundary],'boundary_component_vertex_ids':[[representatives[v] for v in c] for c in loops],'positions':{str(representatives[v]):points[representatives[v]] for v in graph},'source_attributes':doc['meshes'][0]['primitives'][0]['attributes']}
  ROOT.mkdir(parents=True,exist_ok=True); (ROOT/'hand-selection.json').write_text(json.dumps(report,indent=2))

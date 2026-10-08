import json,pathlib,collections
p=pathlib.Path(__file__).parent
d=json.loads((p/'staff-inspection.json').read_text());pos=d['positions'];faces=d['faces']
keys=[tuple(round(v,6) for v in point) for point in pos]
selected=[]
for fi,f in enumerate(faces):
    x,y,z=[sum(pos[v][j] for v in f)/3 for j in range(3)]
    if x>.20 and .085<z<.29 and y<.145:selected.append(fi)
neighbors=collections.defaultdict(list)
for fi in selected:
    for v in faces[fi]:neighbors[keys[v]].append(fi)
todo=set(selected);groups=[]
while todo:
    first=min(todo);q=[first];todo.remove(first);group=[]
    while q:
        fi=q.pop();group.append(fi)
        for v in faces[fi]:
            for other in neighbors[keys[v]]:
                if other in todo:todo.remove(other);q.append(other)
    verts={v for fi in group for v in faces[fi]}
    groups.append({'faces':len(group),'face_ids':sorted(group),'bounds':[[min(pos[v][j] for v in verts) for j in range(3)],[max(pos[v][j] for v in verts) for j in range(3)]],'centroid':[sum(pos[v][j] for v in verts)/len(verts) for j in range(3)]})
groups.sort(key=lambda c:c['faces'],reverse=True)
out=p/'head-selection-components.json';assert not out.exists();out.write_text(json.dumps(groups),encoding='utf-8')
print(json.dumps([{k:v for k,v in g.items() if k!='face_ids'} for g in groups],indent=2))

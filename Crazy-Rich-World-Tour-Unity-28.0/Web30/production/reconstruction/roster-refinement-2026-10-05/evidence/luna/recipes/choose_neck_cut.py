import json,pathlib,collections
p=pathlib.Path(__file__).parent;d=json.loads((p/'staff-inspection.json').read_text());pos=d['positions'];faces=d['faces'];keys=[tuple(round(v,6) for v in point) for point in pos]
full_edges=collections.defaultdict(list)
for fi,face in enumerate(faces):
    for a,b in zip(face,face[1:]+face[:1]):full_edges[tuple(sorted((keys[a],keys[b])))].append((fi,a,b))
all_reports=[]
for cut in [.085,.075,.065,.060,.055,.050,.045]:
    selected=[]
    for fi,face in enumerate(faces):
        x,y,z=[sum(pos[v][j] for v in face)/3 for j in range(3)]
        if x>.20 and cut<z<.29 and y<-.075:selected.append(fi)
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
        groups.append(group)
    group=max(groups,key=len);sel=set(group);bound=[]
    for e,items in full_edges.items():
        a=[v for v in items if v[0] in sel];b=[v for v in items if v[0] not in sel]
        if a and b:
            assert len(a)==len(b)==1
            bound.extend([pos[a[0][1]],pos[a[0][2]]])
    all_reports.append({'cut':cut,'faces':len(sel),'boundary_edges':len(bound)//2,'bounds':[[min(v[j] for v in bound) for j in range(3)],[max(v[j] for v in bound) for j in range(3)]],'selected_face_ids':sorted(sel)})
out=p/'neck-cut-options.json';assert not out.exists();out.write_text(json.dumps(all_reports),encoding='utf-8')
print(json.dumps([{k:v for k,v in r.items() if k!='selected_face_ids'} for r in all_reports],indent=2))

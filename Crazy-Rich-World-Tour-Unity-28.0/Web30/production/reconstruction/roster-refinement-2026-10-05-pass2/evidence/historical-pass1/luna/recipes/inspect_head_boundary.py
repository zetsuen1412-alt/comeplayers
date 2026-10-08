import pathlib,json,collections
p=pathlib.Path(__file__).parent
d=json.loads((p/'staff-inspection.json').read_text());pos=d['positions'];faces=d['faces'];sel=set(json.loads((p/'head-selection-components.json').read_text())[0]['face_ids'])
keys=[tuple(round(v,6) for v in point) for point in pos];reps={}
for i,k in enumerate(keys):reps.setdefault(k,i)
edges=collections.defaultdict(list)
for fi,face in enumerate(faces):
    for a,b in zip(face,face[1:]+face[:1]):edges[tuple(sorted((keys[a],keys[b])))].append((fi,a,b))
boundary=[]
for k,faces_of_edge in edges.items():
    cut=[f for f in faces_of_edge if f[0] in sel];keep=[f for f in faces_of_edge if f[0] not in sel]
    if cut and keep:
        assert len(cut)==len(keep)==1
        fi,a,b=cut[0];boundary.append((reps[keys[a]],reps[keys[b]]))
next_edge=dict(boundary);assert len(next_edge)==len(boundary)
start=min(next_edge);loop=[start];n=next_edge[start]
while n!=start:
    assert n in next_edge and n not in loop
    loop.append(n);n=next_edge[n]
assert len(loop)==len(boundary)
report={'removed_faces':len(sel),'boundary_vertices':loop,'boundary_world': [pos[v] for v in loop],'cap_orientation':'same winding as removed patch; opposite retained boundary'}
out=p/'staff-head-frozen-selection.json';assert not out.exists();out.write_text(json.dumps({**report,'face_ids':sorted(sel)},indent=2),encoding='utf-8')
print(json.dumps(report,indent=2))

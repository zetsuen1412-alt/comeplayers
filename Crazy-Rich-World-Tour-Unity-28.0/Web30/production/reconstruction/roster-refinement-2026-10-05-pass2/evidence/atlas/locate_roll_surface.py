from pathlib import Path
import json,numpy as np
q=np.load(Path(__file__).resolve().parent/'source-inspection/source-positions-uv-normals-faces-colors.npz');p,c=q['points'],q['rgb']
for label,mask in [('green',(c[:,1]>c[:,0]*1.005)&(c[:,1]>c[:,2]*1.04)&(c[:,1]>.2)&(p[:,1]>.12)),('upper_right',(p[:,0]<-.25)&(p[:,1]>.13)&(p[:,1]<.34)&(p[:,2]<.15)&(p[:,2]>-.12))]:
 ids=np.flatnonzero(mask);print(label,len(ids),'bounds',p[ids].min(0).tolist(),p[ids].max(0).tolist(),flush=True)
 print(json.dumps([{'id':int(i),'p':p[i].tolist(),'uv':q['uv'][i].tolist(),'rgb':c[i].tolist(),'normal':q['normals'][i].tolist()} for i in ids[::max(1,len(ids)//20)]][:30]),flush=True)

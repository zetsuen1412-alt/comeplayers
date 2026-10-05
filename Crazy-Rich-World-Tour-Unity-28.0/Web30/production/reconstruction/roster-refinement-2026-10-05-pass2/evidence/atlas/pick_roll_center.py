from pathlib import Path
import json,numpy as np
q=np.load(Path(__file__).resolve().parent/'source-inspection/source-positions-uv-normals-faces-colors.npz');p,uv=q['points'],q['uv']
for target in [(.11,.578),(.12,.574),(.10,.584),(.105,.57)]:
 distance=((uv-np.array(target))**2).sum(1);ids=np.argsort(distance)[:6]
 print(json.dumps({'target_uv':target,'nearest':[{'id':int(i),'position':p[i].tolist(),'uv':uv[i].tolist(),'rgb':q['rgb'][i].tolist(),'normal':q['normals'][i].tolist()} for i in ids]}),flush=True)

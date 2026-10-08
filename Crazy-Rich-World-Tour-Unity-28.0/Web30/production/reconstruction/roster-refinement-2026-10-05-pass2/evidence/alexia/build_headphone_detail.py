"""Conforming concentric headphone face details; original GLB channels untouched."""
import bpy,sys,pathlib,json,hashlib,struct,copy,math,importlib.util
from mathutils import Vector
from mathutils.bvhtree import BVHTree
R=pathlib.Path(__file__).resolve().parents[3]
spec=importlib.util.spec_from_file_location('read',R/'work/model-rebuild/Mochi-tail/inspect_components.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
SOURCE=R/'outputs/model-review-2026-10-05/viewer/models/alexia.glb'
SHA='98bc9fd0f8957ee6454061a7370f634b832902e65e0f283026a41c9c1f8cc761'
REF=R/'outputs/model-review-2026-10-05/viewer/references/alexia.png'
OUT=pathlib.Path(sys.argv[sys.argv.index('--')+1]).resolve()
require=lambda c,t:None if c else (_ for _ in ()).throw(ValueError(t))
require(not OUT.exists(),'Fresh candidate required');raw,original,oldbin=m.read_glb(SOURCE);require(hashlib.sha256(raw).hexdigest()==SHA,'Source pin')
d=copy.deepcopy(original);binary=bytearray(oldbin);p=original['meshes'][0]['primitives'][0]
v=[Vector((-x,y,-z)) for x,y,z in m.accessor(original,oldbin,p['attributes']['POSITION'])];ids=[a[0] for a in m.accessor(original,oldbin,p['indices'])];faces=[ids[i:i+3] for i in range(0,len(ids),3)]
tree=BVHTree.FromPolygons(v,faces,all_triangles=True);pools=[];details=[]
materials=[('Graphite headphone precision rim',[.018,.015,.025,1],.15,.42),('Silver headphone face rim',[.72,.72,.77,1],.65,.38),('Gold headphone diaphragm',[.77,.40,.055,1],.5,.38),('Headphone black center',[.005,.004,.008,1],0,.5)]
base=len(d['materials'])
for name,color,metal,rough in materials:d['materials'].append({'name':name,'pbrMetallicRoughness':{'baseColorFactor':color,'metallicFactor':metal,'roughnessFactor':rough}})
for side,c,n,rx,ry in [(-1,(-.204,.258,.062),(-.94,0,.34),.023,.038),(1,(.163,.258,.092),(.80,0,.60),.021,.036)]:
 c=Vector(c);n=Vector(n).normalized();u=Vector((0,1,0)).cross(n).normalized();up=Vector((0,1,0))
 hits=[]
 def project(rad,theta):
  q=c+u*(rx*rad*math.cos(theta))+up*(ry*rad*math.sin(theta));hit,no,fi,dist=tree.ray_cast(q+n*.065,-n,.13)
  require(hit is not None,'Conforming ray missed');require(abs((hit-q).dot(n))<.048,'Unexpected source surface');hits.append({'face':fi,'radial':rad,'point':list(hit),'normal_depth':(hit-q).dot(n)})
  return hit
 for label,inner,outer,mat,offset,thick in [('graphite rim',.83,.95,0,.00045,.0010),('silver ring',.50,.83,1,.0006,.0014),('gold diaphragm',.0,.50,2,.0007,.0017),('center pin',.0,.115,3,.00248,.0007)]:
  # Five concentric sampling rows conform to actual surface; each coating is a closed annular/disk solid.
  segments=72;rows=5;vertices=[];tris=[]
  radial=[inner+(outer-inner)*j/(rows-1) for j in range(rows)]
  if inner==0:radial[0]=.002
  for depth in [offset,offset+thick]:
   for rad in radial:
    for k in range(segments):vertices.append(project(rad,k*2*math.pi/segments)+n*depth)
  layer=rows*segments
  for j in range(rows-1):
   for k in range(segments):
    a=j*segments+k;b=j*segments+(k+1)%segments;cc=(j+1)*segments+(k+1)%segments;dd=(j+1)*segments+k
    tris.extend([(a,cc,b),(a,dd,cc),(a+layer,b+layer,cc+layer),(a+layer,cc+layer,dd+layer)])
  for row,inward in [(0,True),(rows-1,False)]:
   for k in range(segments):
    a=row*segments+k;b=row*segments+(k+1)%segments
    tris.extend([(a,b,b+layer),(a,b+layer,a+layer)] if inward else [(a,b+layer,b),(a,a+layer,b+layer)])
  # Correct global winding if numerical orientation differs.
  volume=sum(vertices[a].dot(vertices[b].cross(vertices[cc]))/6 for a,b,cc in tris)
  if volume<0:tris=[(a,cc,b) for a,b,cc in tris];volume=-volume
  normals=[Vector((0,0,0)) for _ in vertices]
  for a,b,cc in tris:
   normal=(vertices[b]-vertices[a]).cross(vertices[cc]-vertices[a])
   for k in (a,b,cc):normals[k]+=normal
  normals=[tuple(no.normalized()) for no in normals]
  pools.append({'name':str(side)+' '+label,'vertices':[tuple(q) for q in vertices],'normals':normals,'indices':[k for tri in tris for k in tri],'material':base+mat})
  from collections import Counter
  edges=Counter(tuple(sorted((a,b))) for tri in tris for a,b in zip(tri,tri[1:]+tri[:1]));require(all(x==2 for x in edges.values()) and volume>0,'Closed oriented detail required')
  details.append({'side':side,'part':label,'triangles':len(tris),'vertices':len(vertices),'closed_edge_incidence_two':True,'signed_volume':volume,'intentional_source_surface_contact':'thin coating offset from ray-projected source cup; no whole-model collision certification'})
 defnoop=0
def append(values,kind):
 while len(binary)%4:binary.append(0)
 offset=len(binary);flat=[x for q in values for x in q] if kind=='VEC3' else values;component=5126 if kind=='VEC3' else 5125
 data=struct.pack('<'+('f' if component==5126 else 'I')*len(flat),*flat);binary.extend(data)
 vi=len(d['bufferViews']);d['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':len(data),'target':34962 if kind=='VEC3' else 34963})
 entry={'bufferView':vi,'componentType':component,'count':len(values),'type':kind}
 if kind=='VEC3':entry.update(min=[min(q[k] for q in values) for k in range(3)],max=[max(q[k] for q in values) for k in range(3)])
 ai=len(d['accessors']);d['accessors'].append(entry);return ai
prim=[]
for pool in pools:prim.append({'attributes':{'POSITION':append(pool['vertices'],'VEC3'),'NORMAL':append(pool['normals'],'VEC3')},'indices':append(pool['indices'],'SCALAR'),'material':pool['material'],'mode':4})
mesh=len(d['meshes']);d['meshes'].append({'name':'Alexia V2 conforming headphone rim and diaphragm candidate','primitives':prim})
node=len(d['nodes']);d['nodes'].append({'name':'Alexia original cup face precision details','mesh':mesh,'extras':{'approved':False,'gameIntegrated':False}});d['scenes'][d.get('scene',0)]['nodes'].append(node);d['buffers'][0]['byteLength']=len(binary)
js=json.dumps(d,separators=(',',':')).encode();js+=b' '*((-len(js))%4);binary+=b'\0'*((-len(binary))%4)
result=struct.pack('<4sII',b'glTF',2,28+len(js)+len(binary))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(binary),0x004e4942)+binary
frozen={k:d.get(k,[])[:len(original.get(k,[]))]==original.get(k,[]) for k in ['accessors','bufferViews','meshes','nodes','materials','textures','images','samplers','skins','animations']};require(all(frozen.values()) and bytes(binary[:len(oldbin)])==oldbin,'Frozen source changed')
spec=importlib.util.spec_from_file_location('validator',R/'work/model-rebuild/tools/validate_roster_candidate.py');val=importlib.util.module_from_spec(spec);spec.loader.exec_module(val);actual=val.validate_model(result)
OUT.parent.mkdir(parents=True,exist_ok=True);OUT.write_bytes(result)
proof={'schema':'crwt.alexia_headphone_precision_candidate.v1','source_sha256':SHA,'candidate_sha256':hashlib.sha256(result).hexdigest(),'reference_sha256':hashlib.sha256(REF.read_bytes()).hexdigest(),'source_bin_prefix_byte_identical':True,'source_json_records_preserved':frozen,'source_faces':len(faces),'new_faces':sum(q['triangles'] for q in details),'parts':details,'ray_projection_samples':len(hits),'projected_source_triangle_ids':sorted({h['face'] for h in hits}),'minimum_normal_depth':min(h['normal_depth'] for h in hits),'maximum_normal_depth':max(h['normal_depth'] for h in hits),'validation':actual,'limits':['Only concentric earcup detail is refined. Hair grid, fingers, clothes and suitcase remain source geometry/textures.','Reference front/back V2 guides design; exact cup depth and occluded rings are manual inferred.','Conforming coating volumes are closed individually; source and adjacent-part contacts are not globally certified.'],'approved':False,'gameIntegrated':False}
OUT.with_suffix('.preservation-proof.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps({'candidate':str(OUT),'sha256':proof['candidate_sha256'],'actual':actual}))

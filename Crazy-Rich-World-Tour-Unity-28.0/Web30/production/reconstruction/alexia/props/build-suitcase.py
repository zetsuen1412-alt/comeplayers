import sys,pathlib,json,hashlib
root=pathlib.Path(__file__).resolve().parent
import trimesh,numpy as np
from trimesh.visual.material import PBRMaterial
out=pathlib.Path(sys.argv[1]).resolve() if len(sys.argv)>1 else pathlib.Path.cwd()/'suitcase-output'
out.mkdir(parents=True,exist_ok=True);s=trimesh.Scene()
mats={
 'navy':PBRMaterial(name='Navy shell',baseColorFactor=[15,28,52,255],metallicFactor=.12,roughnessFactor=.35),
 'gold':PBRMaterial(name='Gold hardware',baseColorFactor=[219,159,64,255],metallicFactor=.85,roughnessFactor=.28),
 'rubber':PBRMaterial(name='Black rubber',baseColorFactor=[12,14,19,255],metallicFactor=0,roughnessFactor=.72),
 'steel':PBRMaterial(name='Handle rails',baseColorFactor=[115,121,134,255],metallicFactor=.9,roughnessFactor=.3)}
def add(mesh,name,material):
 mesh.visual=trimesh.visual.TextureVisuals(material=mats[material]);s.add_geometry(mesh,node_name=name,geom_name=name)
def rounded_box(size,center,r=.018):
 sphere=trimesh.creation.icosphere(subdivisions=2,radius=r).vertices
 a=np.asarray(size)/2-r
 points=np.concatenate([sphere+np.array([x*a[0],y*a[1],z*a[2]]) for x in [-1,1] for y in [-1,1] for z in [-1,1]])
 m=trimesh.convex.convex_hull(points);m.apply_translation(center);return m
def box(size,center,name,mat,r=.008):add(rounded_box(size,center,r),name,mat)
def rod(start,end,r,name,mat):
 d=np.asarray(end)-np.asarray(start);m=trimesh.creation.cylinder(radius=r,height=np.linalg.norm(d),sections=24)
 m.apply_transform(trimesh.geometry.align_vectors([0,0,1],d));m.apply_translation((np.asarray(start)+np.asarray(end))/2);add(m,name,mat)
# Reference-guided suitcase only, not a body-model substitute. Dimensions provisional.
box([.56,.80,.30],[0,.51,0],'Navy rounded suitcase body','navy',.04)
# Two shells and seam; front is positive Z.
for z in [-.153,.153]:
 box([.50,.73,.018],[0,.51,z],'Shell face '+str(z),'navy',.006)
for x,width in [(0,.025),(.225,.012)]:
 for z in [-.17,.17]:
  box([width,.78,.013],[x,.51,z],'Gold longitudinal rail '+str((x,z)),'gold',.003)
for x in [-.252,.252]:
 for y in [.155,.865]:
  for z in [-.148,.148]:box([.050,.055,.030],[x,y,z],'Corner cap '+str((x,y,z)),'gold',.01)
for x in [-.245,.245]:
 for y in [.29,.72]:
  for z in [-.16,.16]:
   m=trimesh.creation.icosphere(subdivisions=1,radius=.007);m.apply_translation([x,y,z]);add(m,'Rivet '+str((x,y,z)),'gold')
# Recessed ridges on front/back preserve shell volume.
for x in [-.11,-.055,0,.055,.11]:
 for z in [-.165,.165]:box([.006,.62,.006],[x,.51,z],'Shell ridge '+str((x,z)),'navy',.002)
# Four independent caster assemblies. Wheel axles align X.
for x in [-.215,.215]:
 for z in [-.10,.10]:
  rod([x,.075,z],[x,.15,z],.014,'Caster stem '+str((x,z)),'steel')
  rod([x-.027,.065,z],[x+.027,.065,z],.047,'Rubber wheel '+str((x,z)),'rubber')
  rod([x-.029,.065,z],[x+.029,.065,z],.022,'Wheel hub '+str((x,z)),'gold')
# Telescoping handle and empty carry grip, separate nodes for later interaction.
for x in [-.085,.085]:
 rod([x,.89,-.075],[x,1.15,-.075],.011,'Telescopic rail '+str(x),'steel')
box([.23,.040,.045],[0,1.16,-.075],'Handle grip','rubber',.012)
box([.21,.035,.04],[0,.927,.01],'Carry handle','rubber',.012)
# Solid beveled-like gold star on FRONT only: contour extruded with raised center.
angles=np.arange(10)*np.pi/5+np.pi/2
radii=np.where(np.arange(10)%2==0,.11,.050)
contour=np.stack([np.cos(angles)*radii,np.sin(angles)*radii+.51],axis=1)
vertices=[]
for z in [.175,.19]:vertices.extend([[x,y,z] for x,y in contour])
vertices.append([0,.51,.207]);vertices.append([0,.51,.175])
faces=[]
for i in range(10):
 j=(i+1)%10;faces.extend([[20,10+i,10+j],[21,j,i],[i,j,10+j],[i,10+j,10+i]])
star=trimesh.Trimesh(vertices=vertices,faces=faces,process=True);star.fix_normals();add(star,'Front gold star','gold')
p=out/'alexia-suitcase-separate-prop-candidate.glb';p.write_bytes(s.export(file_type='glb'))
e={'project':'Crazy Rich World Tour','asset':'Alexia navy suitcase, separate prop','approved':False,'source':'Approved Alexia V2, front gold star and plain navy back','method':'Reference-guided independent hard-surface geometry','sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'geometries':len(s.geometry),'triangles':sum(len(m.faces) for m in s.geometry.values()),'dimensionsMetresProvisional':[.56,1.18,.33],'bodyFused':False,'animation':'Static geometry; wheel/handle nodes separate, not animated yet','gameAssetsReplaced':False}
(out/'suitcase-evidence.json').write_text(json.dumps(e,indent=2),encoding='utf-8');print(json.dumps(e),flush=True)

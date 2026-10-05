"""Narrow Rindi reaching-hand candidate. Blender modeling; exact GLB preservation.

Only the frozen 316 source hand triangles are omitted. Every source position,
UV, normal, texture and retained face is preserved byte-for-byte in a copied BIN
prefix. Added geometry is a voxel-unified palm/five tapered fingers and a bridge
to the exact original boundary. No body rig or texture image edit is performed.
"""
from pathlib import Path
import argparse,sys,json,struct,hashlib,math,copy
from collections import Counter,defaultdict
import bpy,bmesh
from mathutils import Vector
ROOT=Path(__file__).resolve().parent
SOURCE=ROOT.parents[2]/'outputs/model-review-2026-10-04/viewer/models/rindi.glb'
SOURCE_SHA='b696a2995797148a8471e62b13285a23bda51ea05fe2918f99ac331941d2856c'
REFERENCE=ROOT.parents[2]/'outputs/model-review-2026-10-04/viewer/references/rindi.png'
REFERENCE_SHA='89cbee984e8784106b8a189dbf60988a6f54704845a4211ffcc20927a7ddbdb6'
p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);p.add_argument('--source',type=Path,default=SOURCE);p.add_argument('--reference',type=Path,default=REFERENCE);p.add_argument('--selection',type=Path,default=ROOT/'hand-selection.json');p.add_argument('--probe',action='store_true');p.add_argument('--render',action='store_true');a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);a.output=a.output.resolve();SOURCE=a.source.resolve(strict=True);REFERENCE=a.reference.resolve(strict=True)
if a.output.exists() and any(a.output.iterdir()):p.error('Output must be fresh and empty; preserve prior candidates/renders.')
if SOURCE.is_relative_to(a.output) or REFERENCE.is_relative_to(a.output):p.error('Output cannot contain a source/reference input.')
a.output.mkdir(parents=True,exist_ok=True)
def sha(raw):return hashlib.sha256(raw).hexdigest()
raw=SOURCE.read_bytes();assert sha(raw)==SOURCE_SHA and sha(REFERENCE.read_bytes())==REFERENCE_SHA
n,_=struct.unpack_from('<II',raw,12);doc=json.loads(raw[20:20+n]);binary=raw[28+n:];selection=json.loads(a.selection.read_text());assert selection['source_sha256']==SOURCE_SHA
def values(i):
 ac=doc['accessors'][i];v=doc['bufferViews'][ac['bufferView']];size={'SCALAR':1,'VEC2':2,'VEC3':3}[ac['type']];fmt='<'+('f' if ac['componentType']==5126 else 'I')*size;start=v.get('byteOffset',0)+ac.get('byteOffset',0);stride=v.get('byteStride',struct.calcsize(fmt));return [struct.unpack_from(fmt,binary,start+k*stride) for k in range(ac['count'])]
points,uvs,normals=values(1),values(2),values(3);ind=[v[0] for v in values(0)];faces=[tuple(ind[i:i+3]) for i in range(0,len(ind),3)];removed=set(selection['removed_source_face_ids']);assert len(removed)==316
bpy.ops.wm.read_factory_settings(use_empty=True)

def studio(center,scale):
 scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True;scene.cycles.device='CPU';scene.render.resolution_x=scene.render.resolution_y=640;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX'
 scene.world=bpy.data.worlds.new('Rindi local hand review');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.62,.65,.72,1);scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.7
 for label,pos,power,size in [('key',(-2.5,-3,3),600,3),('fill',(2,-1,1.2),280,2.8),('rim',(0,2,2.8),500,2.5)]:
  d=bpy.data.lights.new(label,'AREA');d.energy=power*.934**2;d.shape='DISK';d.size=size*.934;o=bpy.data.objects.new(label,d);scene.collection.objects.link(o);o.location=Vector((.0097,.028,-.008))+Vector(pos)*.934;o.rotation_euler=(Vector((.0097,.028,-.008))-o.location).to_track_quat('-Z','Y').to_euler()
 d=bpy.data.cameras.new('Actual geometry camera');d.type='ORTHO';d.ortho_scale=scale;c=bpy.data.objects.new('Actual geometry camera',d);scene.collection.objects.link(c);scene.camera=c
 return scene,c,Vector(center)

def render_views(folder,center,scale):
 folder.mkdir(parents=True,exist_ok=True);scene,cam,target=studio(center,scale)
 for name,az,el in [('front',0,0),('three-quarter',-30,10),('right',-90,0)]:
  r,e=math.radians(az),math.radians(el);cam.location=target+Vector((math.sin(r)*math.cos(e),-math.cos(r)*math.cos(e),math.sin(e)))*3;cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(folder/(name+'.png'));bpy.ops.render.render(write_still=True)
 for o in list(scene.objects):
  if o.type in ('LIGHT','CAMERA'):bpy.data.objects.remove(o,do_unlink=True)

if a.probe:
 bpy.ops.import_scene.gltf(filepath=str(SOURCE));render_views(a.output/'source-hand-close',(-.15,-.282,.105),.205);render_views(a.output/'source-whole',(.0097,.028,-.008),.934*1.16)
 print('PROBE_COMPLETE',flush=True);sys.exit(0)

# Generate actual volumetric shape in raw glTF coordinates, before source's
# unchanged +Z orientation node. Blender is used as a modeling engine here.
parts=[]
def ellipsoid(label,center,radii):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=16,location=center);o=bpy.context.object;o.name=label;o.scale=radii;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);parts.append(o);return o
ellipsoid('source-guided palm',(.153,.106,-.301),(.028,.024,.014))
ellipsoid('tapered emerging wrist',(.140,.100,-.287),(.023,.020,.016))
fingers=[('index',(.171,.112,-.302),(.218,.119,-.307),.0070,.0048),
 ('middle',(.173,.091,-.302),(.202,.066,-.308),.0062,.0044),
 ('ring',(.156,.082,-.302),(.174,.045,-.307),.0057,.0040),
 ('little',(.143,.088,-.299),(.145,.050,-.303),.0050,.0036),
 ('thumb',(.135,.12,-.297),(.128,.155,-.302),.0070,.0047)]
for label,start,end,base,tip in fingers:
 start,end=Vector(start),Vector(end);direction=(end-start).normalized();length=(end-start).length
 capcenter=end-direction*tip
 bpy.ops.mesh.primitive_cone_add(vertices=24,radius1=base,radius2=tip,depth=(capcenter-start).length,location=(start+capcenter)/2)
 o=bpy.context.object;o.name=label+' continuous tapered finger';o.rotation_euler=direction.to_track_quat('Z','Y').to_euler();bpy.ops.object.transform_apply(location=False,rotation=True,scale=False);parts.append(o)
 ellipsoid(label+' rounded fingertip',capcenter,(tip,tip,tip))
 ellipsoid(label+' soft root',start,(base,base,base))
bpy.ops.object.select_all(action='DESELECT')
for o in parts:o.select_set(True)
bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();hand=bpy.context.object;hand.name='Rindi | explicit five-finger reaching hand';bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
hand.data.remesh_voxel_size=.00135;bpy.ops.object.voxel_remesh()
smooth=hand.modifiers.new('gentle voxel surface polish','SMOOTH');smooth.factor=.4;smooth.iterations=5;bpy.ops.object.modifier_apply(modifier=smooth.name)
bm=bmesh.new();bm.from_mesh(hand.data);geom=list(bm.verts)+list(bm.edges)+list(bm.faces);bmesh.ops.bisect_plane(bm,geom=geom,dist=1e-7,plane_co=(0,0,-.279),plane_no=(0,0,1),clear_outer=True,clear_inner=False);bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.to_mesh(hand.data);bm.free();hand.data.update()
newpoints=[tuple(v.co) for v in hand.data.vertices];newfaces=[tuple(f.vertices) for f in hand.data.polygons]
edge_counts=Counter();edge_directions={}
for f in newfaces:
 for x,y in zip(f,f[1:]+f[:1]):edge_counts[tuple(sorted((x,y)))]+=1;edge_directions[tuple(sorted((x,y)))]=(x,y)
boundary=[edge_directions[e] for e,c in edge_counts.items() if c==1]
def ordered(edges):
 nexts={};incoming=Counter()
 for x,y in edges:assert x not in nexts;nexts[x]=y;incoming[y]+=1
 assert len(nexts)==len(edges) and all(c==1 for c in incoming.values());start=next(iter(nexts));ring=[start];cur=nexts[start]
 while cur!=start:assert cur not in ring;ring.append(cur);cur=nexts[cur]
 assert len(ring)==len(edges);return ring
oldring=ordered(selection['source_boundary_edges']);newring=ordered(boundary)
# The source removed-patch boundary and the new open hand boundary must both
# have the same projected orientation for an orientable bridge.
def signed_area(ring,pts):return sum(pts[x][0]*pts[y][1]-pts[y][0]*pts[x][1] for x,y in zip(ring,ring[1:]+ring[:1]))/2
assert signed_area(oldring,points)*signed_area(newring,newpoints)>0,'Boundary orientation incompatible'
center=(sum(points[x][0] for x in oldring)/len(oldring),sum(points[x][1] for x in oldring)/len(oldring))
direction=1 if signed_area(oldring,points)>0 else -1
def angles(ring,pts):
 vals=[math.atan2(pts[x][1]-center[1],pts[x][0]-center[0])*direction for x in ring]
 for i in range(1,len(vals)):
  while vals[i]<vals[i-1]:vals[i]+=2*math.pi
 return vals
oldring=oldring[oldring.index(min(oldring,key=lambda x:math.atan2(points[x][1]-center[1],points[x][0]-center[0])*direction)):]+oldring[:oldring.index(min(oldring,key=lambda x:math.atan2(points[x][1]-center[1],points[x][0]-center[0])*direction))]
newring=newring[newring.index(min(newring,key=lambda x:math.atan2(newpoints[x][1]-center[1],newpoints[x][0]-center[0])*direction)):]+newring[:newring.index(min(newring,key=lambda x:math.atan2(newpoints[x][1]-center[1],newpoints[x][0]-center[0])*direction))]
aa,bb=angles(oldring,points),angles(newring,newpoints);offset=len(points);bridge=[];i=j=0
while i<len(oldring) or j<len(newring):
 nxt_a=aa[i+1] if i+1<len(oldring) else aa[0]+2*math.pi if i<len(oldring) else math.inf
 nxt_b=bb[j+1] if j+1<len(newring) else bb[0]+2*math.pi if j<len(newring) else math.inf
 ax,by=oldring[i%len(oldring)],newring[j%len(newring)]+offset
 if nxt_a<=nxt_b:bridge.append((ax,oldring[(i+1)%len(oldring)],by));i+=1
 else:bridge.append((ax,newring[(j+1)%len(newring)]+offset,by));j+=1
skin_source_vertex=min(range(len(points)),key=lambda i:sum((points[i][k]-(.17,.11,-.305)[k])**2 for k in range(3)))
copied_boundary_start=offset+len(newpoints);boundary_copy={old:copied_boundary_start+i for i,old in enumerate(oldring)}
# Separate the UV seam only: copies have exactly the same frozen boundary
# positions. A bridge must not interpolate across unrelated atlas islands.
bridge=[tuple(boundary_copy.get(x,x) for x in f) for f in bridge]
addedpoints=newpoints+[points[i] for i in oldring]
newuv=[uvs[skin_source_vertex]]*len(addedpoints);newnormals=[tuple(v.normal) for v in hand.data.vertices]+[normals[i] for i in oldring]
# Two narrow transition rings smooth the emerging wrist without moving any
# source vertex or closing it with one large planar fan. Resample the new root
# at the angular parameter of each of the frozen 22 boundary points.
root_angles=angles(newring,newpoints);old_angles=angles(oldring,points);root_angles.append(root_angles[0]+2*math.pi)
destinations=[]
for angle in old_angles:
 while angle<root_angles[0]:angle+=2*math.pi
 while angle>=root_angles[-1]:angle-=2*math.pi
 k=next(i for i in range(len(newring)) if root_angles[i]<=angle<root_angles[i+1])
 t=(angle-root_angles[k])/(root_angles[k+1]-root_angles[k]);destinations.append(Vector(newpoints[newring[k]]).lerp(Vector(newpoints[newring[(k+1)%len(newring)]]),t))
midrings=[]
for t in (1/3,2/3):
 ring=[]
 for old,dest in zip(oldring,destinations):
  ring.append(offset+len(addedpoints));addedpoints.append(tuple(Vector(points[old]).lerp(dest,t)));newuv.append(uvs[skin_source_vertex]);newnormals.append((0,0,0))
 midrings.append(ring)
newbridge=[];rings=[[boundary_copy[x] for x in oldring]]+midrings
for ra,rb in zip(rings,rings[1:]):
 for k in range(len(ra)):
  nxt=(k+1)%len(ra);newbridge.extend([(ra[k],ra[nxt],rb[k]),(ra[nxt],rb[nxt],rb[k])])
last_ring=midrings[-1];replace={boundary_copy[x]:last_ring[i] for i,x in enumerate(oldring)}
newbridge.extend(tuple(replace.get(x,x) for x in f) for f in bridge);bridge=newbridge
allpoints=points+addedpoints;allfaces=[f for i,f in enumerate(faces) if i not in removed]+bridge+[tuple(x+offset for x in f) for f in newfaces]
# Calculate normals for the added patch including the bridge. Frozen source
# normals remain exact; only the new patch receives this surface calculation.
normal_sums=[Vector((0,0,0)) for _ in addedpoints]
for f in bridge+[tuple(x+offset for x in f) for f in newfaces]:
 va,vb,vc=(Vector(allpoints[x]) for x in f);weighted=(vb-va).cross(vc-va)
 for x in f:
  if x>=offset:normal_sums[x-offset]+=weighted
newnormals=[tuple(value.normalized()) if value.length_squared>1e-20 else newnormals[i] for i,value in enumerate(normal_sums)]
# Preserve every original BIN byte and document resource. Append attribute
# arrays, exact retained source triangles, and the narrow new patch only.
outputdoc=copy.deepcopy(doc);buf=bytearray(binary)
def append_accessor(rows,kind,component):
 while len(buf)%4:buf.append(0)
 start=len(buf);fmt='<'+('f' if component==5126 else 'I')*{'VEC3':3,'VEC2':2,'SCALAR':1}[kind]
 for row in rows:buf.extend(struct.pack(fmt,*row))
 view=len(outputdoc['bufferViews']);outputdoc['bufferViews'].append({'buffer':0,'byteOffset':start,'byteLength':len(buf)-start});acc={'bufferView':view,'componentType':component,'count':len(rows),'type':kind}
 acc['min']=[min(row[k] for row in rows) for k in range(len(rows[0]))];acc['max']=[max(row[k] for row in rows) for k in range(len(rows[0]))];idx=len(outputdoc['accessors']);outputdoc['accessors'].append(acc);return idx
pos=append_accessor(allpoints,'VEC3',5126);uv=append_accessor(uvs+newuv,'VEC2',5126);normal=append_accessor(normals+newnormals,'VEC3',5126);idx=append_accessor([(v,) for f in allfaces for v in f],'SCALAR',5125)
outputdoc['meshes'][0]['primitives'][0]['attributes']={'POSITION':pos,'TEXCOORD_0':uv,'NORMAL':normal};outputdoc['meshes'][0]['primitives'][0]['indices']=idx;outputdoc['buffers'][0]['byteLength']=len(buf)
out=a.output/'rindi-reaching-hand-candidate.glb';assert not out.exists();jraw=json.dumps(outputdoc,separators=(',',':')).encode();jraw+=b' '*(-len(jraw)%4);binraw=bytes(buf);binraw+=b'\0'*(-len(binraw)%4);glb=struct.pack('<4sII',b'glTF',2,28+len(jraw)+len(binraw))+struct.pack('<II',len(jraw),0x4E4F534A)+jraw+struct.pack('<II',len(binraw),0x004E4942)+binraw;out.write_bytes(glb)
assert bytes(buf[:len(binary)])==binary and SOURCE.read_bytes()==raw
# Exact-position welded topology check, allowing source UV seam duplication.
weld={};wids=[]
for q in allpoints:
 if q not in weld:weld[q]=len(weld)
 wids.append(weld[q])
ec=Counter();orientation=Counter();degenerate=[]
for k,f in enumerate(allfaces):
 wf=[wids[v] for v in f]
 if len(set(wf))!=3:degenerate.append(k)
 for x,y in zip(wf,wf[1:]+wf[:1]):ec[tuple(sorted((x,y)))]+=1;orientation[tuple(sorted((x,y)))]+=1 if x<y else -1
proof={'source_sha256':SOURCE_SHA,'reference_sha256':REFERENCE_SHA,'candidate_sha256':sha(glb),'candidate_bytes':len(glb),'source_unchanged':True,'original_bin_prefix_byte_identical':True,'all_original_positions_uv_normals_retained':True,'original_vertex_position_deltas':0,'retained_source_triangle_order_identical':True,'removed_source_face_ids':sorted(removed),'source_hand_boundary_vertex_ids':oldring,'added_hand_vertices':len(newpoints),'added_hand_faces':len(newfaces),'bridge_faces':bridge,'skin_uv_from_source_vertex':skin_source_vertex,'skin_uv':uvs[skin_source_vertex],'texture_and_original_materials_unchanged':True,'no_hair_face_accessory_islands_removed':True,'welded_edge_incidence_histogram':dict(Counter(ec.values())),'boundary_edges':sum(c==1 for c in ec.values()),'nonmanifold_edges':sum(c>2 for c in ec.values()),'inconsistent_two_face_winding_edges':sum(c==2 and orientation[e]!=0 for e,c in ec.items()),'degenerate_faces':degenerate,'fingers_source_coordinate_landmarks':fingers,'visual_approved':False,'game_integrated':False,'limits':['Reference constrains front gesture only; hand back/thickness are conservative interpretation.','New skin UV is sampled from existing hand; no skin texture painted.','No full triangle self-intersection or deformation certificate is claimed.']}
(a.output/'hand-refinement-proof.json').write_text(json.dumps(proof,indent=2))
assert not degenerate and proof['boundary_edges']==0 and proof['nonmanifold_edges']==0 and proof['inconsistent_two_face_winding_edges']==0,'Candidate topology guard failed'
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(out));bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(a.output/'rindi-reaching-hand-candidate.blend'))
if a.render:
 render_views(a.output/'candidate-hand-close',(-.15,-.282,.105),.205)
 render_views(a.output/'candidate-whole',(.0097,.028,-.008),.934*1.16)
print(json.dumps({'status':'candidate_created','glb':str(out),'sha256':sha(glb),'removed_faces':len(removed),'new_vertices':len(newpoints),'topology':proof['welded_edge_incidence_histogram']}),flush=True)

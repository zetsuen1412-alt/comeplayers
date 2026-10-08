"""Atlas narrow additive, source-conforming olive roll rim/spiral candidate.

Original BIN prefix, accessors, triangle indices, nodes, images and materials
stay exact. A separately labelled closed-tube primitive is added on the one
reference-visible roll end. Its centerline is projected onto actual mesh;
subsurface embedding is intentional, not a body-manifold union certificate.
"""
from pathlib import Path
import argparse,sys,json,struct,hashlib,copy,math
from collections import Counter
import bpy,numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT=Path(__file__).resolve().parent;WORKSPACE=ROOT.parents[2]
SOURCE_SHA='9c9cd775fa42fbab656e0116a937b8ec0902b4da7df9f1882a999e4bf8f5242f'
REF_SHA='402a17b7f62d122de4af24da00d51cb36c2acfc027c733f8ff8e586451b3f71f'
p=argparse.ArgumentParser();p.add_argument('--source',type=Path,default=WORKSPACE/'outputs/model-review-2026-10-05/viewer/models/atlas.glb');p.add_argument('--reference',type=Path,default=WORKSPACE/'outputs/model-review-2026-10-05/viewer/references/atlas.png');p.add_argument('--output',required=True,type=Path);p.add_argument('--rim-radius',type=float,default=.053);p.add_argument('--spiral-radius',type=float,default=.044);a=p.parse_args(sys.argv[sys.argv.index('--')+1:])
SOURCE=a.source.resolve(strict=True);REFERENCE=a.reference.resolve(strict=True);outdir=a.output.resolve();assert not outdir.exists();assert not SOURCE.is_relative_to(outdir) and not REFERENCE.is_relative_to(outdir);outdir.mkdir(parents=True)
raw=SOURCE.read_bytes();assert hashlib.sha256(raw).hexdigest()==SOURCE_SHA and hashlib.sha256(REFERENCE.read_bytes()).hexdigest()==REF_SHA
assert struct.unpack_from('<4sII',raw)==(b'glTF',2,len(raw));jlen,jkind=struct.unpack_from('<II',raw,12);assert jkind==0x4e4f534a;doc=json.loads(raw[20:20+jlen]);binary=raw[28+jlen:]
def read(i):
 ac=doc['accessors'][i];view=doc['bufferViews'][ac['bufferView']];n={'SCALAR':1,'VEC2':2,'VEC3':3}[ac['type']];code={5126:'f',5125:'I',5123:'H'}[ac['componentType']];fmt='<'+code*n;start=view.get('byteOffset',0)+ac.get('byteOffset',0);stride=view.get('byteStride',struct.calcsize(fmt));return np.array([struct.unpack_from(fmt,binary,start+k*stride) for k in range(ac['count'])])
original=doc['meshes'][0]['primitives'][0];attrs=original['attributes'];points=read(attrs['POSITION']);uvs=read(attrs['TEXCOORD_0']);normals=read(attrs['NORMAL']);faces=read(original['indices']).reshape(-1,3).astype(int)
bvh=BVHTree.FromPolygons([Vector(v) for v in points],[tuple(f) for f in faces],all_triangles=True,epsilon=0)
axis=Vector((-.735,0,-.678)).normalized();vertical=Vector((0,1,0));lateral=axis.cross(vertical).normalized();center=Vector((-.347,.192,-.103))
ROI_LO=(-.42,.125,-.175);ROI_HI=(-.265,.265,.005)
projected=[]
def surface(target):
 hit,face_normal,face_id,distance=bvh.ray_cast(target+axis*.20,-axis,.40)
 assert hit is not None and face_id is not None,'No supporting source surface'
 assert all(ROI_LO[k]<=hit[k]<=ROI_HI[k] for k in range(3)),('Supporting ray escaped roll ROI',tuple(hit),face_id)
 triangle=points[faces[face_id]];aa,bb,cc=(Vector(q) for q in triangle);v0=bb-aa;v1=cc-aa;v2=hit-aa;d00=v0.dot(v0);d01=v0.dot(v1);d11=v1.dot(v1);d20=v2.dot(v0);d21=v2.dot(v1);den=d00*d11-d01*d01;assert abs(den)>1e-20
 v=(d11*d20-d01*d21)/den;w=(d00*d21-d01*d20)/den;weights=(1-v-w,v,w);normal=sum((Vector(normals[i])*weight for i,weight in zip(faces[face_id],weights)),Vector((0,0,0))).normalized()
 assert normal.dot(axis)>.15,('Supporting normal not roll-facing',normal.dot(axis),face_id)
 projected.append({'surface_position':tuple(hit),'normal':tuple(normal),'source_face_id':int(face_id),'barycentric':weights})
 return hit,normal

vertices=[];newfaces=[];labels=[]
def tube(label,targets,radius,closed,cross_segments=12):
 support=[surface(Vector(t)) for t in targets];line=[hit+normal*.00025 for hit,normal in support];start=len(vertices);count=len(line)
 for i,(position,(_,normal)) in enumerate(zip(line,support)):
  tangent=(line[(i+1)%count]-line[(i-1)%count]).normalized() if closed else (line[min(i+1,count-1)]-line[max(0,i-1)]).normalized();n=(normal-tangent*normal.dot(tangent)).normalized();side=tangent.cross(n).normalized()
  for j in range(cross_segments):
   theta=j*2*math.pi/cross_segments;vertices.append(tuple(position+radius*(math.cos(theta)*n+math.sin(theta)*side)))
 for i in range(count if closed else count-1):
  next_i=(i+1)%count
  for j in range(cross_segments):
   next_j=(j+1)%cross_segments;aa=start+i*cross_segments+j;bb=start+i*cross_segments+next_j;cc=start+next_i*cross_segments+j;dd=start+next_i*cross_segments+next_j;newfaces.extend([(aa,dd,cc),(aa,bb,dd)]);labels.extend([label,label])
 if not closed:
  first_center=len(vertices);vertices.append(tuple(line[0]));last_center=len(vertices);vertices.append(tuple(line[-1]))
  for j in range(cross_segments):
   next_j=(j+1)%cross_segments;newfaces.extend([(first_center,start+next_j,start+j),(last_center,start+(count-1)*cross_segments+j,start+(count-1)*cross_segments+next_j)]);labels.extend([label,label])
 return {'label':label,'support_samples':count,'tube_radius':radius,'source_surface_embedding_offset':.00025,'support_source_faces':sorted({r['source_face_id'] for r in projected[-count:]})}

rimtargets=[tuple(center+a.rim_radius*(math.cos(t)*vertical+math.sin(t)*lateral)) for t in np.linspace(0,2*math.pi,128,endpoint=False)]
parts=[tube('reference-visible olive mat outer rim',rimtargets,.0018,True,12)]
spiraltargets=[]
for t in np.linspace(0,4.4*math.pi,320):
 t=float(t);radius=.005+(a.spiral_radius-.005)*t/(4.4*math.pi);spiraltargets.append(tuple(center+radius*(math.cos(t)*vertical+math.sin(t)*lateral)))
parts.append(tube('reference-visible olive mat shallow spiral ridge',spiraltargets,.0012,False,10))
newpositions=np.array(vertices,dtype=np.float32);newfaces=np.array(newfaces,dtype=np.uint32);newnormals=np.zeros_like(newpositions,dtype=np.float64)
for f in newfaces:
 aa,bb,cc=newpositions[f];weighted=np.cross(bb-aa,cc-aa)
 for i in f:newnormals[i]+=weighted
length=np.linalg.norm(newnormals,axis=1);assert np.all(length>1e-15);newnormals=(newnormals/length[:,None]).astype(np.float32)
counts=Counter();winding=Counter()
for f in newfaces:
 for aa,bb in zip(f,np.roll(f,-1)):
  edge=tuple(sorted((int(aa),int(bb))));counts[edge]+=1;winding[edge]+=1 if aa<bb else -1
assert all(c==2 for c in counts.values()) and all(v==0 for v in winding.values())
triangle_areas=np.linalg.norm(np.cross(newpositions[newfaces[:,1]]-newpositions[newfaces[:,0]],newpositions[newfaces[:,2]]-newpositions[newfaces[:,0]]),axis=1)/2;assert np.all(triangle_areas>1e-13)
signed_volume=sum(float(np.dot(newpositions[f[0]],np.cross(newpositions[f[1]],newpositions[f[2]]))) for f in newfaces)/6;assert signed_volume>0
outputdoc=copy.deepcopy(doc);buf=bytearray(binary)
def append(rows,kind,component):
 while len(buf)%4:buf.append(0)
 rows=np.asarray(rows,dtype='<f4' if component==5126 else '<u4');start=len(buf);buf.extend(rows.tobytes());view=len(outputdoc['bufferViews']);outputdoc['bufferViews'].append({'buffer':0,'byteOffset':start,'byteLength':rows.nbytes});accessor={'bufferView':view,'componentType':component,'count':len(rows),'type':kind}
 if kind=='VEC3':accessor.update({'min':rows.min(0).tolist(),'max':rows.max(0).tolist()})
 index=len(outputdoc['accessors']);outputdoc['accessors'].append(accessor);return index
sample_vertex=17218;sample_uv=uvs[sample_vertex];newuv=np.repeat(sample_uv[None,:],len(newpositions),axis=0)
position_accessor=append(newpositions,'VEC3',5126);normal_accessor=append(newnormals,'VEC3',5126);uv_accessor=append(newuv,'VEC2',5126);index_accessor=append(newfaces.reshape(-1,1),'SCALAR',5125)
material=copy.deepcopy(doc['materials'][original.get('material',0)]);material['name']='Atlas | source-texture sampled olive roll detail';material['pbrMetallicRoughness']['baseColorFactor']=[.76,.86,.55,1];material['pbrMetallicRoughness']['roughnessFactor']=.55
material_index=len(outputdoc['materials']);outputdoc['materials'].append(material);outputdoc['meshes'][0]['primitives'].append({'attributes':{'POSITION':position_accessor,'NORMAL':normal_accessor,'TEXCOORD_0':uv_accessor},'indices':index_accessor,'material':material_index,'mode':4});outputdoc['buffers'][0]['byteLength']=len(buf)
jsonraw=json.dumps(outputdoc,separators=(',',':')).encode();jsonraw+=b' '*(-len(jsonraw)%4);binraw=bytes(buf);binraw+=b'\0'*(-len(binraw)%4);candidate=struct.pack('<4sII',b'glTF',2,28+len(jsonraw)+len(binraw))+struct.pack('<II',len(jsonraw),0x4e4f534a)+jsonraw+struct.pack('<II',len(binraw),0x004e4942)+binraw;out=outdir/'atlas-roll-rim-spiral-candidate.glb';out.write_bytes(candidate)
assert outputdoc['meshes'][0]['primitives'][:-1]==doc['meshes'][0]['primitives'] and binraw[:len(binary)]==binary
for key in ('nodes','scenes','scene','images','textures','samplers','asset'):
 assert outputdoc.get(key)==doc.get(key),key
assert outputdoc['materials'][:-1]==doc['materials'] and outputdoc['accessors'][:len(doc['accessors'])]==doc['accessors'] and outputdoc['bufferViews'][:len(doc['bufferViews'])]==doc['bufferViews'] and SOURCE.read_bytes()==raw
proof={'source_sha256':SOURCE_SHA,'reference_sha256':REF_SHA,'candidate_sha256':hashlib.sha256(candidate).hexdigest(),'source_bin_prefix_exact':True,'original_primitive_index_and_attributes_exact':True,'original_materials_images_nodes_accessors_views_unchanged':True,'source_vertex_delta_count':0,'source_faces_removed':0,'added_vertices':len(newpositions),'added_faces':len(newfaces),'source_faces':len(faces),'candidate_faces':len(faces)+len(newfaces),'parts':parts,'projection_support_samples':projected,'selected_source_coordinate_roi':[ROI_LO,ROI_HI],'added_geometry_bounds_raw':[newpositions.min(0).tolist(),newpositions.max(0).tolist()],'source_uv_sample_vertex':sample_vertex,'source_uv_sample':sample_uv.tolist(),'new_material_base_color_factor':[.76,.86,.55,1],'topology_scope':'New detail tubes only; original source untouched. Components intentionally penetrate/overlap existing roll surface; no welded global manifold/union certificate.','added_closed_edge_histogram':dict(Counter(counts.values())),'added_inconsistent_winding_edges':sum(v!=0 for v in winding.values()),'added_minimum_triangle_area':float(triangle_areas.min()),'added_signed_volume':signed_volume,'approved':False,'gameIntegrated':False,'limits':['One visible olive mat roll end only; hidden end and backpack remain original.','Reference supports coil motif, not precise hidden thickness.','Sampled source texture point with procedural color factor; no image editing.','Intended surface intersections/independent closed components; no body union, full self-intersection or deformation certificate.']}
(outdir/'roll-preservation-proof.json').write_text(json.dumps(proof,indent=2))
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(out));bpy.ops.file.pack_all();blend=outdir/'atlas-roll-rim-spiral-candidate.blend';bpy.ops.wm.save_as_mainfile(filepath=str(blend));assert SOURCE.read_bytes()==raw
print(json.dumps({'candidate':str(out),'sha256':proof['candidate_sha256'],'added_vertices':len(newpositions),'added_faces':len(newfaces),'source_faces_removed':0,'signed_volume':signed_volume,'blend':str(blend)}),flush=True)

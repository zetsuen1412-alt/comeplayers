"""Independent read-only actual GLB preservation/topology + packed-blend reopen."""
from pathlib import Path
import argparse,sys,runpy,json,hashlib,struct
from collections import Counter,defaultdict
import bpy,numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parent;WORKSPACE=ROOT.parents[2]
p=argparse.ArgumentParser();p.add_argument('--candidate',type=Path,required=True);a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);candidate=a.candidate.resolve(strict=True);folder=candidate.parent;source=WORKSPACE/'outputs/model-review-2026-10-05/viewer/models/atlas.glb';blend=candidate.with_suffix('.blend')
assert not (folder/'independent-preservation-topology-audit.json').exists() and not (folder/'native-reopen-proof.json').exists()
def sha(raw):return hashlib.sha256(raw).hexdigest()
source_raw=source.read_bytes();candidate_raw=candidate.read_bytes();blend_raw=blend.read_bytes();validator=runpy.run_path(str(WORKSPACE/'work/model-rebuild/tools/validate_roster_candidate.py'));sdoc,sbin=validator['parse_glb'](source_raw);cdoc,cbin=validator['parse_glb'](candidate_raw)
assert sha(source_raw)=='9c9cd775fa42fbab656e0116a937b8ec0902b4da7df9f1882a999e4bf8f5242f'
actual=validator['validate_model'](candidate_raw);assert actual['faces']==45028 and actual['vertices']==31672 and actual['images']==2 and actual['skins']==actual['clips']==0
assert cbin[:len(sbin)]==sbin and cdoc['accessors'][:len(sdoc['accessors'])]==sdoc['accessors'] and cdoc['bufferViews'][:len(sdoc['bufferViews'])]==sdoc['bufferViews']
assert cdoc['meshes'][0]['primitives'][:-1]==sdoc['meshes'][0]['primitives'] and cdoc['materials'][:-1]==sdoc['materials']
for key in ('nodes','scenes','scene','images','textures','samplers','asset'):
 assert cdoc.get(key)==sdoc.get(key),key
def accessor(doc,binary,i):
 ac=doc['accessors'][i];v=doc['bufferViews'][ac['bufferView']];size={'SCALAR':1,'VEC2':2,'VEC3':3}[ac['type']];code={5126:'f',5125:'I',5123:'H'}[ac['componentType']];fmt='<'+size*code;start=v.get('byteOffset',0)+ac.get('byteOffset',0);stride=v.get('byteStride',struct.calcsize(fmt));return np.array([struct.unpack_from(fmt,binary,start+k*stride) for k in range(ac['count'])])
old=sdoc['meshes'][0]['primitives'][0];new=cdoc['meshes'][0]['primitives'][-1];positions=accessor(cdoc,cbin,new['attributes']['POSITION']);faces=accessor(cdoc,cbin,new['indices']).reshape(-1,3).astype(int);source_positions=accessor(sdoc,sbin,old['attributes']['POSITION']);source_faces=accessor(sdoc,sbin,old['indices']).reshape(-1,3).astype(int)
edges=Counter();directions=Counter();adjacent=defaultdict(set)
for f in faces:
 for x,y in zip(f,np.roll(f,-1)):
  x,y=int(x),int(y);edges[tuple(sorted((x,y)))]+=1;directions[tuple(sorted((x,y)))]+=1 if x<y else -1;adjacent[x].add(y);adjacent[y].add(x)
assert all(c==2 for c in edges.values()) and all(v==0 for v in directions.values())
remaining=set(range(len(positions)));components=[]
while remaining:
 first=next(iter(remaining));todo=[first];component=set()
 while todo:
  i=todo.pop()
  if i in component:continue
  component.add(i);todo.extend(adjacent[i]-component)
 remaining-=component;components.append(component)
assert len(components)==2
areas=np.linalg.norm(np.cross(positions[faces[:,1]]-positions[faces[:,0]],positions[faces[:,2]]-positions[faces[:,0]]),axis=1)/2;assert np.all(areas>0)
bvh=BVHTree.FromPolygons([Vector(q) for q in source_positions],[tuple(f) for f in source_faces],all_triangles=True,epsilon=0)
distances=np.array([bvh.find_nearest(Vector(q))[3] for q in positions]);assert np.all(np.isfinite(distances))
edge_lengths=np.stack([np.linalg.norm(positions[faces[:,i]]-positions[faces[:,(i+1)%3]],axis=1) for i in range(3)],axis=1)
# Distance to a closed set is 1-Lipschitz: any triangle point is at most its
# diameter from a vertex. All-added-surface support bound includes 1e-6 numeric
# guard; it is proximity evidence, not a welded union or containment proof.
surface_support_bound=float(np.max(distances[faces].min(1)+edge_lengths.max(1))+1e-6);assert surface_support_bound<.007
report={'source_sha256':sha(source_raw),'candidate_sha256':sha(candidate_raw),'actual':actual,'original_bin_prefix_byte_identical':True,'original_primitive_and_index_bytes_exact':True,'original_accessors_views_materials_images_nodes_exact':True,'source_vertex_position_delta_count':0,'source_triangles_removed':0,'source_triangles_retained':len(source_faces),'new_vertices':len(positions),'new_faces':len(faces),'new_closed_components':2,'new_component_vertex_counts':[len(v) for v in components],'new_boundary_or_nonmanifold_edges':0,'new_inconsistent_winding_edges':0,'new_zero_area_triangles':0,'minimum_added_triangle_area':float(areas.min()),'maximum_added_vertex_nearest_source_distance':float(distances.max()),'all_added_triangle_points_source_proximity_upper_bound':surface_support_bound,'support_bound_method':'Distance is1-Lipschitz; minvertexdistance+trianglediameter, with1e-6numericguard.','scope':'Original source remains untouched; closed added rim/spiral intentionally overlap source mat surface. No global mesh union/manifold/self-intersection/deformation certificate.','approved':False,'gameIntegrated':False}
(folder/'independent-preservation-topology-audit.json').write_text(json.dumps(report,indent=2))
bpy.ops.wm.open_mainfile(filepath=str(blend));file_images=[i for i in bpy.data.images if i.source=='FILE'];assert len(file_images)==2 and all(i.packed_file is not None and len(i.packed_file.data)>0 for i in file_images)
mesh_objects=[o for o in bpy.context.scene.objects if o.type=='MESH'];assert sum(len(o.data.polygons) for o in mesh_objects)==actual['faces']
image_records=[{'name':i.name,'size':list(i.size),'packed':True,'packed_bytes':len(i.packed_file.data),'packed_sha256':sha(bytes(i.packed_file.data)),'color_space':i.colorspace_settings.name} for i in file_images]
source_image_hashes=[]
for image in sdoc['images']:
 view=sdoc['bufferViews'][image['bufferView']];start=view.get('byteOffset',0);source_image_hashes.append(sha(sbin[start:start+view['byteLength']]))
reopen={'blend_sha256':sha(blend_raw),'candidate_sha256':sha(candidate_raw),'passed':True,'blender_version':bpy.app.version_string,'packed_file_images':len(file_images),'images':image_records,'packed_image_bytes_match_source_images':sorted(source_image_hashes)==sorted(r['packed_sha256'] for r in image_records),'mesh_objects':len(mesh_objects),'triangles':sum(len(o.data.polygons) for o in mesh_objects),'blend_bytes_unchanged_after_reopen':True,'approved':False,'gameIntegrated':False}
assert blend.read_bytes()==blend_raw and source.read_bytes()==source_raw and candidate.read_bytes()==candidate_raw
(folder/'native-reopen-proof.json').write_text(json.dumps(reopen,indent=2));print(json.dumps({'integrity_passed':True,'actual':actual,'new_components':2,'source_proximity_bound':surface_support_bound,'native_reopen':reopen}),flush=True)

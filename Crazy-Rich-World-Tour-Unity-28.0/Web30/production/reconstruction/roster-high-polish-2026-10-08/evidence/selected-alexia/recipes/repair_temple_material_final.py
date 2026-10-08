"""Route only dark upper lateral head triangles to clean lavender PBR.

Same original positions, normals and skin weights; no decorative hair volume.
The patch is an open partition of the source surface, not a new closed clump.
Its explicit upper-lateral gate replaces the old blanket forehead exclusion.
Standalone Python/NumPy. No image editing, historical imports or network.
"""
import argparse, copy, hashlib, json, pathlib, struct
import numpy as np

SOURCE_PIN='45e8635c3097444e726eceab22ba0d4c4070202da129dbcfffa33022b5423328'
AXES=np.array([-1.,1.,-1.])
PARAMETERS={'y_min':.335,'y_max':.47,'center_x':-.006,'centered_abs_x_min':.095,
 'centered_abs_x_max':.19,'z_min':.05,'z_max':.17,'actual_head_weight':1.,'minimum_selected_alpha':.99,
 'mean_triangle_max_linear_rgb':.08,'any_vertex_max_linear_rgb':.17,
 'skin_red_minus_green_min':.04,'skin_green_minus_blue_min':.025,'skin_red_min':.18}
def need(ok,message):
 if not ok:raise ValueError(message)
def sha(raw):return hashlib.sha256(raw).hexdigest()
def read(raw):
 need(struct.unpack_from('<4sII',raw)==(b'glTF',2,len(raw)),'GLB header')
 n,k=struct.unpack_from('<II',raw,12);need(k==0x4e4f534a,'JSON chunk')
 nb,k=struct.unpack_from('<II',raw,20+n);need(k==0x004e4942 and 28+n+nb==len(raw),'BIN chunk')
 return json.loads(raw[20:20+n]),raw[28+n:]
def acc(d,b,i):
 a=d['accessors'][i];v=d['bufferViews'][a['bufferView']];w={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
 need('byteStride' not in v and 'sparse' not in a,'Packed source streams required')
 return np.frombuffer(b,dtype={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']],count=a['count']*w,offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,w)
def append_indices(d,b,indices):
 while len(b)%4:b.append(0)
 raw=np.asarray(indices,dtype='<u4').reshape(-1).tobytes();off=len(b);b.extend(raw)
 view=len(d['bufferViews']);d['bufferViews'].append({'buffer':0,'byteOffset':off,'byteLength':len(raw),'target':34963})
 i=len(d['accessors']);d['accessors'].append({'bufferView':view,'componentType':5125,'count':len(raw)//4,'type':'SCALAR'});return i
def append_attribute(d,b,values,source_accessor):
 while len(b)%4:b.append(0)
 raw=np.ascontiguousarray(values).tobytes();off=len(b);b.extend(raw)
 view=len(d['bufferViews']);d['bufferViews'].append({'buffer':0,'byteOffset':off,'byteLength':len(raw),'target':34962})
 original=d['accessors'][source_accessor]
 accessor={'bufferView':view,'componentType':original['componentType'],'count':len(values),'type':original['type']}
 if original.get('normalized') is not None:accessor['normalized']=original['normalized']
 if original['type']=='VEC3':accessor.update(min=values.min(0).astype(float).tolist(),max=values.max(0).astype(float).tolist())
 i=len(d['accessors']);d['accessors'].append(accessor);return i
def linear(rgb):
 rgb=np.asarray(rgb);return np.where(rgb<=.04045,rgb/12.92,((rgb+.055)/1.055)**2.4)
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--source',required=True,type=pathlib.Path);p.add_argument('--output-parent',required=True,type=pathlib.Path);a=p.parse_args()
 source=a.source.resolve(strict=True);out=a.output_parent.resolve();need(not out.exists() and not out.is_relative_to(source.parent),'Fresh external output required')
 raw=source.read_bytes();pin=(sha(raw),source.stat().st_mtime_ns);need(pin[0]==SOURCE_PIN,'Selected coherent-hair source pin')
 original,old=read(raw);d=copy.deepcopy(original);b=bytearray(old);core=original['meshes'][0]['primitives'][0];at=core['attributes']
 positions=acc(d,old,at['POSITION']).astype(float)*AXES;rgba=acc(d,old,at['COLOR_0']);colors=rgba[:,:3].astype(float)
 joints=acc(d,old,at['JOINTS_0']);weights=acc(d,old,at['WEIGHTS_0']);faces=acc(d,old,core['indices']).reshape(-1,3)
 headnode=next(i for i,n in enumerate(d['nodes']) if n.get('name')=='AlexiaPrototype_Head');head=d['skins'][0]['joints'].index(headnode);need(head==5,'Actual Head slot')
 x,y,z=positions.T;ax=abs(x+.006)
 spatial=(y>.335)&(y<.47)&(ax>.095)&(ax<.19)&(z>.05)&(z<.17)
 head_rigid=np.sum(weights*(joints==head),axis=1)==1.
 skin=(colors[:,0]>.18)&((colors[:,0]-colors[:,1])>.04)&((colors[:,1]-colors[:,2])>.025)
 # Every triangle vertex is in the upper lateral hair envelope and Head1.
 # Its mean paint is dark; a vertex ceiling excludes mixed bright/skin edges.
 allowed=spatial&head_rigid&~skin&(rgba[:,3]>=.99)
 mean=colors[faces].mean(1).max(1);maximum=colors[faces].max(axis=(1,2))
 selected=allowed[faces].all(1)&(mean<.08)&(maximum<.17)
 ids=np.flatnonzero(selected);vertices=np.unique(faces[selected]);need(500<len(ids)<6000,'Bounded meaningful temple subset required')
 critical=(y<=.335)|(ax<=.095)|skin
 need(not critical[vertices].any(),'Lower eyes, central forehead and skin exact')
 need(np.all(head_rigid[vertices]),'Actual Head1 surface only')
 d['meshes'][0]['primitives'][0]['indices']=append_indices(d,b,faces[~selected])
 material=len(d['materials']);hair=original['meshes'][0]['primitives'][1]
 rgb=np.median(acc(original,old,hair['attributes']['COLOR_0'])[:,:3],axis=0).astype(float).tolist()
 d['materials'].append({'name':'Alexia clean upper lateral temple lavender surface',
  'pbrMetallicRoughness':{'baseColorFactor':rgb+[1.],'metallicFactor':0.,'roughnessFactor':.68},'doubleSided':False})
 compact={};attribute_proof={}
 for key in ['POSITION','NORMAL','JOINTS_0','WEIGHTS_0']:
  subset=np.ascontiguousarray(acc(original,old,at[key])[vertices]);compact[key]=append_attribute(d,b,subset,at[key])
  attribute_proof[key]={'source_accessor':at[key],'compact_accessor':compact[key],'original_subset_sha256':sha(subset.tobytes()),'compact_bytes_exact':True}
 local_faces=np.searchsorted(vertices,faces[selected])
 need(np.array_equal(vertices[local_faces],faces[selected]),'Exact triangle mapping/order/winding')
 patch={'attributes':compact,'indices':append_indices(d,b,local_faces),'material':material,'mode':4}
 d['meshes'][0]['primitives'].append(patch);d['buffers'][0]['byteLength']=len(b)
 need(b[:len(old)]==old and d['accessors'][:len(original['accessors'])]==original['accessors'] and d['bufferViews'][:len(original['bufferViews'])]==original['bufferViews'],'Original BIN and source accessor/view prefixes exact')
 for key in original:
  if key not in ['meshes','materials','accessors','bufferViews','buffers']:need(d[key]==original[key],'Protected document exact '+key)
 need(d['meshes'][1:]==original['meshes'][1:] and d['materials'][:-1]==original['materials'],'Other meshes/materials exact')
 need(d['meshes'][0]['primitives'][1:-1]==original['meshes'][0]['primitives'][1:],'Every authored hair/body/hardware primitive exact')
 need(d['meshes'][0]['primitives'][0]['attributes']==at,'Original core streams exact')
 need(np.array_equal(np.sort(np.concatenate((np.flatnonzero(~selected),ids))),np.arange(len(faces))),'Exact disjoint source triangle partition')
 js=json.dumps(d,separators=(',',':')).encode();js+=b' '*((-len(js))%4);b+=bytes((-len(b))%4)
 candidate=struct.pack('<4sII',b'glTF',2,28+len(js)+len(b))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(b),0x004e4942)+b
 out.mkdir(parents=True);model=out/'alexia.glb';model.write_bytes(candidate)
 mask=out/'temple-surface-mask.npz';np.savez_compressed(mask,selected_source_core_triangle_indices=ids,selected_source_vertex_indices=vertices,
  retained_source_core_triangle_indices=np.flatnonzero(~selected),spatial_head_guard_indices=np.flatnonzero(allowed),critical_face_skin_indices=np.flatnonzero(critical))
 proof={'schema':'crwt.alexia.temple_material_surface.v2_compact','passed':True,'visual_accepted':False,
  'source_sha256':SOURCE_PIN,'candidate_sha256':sha(candidate),'candidate_bytes':len(candidate),
  'recipe_sha256':sha(pathlib.Path(__file__).read_bytes()),'mask_npz_sha256':sha(mask.read_bytes()),
  'parameters':PARAMETERS,'core_mesh':0,'core_primitive':0,'core_source_triangles':len(faces),
  'routed_temple_triangles':len(ids),'routed_vertex_count':len(vertices),'routed_source_triangle_ids':ids.tolist(),
  'new_patch_primitive_index':len(d['meshes'][0]['primitives'])-1,'new_patch_material_index':material,
  'patch_world_bounds':[positions[vertices].min(0).tolist(),positions[vertices].max(0).tolist()],
  'source_primitive_material_has_baseColorTexture':False,
  'byte_exact_source_POSITION_NORMAL_JOINTS_WEIGHTS_subsets_used':True,'compact_attribute_proof':attribute_proof,'compact_vertex_mapping_key':'selected_source_vertex_indices','selected_alpha_min':float(rgba[vertices,3].min()),'all_selected_alpha_at_least_099':True,'PBR_baseColorFactor_from_actual_hair_linear_COLOR_median':rgb,'patch_has_no_UV_COLOR_texture_multiplier':True,
  'patch_is_open_shared_source_surface_not_a_closed_added_component':True,
  'source_triangles_exact_partition_no_rendered_geometry_added_or_deleted':True,
  'all_original_BIN_streams_UV_images_rig_actions_defaultscene_exact':True,
  'all_authored_hair_body_band_and_generated_cups_unchanged':True,
  'all_patch_rows_actual_Head1':True,'critical_face_skin_vertex_incidence':0,
  'old_blanket_face_bbox_policy_replaced_by_explicit_upper_lateral_dark_hair_policy':True,
  'limits':['Material routing can reveal original coarse geometry; no new surface volume is claimed.',
    'An upper lateral dark-paint semantic region is used; old blanket front bbox masks are not claimed immutable.',
    'Remaining border black paint and patch smoothness require actual front/quarter review.'],
  'gameIntegrated':False}
 need((sha(source.read_bytes()),source.stat().st_mtime_ns)==pin,'Source SHA/mtime unchanged');proof['source_SHA_mtime_unchanged']=True
 (out/'temple-material-proof.json').write_bytes((json.dumps(proof,indent=2)+'\n').encode('utf-8'))
 print(json.dumps({k:proof[k] for k in ['candidate_sha256','candidate_bytes','routed_temple_triangles','routed_vertex_count','patch_world_bounds','new_patch_primitive_index','new_patch_material_index']}))
if __name__=='__main__':main()

from pathlib import Path
HERE=Path(__file__).resolve().parent
text=(HERE/'repair_temple_material.py').read_text(encoding='utf-8')
pos=text.index('def linear(rgb):')
text=text[:pos]+'''def append_attribute(d,b,values,source_accessor):
 while len(b)%4:b.append(0)
 raw=np.ascontiguousarray(values).tobytes();off=len(b);b.extend(raw)
 view=len(d['bufferViews']);d['bufferViews'].append({'buffer':0,'byteOffset':off,'byteLength':len(raw),'target':34962})
 original=d['accessors'][source_accessor]
 accessor={'bufferView':view,'componentType':original['componentType'],'count':len(values),'type':original['type']}
 if original.get('normalized') is not None:accessor['normalized']=original['normalized']
 if original['type']=='VEC3':accessor.update(min=values.min(0).astype(float).tolist(),max=values.max(0).astype(float).tolist())
 i=len(d['accessors']);d['accessors'].append(accessor);return i
'''+text[pos:]
text=text.replace("colors=acc(d,old,at['COLOR_0'])[:,:3].astype(float)", "rgba=acc(d,old,at['COLOR_0']);colors=rgba[:,:3].astype(float)")
text=text.replace("allowed=spatial&head_rigid&~skin", "allowed=spatial&head_rigid&~skin&(rgba[:,3]>=.99)")
text=text.replace("material=len(d['materials']);rgb=linear([.88,.819,.957]).tolist()", "material=len(d['materials']);hair=original['meshes'][0]['primitives'][1]\n rgb=np.median(acc(original,old,hair['attributes']['COLOR_0'])[:,:3],axis=0).astype(float).tolist()")
old="patch={'attributes':{k:at[k] for k in ['POSITION','NORMAL','JOINTS_0','WEIGHTS_0']},\n        'indices':append_indices(d,b,faces[selected]),'material':material,'mode':4}"
new="""compact={};attribute_proof={}
 for key in ['POSITION','NORMAL','JOINTS_0','WEIGHTS_0']:
  subset=np.ascontiguousarray(acc(original,old,at[key])[vertices]);compact[key]=append_attribute(d,b,subset,at[key])
  attribute_proof[key]={'source_accessor':at[key],'compact_accessor':compact[key],'original_subset_sha256':sha(subset.tobytes()),'compact_bytes_exact':True}
 local_faces=np.searchsorted(vertices,faces[selected])
 need(np.array_equal(vertices[local_faces],faces[selected]),'Exact triangle mapping/order/winding')
 patch={'attributes':compact,'indices':append_indices(d,b,local_faces),'material':material,'mode':4}"""
assert old in text;text=text.replace(old,new)
text=text.replace('crwt.alexia.temple_material_surface.v1','crwt.alexia.temple_material_surface.v2_compact')
text=text.replace("'same_source_POSITION_NORMAL_JOINTS_WEIGHTS_accessors_used':True", "'byte_exact_source_POSITION_NORMAL_JOINTS_WEIGHTS_subsets_used':True,'compact_attribute_proof':attribute_proof,'compact_vertex_mapping_key':'selected_source_vertex_indices','selected_alpha_min':float(rgba[vertices,3].min()),'all_selected_alpha_at_least_099':True,'PBR_baseColorFactor_from_actual_hair_linear_COLOR_median':rgb")
text=text.replace("'actual_head_weight':1.,", "'actual_head_weight':1.,'minimum_selected_alpha':.99,")
out=HERE/'repair_temple_material_final.py'
assert not out.exists();compile(text,str(out),'exec');out.write_bytes(text.encode('utf-8'));print(out)

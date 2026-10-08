"""Portable Blender 5.2 animated asset fingerprints; does not alter the asset."""
import sys
sys.dont_write_bytecode=True
import array, hashlib, json, math, re, struct
from pathlib import Path
import bpy

def require(ok,message):
    if not ok:raise ValueError(message)
def sha(raw):return hashlib.sha256(raw).hexdigest()
def file_sha(path):return sha(Path(path).read_bytes())
def canonical(name):return re.sub(r'\.\d{3}$','',str(name))
def digest_json(value):return sha(json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False).encode())
def floats(data,prop,width):
    a=array.array('f',[0])*(len(data)*width);data.foreach_get(prop,a)
    require(all(math.isfinite(x) for x in a),'Nonfinite '+prop);return a.tobytes()
def integers(data,prop):
    a=array.array('i',[0])*len(data);data.foreach_get(prop,a);return a.tobytes()
def float_matrix(m):return sha(struct.pack('<16f',*(v for row in m for v in row)))
def image_fingerprints():
    rows=[]
    for image in bpy.data.images:
        if image.source!='FILE':continue
        require(bool(image.packed_file),'Unpacked FILE image '+image.name)
        rows.append({'name':canonical(image.name),'bytes':image.packed_file.size,'packed_bytes_sha256':sha(bytes(image.packed_file.data)),'colorspace':image.colorspace_settings.name,'alpha_mode':image.alpha_mode})
    return sorted(rows,key=lambda r:(r['name'],r['packed_bytes_sha256']))
def material_semantics(material):
    nodes=[];links=[]
    if material.node_tree:
        ids={node:i for i,node in enumerate(material.node_tree.nodes)}
        for node in material.node_tree.nodes:
            defaults={}
            for socket in node.inputs:
                if not hasattr(socket,'default_value'):continue
                value=socket.default_value
                if isinstance(value,(str,bool,int,float)):defaults[socket.identifier]=value
                else:
                    try:defaults[socket.identifier]=list(value)
                    except TypeError:defaults[socket.identifier]=str(value)
            image=None
            if hasattr(node,'image') and node.image:
                im=node.image
                image={'source':im.source,'colorspace':im.colorspace_settings.name,'packed_sha256':sha(bytes(im.packed_file.data)) if im.packed_file else None}
            nodes.append({'index':ids[node],'type':node.bl_idname,'defaults':defaults,'semantic_properties':{k:getattr(node,k) for k in ('layer_name','uv_map','attribute_name','blend_type','operation') if hasattr(node,k)},'image':image})
        links=sorted((ids[l.from_node],l.from_socket.identifier,ids[l.to_node],l.to_socket.identifier) for l in material.node_tree.links)
    return {'diffuse_color':list(material.diffuse_color),'metallic':material.metallic,'roughness':material.roughness,'nodes':nodes,'links':links,'render_properties':{k:getattr(material,k) for k in ('use_nodes','surface_render_method','use_backface_culling','alpha_threshold') if hasattr(material,k)}}
def material_hash(material):return None if material is None else digest_json(material_semantics(material))
def mesh_fingerprint(obj):
    mesh=obj.data
    names=sorted(v.name for v in obj.vertex_groups);group_ids={name:i for i,name in enumerate(names)};index_names={v.index:v.name for v in obj.vertex_groups};h=hashlib.sha256();weighted=0;unweighted=0;maximum_sum_error=0.
    for vertex in mesh.vertices:
        groups=sorted((group_ids[index_names[g.group]],float(g.weight)) for g in vertex.groups)
        require(all(math.isfinite(w) and 0<=w<=1 for _,w in groups),'Invalid native vertex weight')
        h.update(struct.pack('<II',vertex.index,len(groups)))
        for i,w in groups:h.update(struct.pack('<If',i,w))
        if groups:weighted+=1;maximum_sum_error=max(maximum_sum_error,abs(sum(w for _,w in groups)-1))
        else:unweighted+=1
    return {'vertices':len(mesh.vertices),'polygons':len(mesh.polygons),'loops':len(mesh.loops),'position_float32_sha256':sha(floats(mesh.vertices,'co',3)),'loop_vertex_indices_sha256':sha(integers(mesh.loops,'vertex_index')),'polygon_starts_sizes_sha256':sha(integers(mesh.polygons,'loop_start')+integers(mesh.polygons,'loop_total')),'polygon_material_indices_sha256':sha(integers(mesh.polygons,'material_index')),'material_slots_semantic_sha256':[material_hash(m) for m in mesh.materials],'uv_layers':[{'name':layer.name,'float32_uv_sha256':sha(floats(layer.data,'uv',2))} for layer in mesh.uv_layers],'corner_normal_float32_sha256':sha(floats(mesh.corner_normals,'vector',3)),'color_attributes':[{'name':a.name,'domain':a.domain,'data_type':a.data_type,'float32_color_sha256':sha(floats(a.data,'color',4))} for a in mesh.color_attributes],'vertex_groups':names,'vertex_group_weights_sha256':h.hexdigest(),'weighted_vertices':weighted,'unweighted_vertices':unweighted,'maximum_weight_sum_error':maximum_sum_error}
def bone_fingerprint(armature):
    rows=[]
    for bone in sorted(armature.data.bones,key=lambda b:b.name):
        rows.append({'name':bone.name,'parent':bone.parent.name if bone.parent else None,'rest_matrix_float32_sha256':float_matrix(bone.matrix_local),'head_local_float32_sha256':sha(struct.pack('<3f',*bone.head_local)),'tail_local_float32_sha256':sha(struct.pack('<3f',*bone.tail_local)),'use_connect':bone.use_connect,'use_deform':bone.use_deform,'inherit_scale':bone.inherit_scale})
    return {'bone_count':len(rows),'bones':rows,'hierarchy_and_rest_sha256':digest_json(rows)}
def slot_key(slot):
    if slot is None:return None
    name=getattr(slot,'name_display',getattr(slot,'identifier',''))
    return {'target_id_type':slot.target_id_type,'name':canonical(name)}
def fcurve_fingerprint(curve):
    return {'data_path':curve.data_path,'array_index':curve.array_index,'extrapolation':curve.extrapolation,'mute':curve.mute,'keyframe_points':len(curve.keyframe_points),'keyframe_co_float32_sha256':sha(floats(curve.keyframe_points,'co',2)),'keyframe_left_float32_sha256':sha(floats(curve.keyframe_points,'handle_left',2)),'keyframe_right_float32_sha256':sha(floats(curve.keyframe_points,'handle_right',2)),'keyframe_semantics':[(p.interpolation,p.easing,p.handle_left_type,p.handle_right_type) for p in curve.keyframe_points],'sampled_points':len(curve.sampled_points),'sampled_co_float32_sha256':sha(floats(curve.sampled_points,'co',2)),'modifiers':[m.type for m in curve.modifiers]}
def action_fingerprint(action):
    rows=[];slots=list(getattr(action,'slots',[]));slotmap={s.handle:s for s in slots}
    for layer in getattr(action,'layers',[]):
        strips=[]
        for strip in layer.strips:
            bags=[]
            for bag in getattr(strip,'channelbags',[]):
                curves=sorted((fcurve_fingerprint(c) for c in bag.fcurves),key=lambda c:(c['data_path'],c['array_index']))
                bags.append({'slot':slot_key(slotmap.get(bag.slot_handle)),'fcurves':curves})
            strips.append({'type':strip.type,'channelbags':sorted(bags,key=digest_json)})
        rows.append({'name':layer.name,'influence':getattr(layer,'influence',None),'mix_mode':getattr(layer,'mix_mode',None),'strips':strips})
    legacy=[]
    if not rows and hasattr(action,'fcurves'):legacy=sorted((fcurve_fingerprint(c) for c in action.fcurves),key=lambda c:(c['data_path'],c['array_index']))
    frame=list(action.frame_range);fps=bpy.context.scene.render.fps/bpy.context.scene.render.fps_base
    return {'name':canonical(action.name),'frame_range':frame,'duration_seconds':(frame[1]-frame[0])/fps,'slots':sorted((slot_key(s) for s in slots),key=digest_json),'layers':rows,'legacy_fcurves':legacy,'fcurve_count':len(legacy)+sum(len(b['fcurves']) for l in rows for s in l['strips'] for b in s['channelbags'])}
def animation_binding(obj):
    data=obj.animation_data
    if not data:return None
    tracks=[]
    for track in data.nla_tracks:
        strips=[]
        for strip in track.strips:
            row={'name':canonical(strip.name),'type':strip.type,'action':canonical(strip.action.name) if strip.action else None,'action_slot':slot_key(getattr(strip,'action_slot',None))}
            for key in ('frame_start','frame_end','action_frame_start','action_frame_end','scale','repeat','blend_type','extrapolation','influence','use_auto_blend','blend_in','blend_out','use_animated_influence','use_animated_time','use_reverse','strip_time'):
                if hasattr(strip,key):row[key]=getattr(strip,key)
            strips.append(row)
        tracks.append({'name':canonical(track.name),'mute':track.mute,'lock':track.lock,'is_solo':track.is_solo,'strips':strips})
    return {'action':canonical(data.action.name) if data.action else None,'action_slot':slot_key(getattr(data,'action_slot',None)),'action_blend_type':data.action_blend_type,'action_extrapolation':data.action_extrapolation,'action_influence':data.action_influence,'nla_tracks':tracks,'driver_count':len(data.drivers)}
def asset_fingerprint():
    meshes={};arms={};objects=[]
    importer_bone_shapes={bone.custom_shape for obj in bpy.data.objects if obj.type=='ARMATURE' for bone in obj.pose.bones if bone.custom_shape is not None}
    for obj in sorted(bpy.data.objects,key=lambda o:(o.type,canonical(o.name),o.name)):
        if obj.type in ('CAMERA','LIGHT') or obj in importer_bone_shapes:continue
        key=canonical(obj.name)
        if obj.type=='MESH':require(key not in meshes,'Canonical mesh name collision');meshes[key]=mesh_fingerprint(obj)
        elif obj.type=='ARMATURE':require(key not in arms,'Canonical armature name collision');arms[key]=bone_fingerprint(obj)
        modifiers=[]
        for mod in obj.modifiers:
            row={'type':mod.type}
            for prop in ('object','use_vertex_groups','use_bone_envelopes','use_deform_preserve_volume','vertex_group','invert_vertex_group'):
                if hasattr(mod,prop):
                    v=getattr(mod,prop);row[prop]=canonical(v.name) if hasattr(v,'name') else v
            modifiers.append(row)
        objects.append({'name':key,'type':obj.type,'parent':canonical(obj.parent.name) if obj.parent else None,'parent_type':obj.parent_type,'parent_bone':obj.parent_bone,'matrix_local_float32_sha256':float_matrix(obj.matrix_local),'visibility':{'hide_render':obj.hide_render,'hide_viewport':obj.hide_viewport,'view_layer_member':bpy.context.view_layer.objects.get(obj.name) is not None,'hide_get':obj.hide_get() if bpy.context.view_layer.objects.get(obj.name) is not None else None},'modifiers':modifiers,'constraints':[{'type':c.type,'name':canonical(c.name),'influence':c.influence} for c in obj.constraints],'animation_binding':animation_binding(obj)})
    actions=sorted((action_fingerprint(a) for a in bpy.data.actions),key=lambda a:a['name'])
    materials=sorted([{'name':canonical(m.name),'semantic_sha256':material_hash(m)} for m in bpy.data.materials],key=lambda r:(r['name'],r['semantic_sha256']))
    return {'meshes':meshes,'armatures':arms,'objects':objects,'actions':actions,'materials':materials,'packed_FILE_images':image_fingerprints(),'importer_bone_display_shapes_excluded':sorted(canonical(o.name) for o in importer_bone_shapes),'fps':bpy.context.scene.render.fps,'fps_base':bpy.context.scene.render.fps_base}
def parse_glb(raw):
    require(struct.unpack_from('<4sII',raw)==(b'glTF',2,len(raw)),'GLB 2.0 header')
    jl,jt=struct.unpack_from('<II',raw,12);require(jt==0x4e4f534a,'JSON chunk');doc=json.loads(raw[20:20+jl]);bl,bt=struct.unpack_from('<II',raw,20+jl);require(bt==0x004e4942 and 28+jl+bl==len(raw),'BIN chunk')
    require(len(doc['buffers'])==1 and 'uri' not in doc['buffers'][0],'Embedded GLB buffer')
    return doc,raw[28+jl:]
def animation_metadata(doc,binary):
    clips=[]
    for i,clip in enumerate(doc.get('animations',[])):
        times=[]
        for sampler in clip['samplers']:
            a=doc['accessors'][sampler['input']];v=doc['bufferViews'][a['bufferView']]
            require(a['componentType']==5126 and a['type']=='SCALAR' and 'sparse' not in a,'Float32 source animation times')
            start=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',4)
            values=[struct.unpack_from('<f',binary,start+j*stride)[0] for j in range(a['count'])];require(values and all(math.isfinite(x) for x in values),'Animation source time values');times.extend(values)
        clips.append({'name':clip.get('name','animation_'+str(i)),'channels':len(clip['channels']),'samplers':len(clip['samplers']),'minimum_time_seconds':min(times),'maximum_time_seconds':max(times),'duration_seconds':max(times)-min(times)})
    return clips
def load_manifest(path):
    path=Path(path).resolve(strict=True);raw=path.read_bytes();doc=json.loads(raw);rows=doc.get('models',doc.get('characters'))
    require(isinstance(rows,list) and len(rows)==1 and rows[0]['id']=='alexia','Single selected Alexia manifest')
    row=rows[0];rel=Path(row['path']);require(not rel.is_absolute() and '..' not in rel.parts,'Manifest-relative source only')
    model=(path.parent/rel).resolve(strict=True);require(model.is_relative_to(path.parent),'Manifest source escape');source=model.read_bytes();require(sha(source)==row['sha256'],'Manifest source SHA')
    glb,binary=parse_glb(source);clips=animation_metadata(glb,binary)
    require(glb.get('skins') and clips,'Actual source skin and clips required')
    require(len({c['name'] for c in clips})==len(clips),'Unique source clip names')
    return path,raw,model,source,glb,clips
def check_imported_animation(fp,clips):
    require(fp['armatures'] and fp['meshes'],'Imported real armature and meshes required')
    require(len(fp['actions'])==len(clips),'Imported action count differs from source clips')
    native={a['name']:a for a in fp['actions']}
    for clip in clips:
        require(clip['name'] in native,'Missing imported source clip '+clip['name']);a=native[clip['name']]
        require(a['fcurve_count']>0 and abs(a['duration_seconds']-clip['duration_seconds'])<.002,'Imported clip curve/duration mismatch '+clip['name'])
    require(any(o['animation_binding'] and o['animation_binding']['nla_tracks'] for o in fp['objects']),'Imported source clips not preserved in NLA')
def write_fresh(path,value):
    path=Path(path);require(not path.exists(),'Fresh evidence required');path.parent.mkdir(parents=True,exist_ok=True)
    with path.open('x',encoding='utf-8',newline='\n') as f:f.write(json.dumps(value,indent=2,allow_nan=False)+'\n')

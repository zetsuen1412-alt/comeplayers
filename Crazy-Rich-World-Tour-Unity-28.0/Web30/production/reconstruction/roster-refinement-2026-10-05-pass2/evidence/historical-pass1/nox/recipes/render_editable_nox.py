"""Create real-mesh before/after Nox renders and packed editable candidate; no source writes."""
import argparse, hashlib, json, math, pathlib, struct, sys
import bpy
from mathutils import Vector
p=argparse.ArgumentParser();p.add_argument('--source',type=pathlib.Path,required=True);p.add_argument('--candidate',type=pathlib.Path,required=True);p.add_argument('--out',type=pathlib.Path,required=True)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);a.source=a.source.resolve(strict=True);a.candidate=a.candidate.resolve(strict=True);a.out=a.out.resolve()
require=lambda condition,message: None if condition else (_ for _ in ()).throw(ValueError(message))
require(not a.out.exists(),'Render directory must be new');a.out.mkdir(parents=True)
sha=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()
source_hash,candidate_hash=sha(a.source),sha(a.candidate)
def mesh_signature(obj):
    m=obj.data;h=hashlib.sha256()
    for v in m.vertices:h.update(struct.pack('<3f',*v.co))
    for face in m.polygons:h.update(struct.pack('<I',len(face.vertices)));h.update(struct.pack('<'+'I'*len(face.vertices),*face.vertices));h.update(struct.pack('<I?',face.material_index,face.use_smooth))
    for uv in m.uv_layers:
        for datum in uv.data:h.update(struct.pack('<2f',*datum.uv))
    h.update(struct.pack('<16f',*[value for row in obj.matrix_world for value in row]))
    return {'vertices':len(m.vertices),'polygons':len(m.polygons),'uv_layers':len(m.uv_layers),'materials':len(m.materials),'sha256':h.hexdigest()}
def load(path):
    bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(path));bpy.context.view_layer.update()
    return [o for o in bpy.context.scene.objects if o.type=='MESH']
source_objects=load(a.source);baseline_signatures=[mesh_signature(o) for o in source_objects]
points=[o.matrix_world@Vector(c) for o in source_objects for c in o.bound_box]
lo=Vector(tuple(min(v[k] for v in points) for k in range(3)));hi=Vector(tuple(max(v[k] for v in points) for k in range(3)));center=(lo+hi)/2;extent=max(hi-lo)
views=[('front',0,0),('three-quarter',-30,10),('opposite-three-quarter',30,10),('back',180,0)]
def studio_and_render(label):
    scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=scene.render.resolution_y=800;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False;scene.view_settings.view_transform='AgX'
    scene.world=bpy.data.worlds.new('Nox consistent comparison studio');scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.62,.65,.72,1);scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.7
    for name,pos,power,size in [('Soft key',(-2.5,-3,3),600,3),('Soft fill',(2,-1,1.2),280,2.8),('Hair rim',(0,2,2.8),500,2.5)]:
        data=bpy.data.lights.new(name,'AREA');data.energy=power*extent*extent;data.shape='DISK';data.size=size*extent
        obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=center+Vector(pos)*extent;obj.rotation_euler=(center-obj.location).to_track_quat('-Z','Y').to_euler()
    data=bpy.data.cameras.new('Actual geometry camera');data.type='ORTHO';data.ortho_scale=extent*1.16
    camera=bpy.data.objects.new('Actual geometry camera',data);scene.collection.objects.link(camera);scene.camera=camera
    out=a.out/label;out.mkdir()
    for name,az,el in views:
        az,el=math.radians(az),math.radians(el);camera.location=center+Vector((math.sin(az)*math.cos(el),-math.cos(az)*math.cos(el),math.sin(el)))*extent*4
        camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(out/(name+'.png'));bpy.ops.render.render(write_still=True)
    return scene
studio_and_render('before')
objects=load(a.candidate);candidate_signatures=[mesh_signature(o) for o in objects]
require(all(sig in candidate_signatures for sig in baseline_signatures),'Imported original mesh/UV/polygon/transform channels changed')
scene=studio_and_render('after')
collection=bpy.data.collections.new('NOX · original source geometry retained + new hip card');scene.collection.children.link(collection)
for obj in objects:
    for old in list(obj.users_collection):old.objects.unlink(obj)
    collection.objects.link(obj)
    obj['editable_candidate']=True;obj['approved']=False;obj['gameIntegrated']=False
    if len(obj.data.vertices)==20899:obj['raw_source_glb_geometry_preserved']=True
scene['source_glb_sha256']=source_hash;scene['candidate_glb_sha256']=candidate_hash;scene['approved']=False;scene['gameIntegrated']=False
scene['limitations']='One manual floating hip card added. Existing body, floating cards, rabbit, fingers, textures and back unchanged. Static unrigged review candidate.'
bpy.ops.file.pack_all()
for im in bpy.data.images:
    if im.source=='FILE':require(im.packed_file is not None,'Image not packed')
blend=a.out/'nox-hip-card-editable-candidate.blend';require(not blend.exists(),'Blend must be new');bpy.ops.wm.save_as_mainfile(filepath=str(blend))
require(sha(a.source)==source_hash and sha(a.candidate)==candidate_hash,'Inputs changed')
receipt={'schema':'crwt.nox_actual_render_editable.v1','source_sha256':source_hash,'candidate_sha256':candidate_hash,'source_imported_mesh_fingerprints':baseline_signatures,'candidate_imported_mesh_fingerprints':candidate_signatures,'source_imported_native_mesh_uv_polygon_transform_fingerprints_retained':True,'packed_blend':str(blend),'blend_sha256':sha(blend),'blender_version':bpy.app.version_string,'engine':'BLENDER_EEVEE','resolution':[800,800],'same_camera_and_lights':True,'bounds_from_source_blender_z_up':[list(lo),list(hi)],'views':views,'render_source':'Actual GLB imported geometry/materials only; no reference image shown as a 3D surface','approved':False,'gameIntegrated':False,'render_files':[{ 'path':str(f.relative_to(a.out)), 'sha256':sha(f)} for f in sorted(a.out.glob('*/*.png'))]}
(a.out/'render-editable-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'status':'actual-mesh-rendered-packed-editable','blend':str(blend),'blend_sha256':receipt['blend_sha256'],'views_each':len(views)}),flush=True)

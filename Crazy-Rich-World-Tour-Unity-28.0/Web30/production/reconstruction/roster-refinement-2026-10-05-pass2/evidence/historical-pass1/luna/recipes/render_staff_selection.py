import bpy,sys,pathlib,math,json
from mathutils import Vector
root=pathlib.Path(__file__).resolve().parents[3]
source=root/'outputs/model-review-2026-10-04/viewer/models/luna.glb'
out=pathlib.Path(__file__).with_name('selection-review')
out.mkdir(exist_ok=False)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
scene=bpy.context.scene
mat=bpy.data.materials.new('Staff region selection, inspection only')
mat.diffuse_color=(1,0.02,0.01,1);mat.use_nodes=True
shader=mat.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=(1,.005,.005,1);shader.inputs['Roughness'].default_value=.6
counts=[]
for obj in scene.objects:
    if obj.type!='MESH':continue
    obj.data.materials.append(mat);marked=[]
    for face in obj.data.polygons:
        center=obj.matrix_world@face.center
        if center.x>.20 and .085<center.z<.29 and center.y<.145:
            face.material_index=len(obj.data.materials)-1;marked.append(face.index)
    counts.append({'mesh':obj.name,'marked_faces':len(marked)})
meshes=[o for o in scene.objects if o.type=='MESH' and not o.hide_render]
points=[o.matrix_world@Vector(v) for o in meshes for v in o.bound_box]
low=Vector(tuple(min(v[j] for v in points) for j in range(3)));high=Vector(tuple(max(v[j] for v in points) for j in range(3)));center=(low+high)*.5;extent=max(high-low)
scene.render.engine='CYCLES';scene.cycles.samples=8;scene.cycles.use_denoising=True;scene.cycles.device='CPU'
scene.render.resolution_x=scene.render.resolution_y=640;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG'
scene.world=bpy.data.worlds.new('Review');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.62,.65,.72,1);scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.7
scene.view_settings.view_transform='AgX'
for name,position,power in [('Key',(-2.5,-3,3),600),('Fill',(2,-1,1.2),280),('Rim',(0,2,2.8),500)]:
    data=bpy.data.lights.new(name,'AREA');data.energy=power*extent*extent;data.shape='DISK';data.size=3*extent;o=bpy.data.objects.new(name,data);scene.collection.objects.link(o);o.location=center+Vector(position)*extent;o.rotation_euler=(center-o.location).to_track_quat('-Z','Y').to_euler()
data=bpy.data.cameras.new('Actual GLB selection');data.type='ORTHO';data.ortho_scale=extent*1.16;camera=bpy.data.objects.new('Camera',data);scene.collection.objects.link(camera);scene.camera=camera
for name,az in [('front',0),('profile',-80),('back',180)]:
    angle=math.radians(az);camera.location=center+Vector((math.sin(angle),-math.cos(angle),0))*extent*4;camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(out/(name+'.png'));bpy.ops.render.render(write_still=True)
print(json.dumps({'selection':counts}))

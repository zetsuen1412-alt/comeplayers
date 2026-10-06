"""Render actual exported GLB geometry/materials using Blender, never input art.
Static rest pose camera views + optional real-mesh orbit frames and evidence.
"""
import argparse, pathlib, sys, math, json, hashlib
import bpy
from mathutils import Vector
p=argparse.ArgumentParser()
p.add_argument('--glb',type=pathlib.Path,required=True)
p.add_argument('--output',type=pathlib.Path,required=True)
p.add_argument('--resolution',type=int,default=640)
p.add_argument('--turntable',action='store_true')
p.add_argument('--views',default='all')
a=p.parse_args(sys.argv[sys.argv.index('--')+1:])
a.glb=a.glb.resolve(strict=True); a.output=a.output.resolve()
a.output.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(a.glb))
scene=bpy.context.scene
for obj in list(scene.objects):
    if obj.animation_data: obj.animation_data_clear()
    if obj.type=='ARMATURE': obj.data.pose_position='REST'
scene.frame_set(0); bpy.context.view_layer.update()
meshes=[o for o in scene.objects if o.type=='MESH' and not o.hide_render
        and not any(c.name=='glTF_not_exported' for c in o.users_collection)]
if not meshes: raise ValueError('no imported volumetric geometry')
points=[o.matrix_world@Vector(corner) for o in meshes for corner in o.bound_box]
low=Vector(tuple(min(v[i] for v in points) for i in range(3)))
high=Vector(tuple(max(v[i] for v in points) for i in range(3)))
center=(low+high)/2; extent=max(high-low)
scene.render.engine='CYCLES'
scene.cycles.samples=32
scene.cycles.use_denoising=True
scene.cycles.device='CPU'
scene.render.resolution_x=scene.render.resolution_y=a.resolution
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.film_transparent=False
scene.world=bpy.data.worlds.new('Reference review studio')
scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(0.62,0.65,0.72,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.25
scene.view_settings.view_transform='Standard'
def area(label,pos,power,size):
    data=bpy.data.lights.new(label,'AREA'); data.energy=power; data.shape='DISK'; data.size=size*extent
    obj=bpy.data.objects.new(label,data); scene.collection.objects.link(obj)
    obj.location=center+Vector(pos)*extent
    obj.rotation_euler=(center-obj.location).to_track_quat('-Z','Y').to_euler()
area('Soft key',(-2.5,-3,3),120*extent*extent,3)
area('Soft fill',(2,-1,1.2),56*extent*extent,2.8)
area('Hair rim',(0,2,2.8),100*extent*extent,2.5)
camdata=bpy.data.cameras.new('Actual GLB review camera'); camdata.type='ORTHO'; camdata.ortho_scale=extent*1.16
camera=bpy.data.objects.new('Actual GLB review camera',camdata); scene.collection.objects.link(camera); scene.camera=camera
def render(name,azimuth,elevation,resolution=None):
    az=math.radians(azimuth); el=math.radians(elevation)
    camera.location=center+Vector((math.sin(az)*math.cos(el),-math.cos(az)*math.cos(el),math.sin(el)))*extent*4
    camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler()
    if resolution: scene.render.resolution_x=scene.render.resolution_y=resolution
    scene.render.filepath=str(a.output/(name+'.png')); bpy.ops.render.render(write_still=True)
views=[('front',0,0),('three-quarter',-30,10),('left',90,0),('right',-90,0),('back',180,0),('top',0,89.9),('bottom',0,-89.9)]
if a.views!='all':
    chosen=a.views.split(',');views=[v for v in views if v[0] in chosen]
    if len(views)!=len(chosen): raise ValueError('Unknown view name')
for v in views: render(*v)
if a.turntable:
    (a.output/'orbit').mkdir(exist_ok=True)
    for angle in range(0,360,15): render('orbit/frame-%03d'%angle,angle,8,320)
report={'input_glb':str(a.glb),'input_sha256':hashlib.sha256(a.glb.read_bytes()).hexdigest(),
 'bytes':a.glb.stat().st_size,'render_source':'actual GLB mesh/materials imported by Blender; no reference-image billboard',
 'blender_version':bpy.app.version_string,'engine':scene.render.engine,'cycles_samples':scene.cycles.samples,
 'mesh_objects':len(meshes),'vertices':sum(len(o.data.vertices) for o in meshes),
 'polygons':sum(len(o.data.polygons) for o in meshes),'bounds_blender_z_up':[list(low),list(high)],
 'pose':'static rest pose; animation disabled in render copy','views':views,'production_approved':False,
 'orbit_frames':24 if a.turntable else 0,'view_transform':scene.view_settings.view_transform,'solid_accessory_lights':{'world_strength':.25,'key_power_factor':120,'fill_power_factor':56,'rim_power_factor':100},'material_limit':'Unlit projected colors retain baked reference lighting; solid accessories use studio PBR.'}
(a.output/'render-evidence.json').write_text(json.dumps(report,indent=2))
print(json.dumps({'status':'actual-mesh-rendered','output':str(a.output),'sha256':report['input_sha256']}),flush=True)

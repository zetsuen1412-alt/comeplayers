"""Actual mesh/material render batch, identical source-derived cameras and lighting."""
import argparse, hashlib, json, math, pathlib, sys
import bpy
from mathutils import Vector

def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--source',type=pathlib.Path,required=True)
p.add_argument('--candidate',type=pathlib.Path,action='append',default=[])
p.add_argument('--output',type=pathlib.Path,required=True)
p.add_argument('--gray-views',default='')
p.add_argument('--hair-closeup',action='store_true')
p.add_argument('--skip-baseline-render',action='store_true')
p.add_argument('--views',default='front,left,right,back,three-quarter')
a=p.parse_args(sys.argv[sys.argv.index('--')+1:])
a.source=a.source.resolve(strict=True); a.candidate=[v.resolve(strict=True) for v in a.candidate]; a.output=a.output.resolve()
assert a.output.is_relative_to(pathlib.Path(__file__).resolve().parent) and not a.output.exists()
a.output.mkdir(parents=True)
inputs=[('baseline',a.source)]+[('candidate-'+str(i+1),v) for i,v in enumerate(a.candidate)]
pins={str(path):sha(path) for name,path in inputs}
camera_center=camera_extent=None
records=[]
for label,path in inputs:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path))
    scene=bpy.context.scene
    for obj in scene.objects:
        if obj.animation_data: obj.animation_data_clear()
        if obj.type=='ARMATURE': obj.data.pose_position='REST'
    scene.frame_set(0); bpy.context.view_layer.update()
    meshes=[o for o in scene.objects if o.type=='MESH' and not o.hide_render]
    points=[o.matrix_world@Vector(c) for o in meshes for c in o.bound_box]
    low=Vector(tuple(min(v[i] for v in points) for i in range(3)))
    high=Vector(tuple(max(v[i] for v in points) for i in range(3)))
    if camera_center is None:
        camera_center=(low+high)/2; camera_extent=max(high-low)
    center=camera_center; extent=camera_extent
    if label=='baseline' and a.skip_baseline_render:
        assert sha(path)==pins[str(path)]
        continue
    scene.render.engine='CYCLES'; scene.cycles.samples=16
    scene.cycles.use_denoising=True; scene.cycles.device='CPU'
    scene.render.resolution_x=scene.render.resolution_y=512; scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG'; scene.render.film_transparent=False
    scene.world=bpy.data.worlds.new('Fixed curl-lock review studio'); scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.62,.65,.72,1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.25
    scene.view_settings.view_transform='Standard'
    def light(name,pos,power,size):
        data=bpy.data.lights.new(name,'AREA'); data.energy=power*extent*extent; data.shape='DISK'; data.size=size*extent
        obj=bpy.data.objects.new(name,data); scene.collection.objects.link(obj)
        obj.location=center+Vector(pos)*extent; obj.rotation_euler=(center-obj.location).to_track_quat('-Z','Y').to_euler()
    light('Soft key',(-2.5,-3,3),120,3); light('Soft fill',(2,-1,1.2),56,2.8); light('Rear rim',(0,2,2.8),100,2.5)
    data=bpy.data.cameras.new('Fixed source bounds camera'); data.type='ORTHO'; data.ortho_scale=extent*1.16
    camera=bpy.data.objects.new('Fixed source bounds camera',data); scene.collection.objects.link(camera); scene.camera=camera
    folder=a.output/label; folder.mkdir()
    views=[]
    for name,azimuth,elevation in [('front',0,0),('left',90,0),('right',-90,0),('back',180,0),('three-quarter',-30,10)]:
        if name not in a.views.split(','): continue
        az=math.radians(azimuth); el=math.radians(elevation)
        camera.location=center+Vector((math.sin(az)*math.cos(el),-math.cos(az)*math.cos(el),math.sin(el)))*extent*4
        camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler()
        png=folder/(name+'.png'); scene.render.filepath=str(png); bpy.ops.render.render(write_still=True)
        views.append({'name':name,'azimuth':azimuth,'elevation':elevation,'path':str(png),'sha256':sha(png),'resolution':[512,512]})
    record={'label':label,'input_path':str(path),'input_sha256':pins[str(path)],'views':views,'mesh_objects':len(meshes),
            'vertices':sum(len(o.data.vertices) for o in meshes),'polygons':sum(len(o.data.polygons) for o in meshes)}
    gray=bpy.data.materials.new('Geometry inspection only'); gray.use_nodes=True
    bsdf=gray.node_tree.nodes.get('Principled BSDF'); bsdf.inputs['Base Color'].default_value=(.33,.33,.33,1)
    bsdf.inputs['Roughness'].default_value=.65; scene.view_layers[0].material_override=gray
    gray_records=[]
    for name,azimuth in [('left',90),('back',180)]:
        if name not in a.gray_views.split(','): continue
        az=math.radians(azimuth); camera.location=center+Vector((math.sin(az),-math.cos(az),0))*extent*4
        camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler()
        png=folder/('gray-'+name+'.png'); scene.render.filepath=str(png); bpy.ops.render.render(write_still=True)
        gray_records.append({'name':name,'path':str(png),'sha256':sha(png),'resolution':[512,512]})
    record['gray_geometry_inspection_views']=gray_records
    record['gray_material_is_render_copy_override_only']=True
    closeups=[]
    if a.hair_closeup:
        haircenter=center+Vector((0,0,extent*.18))
        data.ortho_scale=extent*.74
        for name,azimuth in [('hair-left',90),('hair-right',-90),('hair-back',180)]:
            az=math.radians(azimuth)
            camera.location=haircenter+Vector((math.sin(az),-math.cos(az),0))*extent*4
            camera.rotation_euler=(haircenter-camera.location).to_track_quat('-Z','Y').to_euler()
            scene.view_layers[0].material_override=None
            png=folder/(name+'.png');scene.render.filepath=str(png);bpy.ops.render.render(write_still=True)
            closeups.append({'name':name,'path':str(png),'sha256':sha(png),'resolution':[512,512],
                             'azimuth':azimuth,'center':list(haircenter),'ortho_scale':extent*.74})
    record['fixed_camera_hair_closeups']=closeups
    records.append(record)
    assert sha(path)==pins[str(path)]
    with (folder/'render-evidence.json').open('x',encoding='utf-8') as f: json.dump(record,f,indent=2)
    print('PROFILE_RENDER_COMPLETE '+label,flush=True)
assert all(sha(path)==pins[str(path)] for label,path in inputs)
report={'schema':'crwt.alexia-side-colors-actual-render-comparison.v1','approved':False,'gameIntegrated':False,
        'render_source':'Actual imported volumetric GLB meshes and original embedded materials; reference PNG not used in scene.',
        'camera_contract':'All models use identical baseline bounds, orthographic framing, camera transforms and lighting.',
        'camera_center_blender':list(camera_center),'extent':camera_extent,'resolution':[512,512],
        'blender_version':bpy.app.version_string,'engine':'CYCLES','samples':16,'view_transform':'Standard',
        'all_input_files_unchanged':True,'models':records}
with (a.output/'comparison-evidence.json').open('x',encoding='utf-8') as f: json.dump(report,f,indent=2)
print(json.dumps({'status':'actual-profile-comparison-complete','output':str(a.output)}),flush=True)

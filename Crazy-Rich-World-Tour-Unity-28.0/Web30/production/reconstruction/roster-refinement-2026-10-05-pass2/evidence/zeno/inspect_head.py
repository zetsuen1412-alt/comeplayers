"""Read-only actual-mesh close-up; writes only a fresh inspection folder."""
import argparse,hashlib,json,math,pathlib,sys
import bpy
from mathutils import Vector
p=argparse.ArgumentParser();p.add_argument('--source',type=pathlib.Path,required=True);p.add_argument('--sha',required=True);p.add_argument('--out',type=pathlib.Path,required=True)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);a.source=a.source.resolve(strict=True);a.out=a.out.resolve()
assert hashlib.sha256(a.source.read_bytes()).hexdigest()==a.sha and not a.out.exists()
a.out.mkdir(parents=True)
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(a.source))
s=bpy.context.scene;meshes=[o for o in s.objects if o.type=='MESH'];points=[o.matrix_world@v.co for o in meshes for v in o.data.vertices]
low=Vector(tuple(min(v[i] for v in points) for i in range(3)));high=Vector(tuple(max(v[i] for v in points) for i in range(3)));extent=max(high-low);center=(low+high)/2
s.render.engine='CYCLES';s.cycles.samples=32;s.cycles.use_denoising=True;s.cycles.device='CPU';s.render.resolution_x=s.render.resolution_y=900;s.render.resolution_percentage=100;s.render.image_settings.file_format='PNG'
s.world=bpy.data.worlds.new('Actual source closeup');s.world.use_nodes=True;s.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.62,.65,.72,1);s.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.7;s.view_settings.view_transform='AgX'
for name,pos,power,size in [('Key',(-2.5,-3,3),600,3),('Fill',(2,-1,1.2),280,2.8),('Rim',(0,2,2.8),500,2.5)]:
    d=bpy.data.lights.new(name,'AREA');d.energy=power*extent*extent;d.shape='DISK';d.size=size*extent;o=bpy.data.objects.new(name,d);s.collection.objects.link(o);o.location=center+Vector(pos)*extent;o.rotation_euler=(center-o.location).to_track_quat('-Z','Y').to_euler()
headcenter=Vector((center.x,center.y,high.z-.16*extent));scale=.50*extent
d=bpy.data.cameras.new('Actual source head camera');d.type='ORTHO';d.ortho_scale=scale;c=bpy.data.objects.new(d.name,d);s.collection.objects.link(c);s.camera=c
for name,az in [('head-front',0),('head-left',90),('head-right',-90)]:
    rad=math.radians(az);c.location=headcenter+Vector((math.sin(rad),-math.cos(rad),0))*extent*4;c.rotation_euler=(headcenter-c.location).to_track_quat('-Z','Y').to_euler();s.render.filepath=str(a.out/(name+'.png'));bpy.ops.render.render(write_still=True)
assert hashlib.sha256(a.source.read_bytes()).hexdigest()==a.sha
(a.out/'inspection.json').write_text(json.dumps({'source_sha256':a.sha,'bounds_blender':[list(low),list(high)],'camera_center_blender':list(headcenter),'ortho_scale':scale,'resolution':900,'source_unchanged':True,'actual_geometry':True},indent=2)+'\n')

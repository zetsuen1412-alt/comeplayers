"""Build real closed armillary/staff-head geometry from Luna's front reference."""
import bpy,math,pathlib,sys,json,hashlib
from mathutils import Vector
root=pathlib.Path(__file__).resolve().parents[3]
out=pathlib.Path(__file__).parent/'trial-v1'
out.mkdir(exist_ok=False)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene;scene.name='Luna reference-guided staff head, additive source-preserving candidate'
scene['visual_approved']=False;scene['game_integrated']=False
def linear(v):return v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4
def material(name,rgb,metallic,roughness):
    m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF')
    color=tuple(linear(v/255) for v in rgb)+(1,);p.inputs['Base Color'].default_value=color;p.inputs['Metallic'].default_value=metallic;p.inputs['Roughness'].default_value=roughness
    m.diffuse_color=color;return m
gold=material('Luna staff warm gold, reference-guided',(221,157,45),.45,.29)
blue=material('Luna polished sapphire globe',(45,98,220),.12,.20)
def smooth(obj,m):
    obj.data.materials.append(m)
    for f in obj.data.polygons:f.use_smooth=True
    obj['visual_approved']=False;obj['reference_guided_accessory']=True
def sphere(name,center,scale,m):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48,ring_count=24,radius=1,location=center)
    o=bpy.context.object;o.name=name;o.scale=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);smooth(o,m);return o
def tube(name,center,u,v,radius):
    c,u,v=Vector(center),Vector(u),Vector(v);n=(u.cross(v)).normalized();verts=[];N=96;K=12
    for i in range(N):
        a=2*math.pi*i/N;q=c+u*math.cos(a)+v*math.sin(a);t=(-u*math.sin(a)+v*math.cos(a)).normalized();rad=t.cross(n).normalized()
        for j in range(K):
            b=2*math.pi*j/K;verts.append(tuple(q+radius*(rad*math.cos(b)+n*math.sin(b))))
    faces=[]
    for i in range(N):
        for j in range(K):faces.append((i*K+j,i*K+(j+1)%K,((i+1)%N)*K+(j+1)%K,((i+1)%N)*K+j))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update();obj=bpy.data.objects.new(name,mesh);scene.collection.objects.link(obj);smooth(obj,gold);return obj
def taper(name,a,b,r1,r2):
    a,b=Vector(a),Vector(b);d=b-a;bpy.ops.mesh.primitive_cone_add(vertices=48,radius1=r1,radius2=r2,depth=d.length,location=(a+b)/2)
    o=bpy.context.object;o.name=name;o.rotation_euler=d.to_track_quat('Z','Y').to_euler();smooth(o,gold);return o
center=(.280,-.116,.164)
sphere('Sapphire globe, full volume',center,(.0375,.0325,.0360),blue)
tube('Outer armillary meridian',center,(.062,-.009,.003),(-.003,.006,.055),.0035)
tube('Inclined equatorial orbit',center,(.058,0,.014),(0,.041,.020),.0030)
tube('Cross meridian',center,(.023,.042,0),(0,0,.052),.0028)
# Shaft collar ends at the inspected original neck cut. All hidden depths are
# explicit modelling interpretation; source reference supplies only front.
sphere('Rounded flared neck collar',(.261,-.109,.052),(.024,.018,.0085),gold)
taper('Raised neck support',(.261,-.109,.054),(.278,-.116,.110),.0090,.0058)
sphere('Orb pivot',(.278,-.116,.110),(.009,.007,.006),gold)
taper('Upper orbit finial',(.281,-.116,.219),(.287,-.116,.240),.0038,.0012)
for i,a in enumerate([40,135,220,315]):
    rad=math.radians(a);x=.280+.062*math.cos(rad)-.003*math.sin(rad);y=-.116-.009*math.cos(rad)+.006*math.sin(rad);z=.164+.003*math.cos(rad)+.055*math.sin(rad)
    sphere('Armillary rivet %d'%i,(x,y,z),(.0041,.0041,.0041),gold)
for o in scene.objects:o.select_set(True)
target=out/'luna-staff-head-addon.glb'
bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',use_selection=True,export_apply=True,export_materials='EXPORT')
bpy.ops.wm.save_as_mainfile(filepath=str(out/'luna-staff-head-addon.blend'))
print(json.dumps({'addon':str(target),'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'objects':len(scene.objects),'model_approved':False}))

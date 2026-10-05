"""Read-only restore check of the editable Rindi candidate in Blender."""
from pathlib import Path
import sys,json,hashlib
import bpy
folder=Path(sys.argv[sys.argv.index('--')+1]).resolve()
path=folder/'rindi-reaching-hand-candidate.blend';digest=hashlib.sha256(path.read_bytes()).hexdigest();bpy.ops.wm.open_mainfile(filepath=str(path))
images=[]
for image in bpy.data.images:
 if image.source!='FILE':continue
 packed=bool(image.packed_file or len(image.packed_files));assert packed,'Unpacked external image: '+image.name
 images.append({'name':image.name,'packed':packed,'size':list(image.size),'colorspace':image.colorspace_settings.name})
assert len(images)==2
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH'];assert len(meshes)==1
report={'schema':'crwt.rindi_editable_restore.v1','blend_sha256':digest,'blender_version':bpy.app.version_string,'loaded_successfully':True,'mesh_objects':len(meshes),'polygons':sum(len(o.data.polygons) for o in meshes),'all_file_images_packed':True,'images':images,'source_or_blend_edited':False}
assert hashlib.sha256(path.read_bytes()).hexdigest()==digest
out=folder/'editable-restore-proof.json';assert not out.exists();out.write_text(json.dumps(report,indent=2));print(json.dumps(report),flush=True)

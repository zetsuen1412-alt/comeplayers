"""Reopen the saved editable candidate, read-only, and check source preservation."""
import argparse
import hashlib
import json
import sys
from pathlib import Path
import bpy
sys.path.insert(0,str(Path(__file__).resolve().parent))
import pip_v8_frozen_builder as frozen

def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()

p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--source',type=Path,required=True)
p.add_argument('--blend',type=Path,required=True)
p.add_argument('--expected-blend-sha256',required=True)
p.add_argument('--output',type=Path,required=True)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:])
a.source=a.source.resolve(strict=True);a.blend=a.blend.resolve(strict=True);a.output=a.output.resolve()
assert sha(a.source)==frozen.SOURCE_SHA and sha(a.blend)==a.expected_blend_sha256
assert a.output.is_relative_to(Path(__file__).resolve().parent) and not a.output.exists()
bpy.ops.wm.open_mainfile(filepath=str(a.source),load_ui=False)
original=frozen.original_fingerprint(list(bpy.data.objects))
original_actions={action.name for action in bpy.data.actions}
bpy.ops.wm.open_mainfile(filepath=str(a.blend),load_ui=False)
assert all(name in bpy.data.objects for name in original)
reopened=frozen.original_fingerprint([bpy.data.objects[name] for name in original])
assert reopened==original
assert original_actions<={action.name for action in bpy.data.actions}
rig=bpy.data.objects['pip_reference_candidate']
assert len(rig.data.bones)==13
candidate_parts=[o for o in bpy.data.objects if o.name.startswith('PipReview | ') and o.get('character_id')=='pip' and o.type=='MESH']
assert len(candidate_parts)==194
assert all(o.vertex_groups and all(v.groups and abs(sum(g.weight for g in v.groups)-1)<1e-6 for v in o.data.vertices)
           for o in candidate_parts)
images=[img for img in bpy.data.images if img.source=='FILE']
unpacked=[img.name for img in images if not img.packed_file and not img.packed_files]
assert not unpacked,('External file images',unpacked)
result={'schema':'crwt.pip-saved-native-preservation.v1','approved':False,'gameIntegrated':False,
        'source_sha256':sha(a.source),'blend_sha256':sha(a.blend),'blender_version':bpy.app.version_string,
        'saved_original_objects_fingerprints_identical':True,'original_objects':len(original),
        'original_actions':len(original_actions),'original_action_names_preserved':True,
        'native_candidate_parts':len(candidate_parts),'native_joints':len(rig.data.bones),
        'native_all_vertices_weighted':True,'file_image_count':len(images),'all_file_images_packed':True,
        'candidate_scene':'Pip Reference Review Candidate','active_scene':bpy.context.scene.name,
        'limits':'Editable blend/source preservation only; visual, choreography and gameplay approval remain false.'}
assert sha(a.source)==frozen.SOURCE_SHA and sha(a.blend)==a.expected_blend_sha256
a.output.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result))

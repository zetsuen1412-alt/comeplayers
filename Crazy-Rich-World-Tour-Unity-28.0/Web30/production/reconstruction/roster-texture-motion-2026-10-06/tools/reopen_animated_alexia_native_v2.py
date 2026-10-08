"""Read-only animated native reopen; normalize JSON tuple/list containers before equality."""
import sys
sys.dont_write_bytecode=True
import argparse,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
import bpy
import animated_native_fingerprints as h

def json_containers(value):
    # JSON files reload tuple-valued graph links/keyframe semantics as lists.
    # Normalize container representation only; every value and hash stays exact.
    return json.loads(json.dumps(value,allow_nan=False))

def main():
    p=argparse.ArgumentParser();p.add_argument('--blend',type=Path,required=True);p.add_argument('--manifest',type=Path,required=True);p.add_argument('--build-proof',type=Path);p.add_argument('--out',type=Path,required=True)
    a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);manifest,mraw,model,source,doc,clips=h.load_manifest(a.manifest);blend=a.blend.resolve(strict=True);braw=blend.read_bytes();proof=a.build_proof.resolve(strict=True) if a.build_proof else blend.with_suffix('.workspace-proof.json');praw=proof.read_bytes();build=json.loads(praw);out=a.out.resolve()
    h.require(not out.exists() and out not in (manifest,model,blend,proof),'Fresh distinct read-only proof output')
    h.require(build['schema']=='crwt.alexia_animated_native_build.v1' and build['passed'] is True and build['candidate_sha256']==h.sha(source) and build['manifest_sha256']==h.sha(mraw) and build['output_blend_sha256']==h.sha(braw),'Native build input pins')
    h.require(build['fingerprint_helper_sha256']==h.file_sha(Path(h.__file__)),'Fingerprint helper version differs from build')
    bpy.ops.wm.open_mainfile(filepath=str(blend),load_ui=False);saved=json_containers(h.asset_fingerprint());h.check_imported_animation(saved,clips)
    h.require(saved==build['native_fingerprints'],'Saved native geometry/materials/weights/bones/actions/NLA differ from build')
    bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(model),merge_vertices=False)
    for image in bpy.data.images:
        if image.source=='FILE' and not image.packed_file:image.pack()
    fresh=json_containers(h.asset_fingerprint());h.check_imported_animation(fresh,clips)
    h.require(saved==fresh,'Read-only saved native differs from deterministic fresh GLB import')
    h.require(blend.read_bytes()==braw and manifest.read_bytes()==mraw and model.read_bytes()==source and proof.read_bytes()==praw,'Read-only inputs changed')
    result={'schema':'crwt.alexia_animated_native_reopen.v1','passed':True,'candidate_sha256':h.sha(source),'blend_sha256':h.sha(braw),'manifest_sha256':h.sha(mraw),'build_proof_sha256':h.sha(praw),'native_fingerprints_sha256':h.digest_json(saved),'native_fingerprints':saved,'source_clip_metadata':clips,'source_skin_count':len(doc['skins']),'source_joint_count_per_skin':[len(s['joints']) for s in doc['skins']],'native_mesh_count':len(saved['meshes']),'native_armature_count':len(saved['armatures']),'native_action_count':len(saved['actions']),'native_COLOR_attribute_count':sum(len(m['color_attributes']) for m in saved['meshes'].values()),'native_active_FILE_image_count':len(saved['packed_FILE_images']),'all_mesh_normals_uv_material_COLOR_fingerprints_equal':True,'all_vertex_group_weights_equal':True,'all_bone_rest_and_hierarchy_equal':True,'all_action_fcurves_durations_and_NLA_bindings_equal':True,'manifest_relative_source':True,'historical_absolute_source_paths_used':False,'read_only':True,'no_source_blend_manifest_or_build_proof_writes':True,'fingerprint_helper_sha256':h.file_sha(Path(h.__file__)),'reopen_helper_sha256':h.file_sha(Path(__file__)),'fingerprint_container_normalization':'JSON list/tuple representation only; no numeric or semantic tolerance.','approved':False,'gameIntegrated':False,'production_ready':False,'limits':['Same Blender importer representation is compared; source GLB bytes remain exact.','Imported actual skin/bones/actions and NLA are preserved; no additional clips are invented.','Fingerprint equality does not certify animation quality, collisions, manifold geometry or game integration.']}
    h.write_fresh(out,result);print({'passed':True,'proof':str(out),'candidate_sha256':result['candidate_sha256'],'native_meshes':result['native_mesh_count'],'native_armatures':result['native_armature_count'],'native_actions':result['native_action_count']})

if __name__=='__main__':main()

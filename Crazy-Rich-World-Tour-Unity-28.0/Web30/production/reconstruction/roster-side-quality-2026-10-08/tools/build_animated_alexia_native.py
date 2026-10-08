"""Import an explicitly selected animated Alexia GLB and save a fresh native review."""
import sys
sys.dont_write_bytecode=True
import argparse
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
import bpy
import animated_native_fingerprints as h

def main():
    p=argparse.ArgumentParser();p.add_argument('--manifest',type=Path,required=True);p.add_argument('--out',type=Path,required=True);p.add_argument('--receipt',type=Path)
    a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);manifest,mraw,model,source,doc,clips=h.load_manifest(a.manifest)
    out=a.out.resolve();proof=a.receipt.resolve() if a.receipt else out.with_suffix('.workspace-proof.json')
    h.require(out.suffix=='.blend' and not out.exists() and not proof.exists() and out!=proof and out not in (manifest,model) and proof not in (manifest,model),'Fresh distinct native/proof outputs')
    bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(model),merge_vertices=False)
    for image in bpy.data.images:
        if image.source=='FILE' and not image.packed_file:image.pack()
    fp=h.asset_fingerprint();h.check_imported_animation(fp,clips)
    scene=bpy.context.scene;scene['approved']=False;scene['production_ready']=False;scene['gameIntegrated']=False;scene['source_glb_sha256']=h.sha(source);scene['native_review_scope']='Imported existing manual prototype skin, bones, actions and NLA; no new rig or clips created by native packaging.'
    out.parent.mkdir(parents=True,exist_ok=True);bpy.ops.wm.save_as_mainfile(filepath=str(out),check_existing=False,compress=True)
    h.require(h.asset_fingerprint()==fp,'Native save altered imported asset fingerprints')
    h.require(manifest.read_bytes()==mraw and model.read_bytes()==source,'Source inputs changed')
    result={'schema':'crwt.alexia_animated_native_build.v1','passed':True,'candidate_sha256':h.sha(source),'manifest_sha256':h.sha(mraw),'output_blend_sha256':h.file_sha(out),'native_fingerprints':fp,'source_clip_metadata':clips,'source_skin_count':len(doc['skins']),'source_joint_count_per_skin':[len(s['joints']) for s in doc['skins']],'native_mesh_count':len(fp['meshes']),'native_armature_count':len(fp['armatures']),'native_action_count':len(fp['actions']),'native_COLOR_attribute_count':sum(len(m['color_attributes']) for m in fp['meshes'].values()),'native_active_FILE_image_count':len(fp['packed_FILE_images']),'source_inputs_unchanged':True,'manifest_relative_source':True,'armature_weights_rest_hierarchy_actions_and_NLA_preserved':True,'new_rig_or_clip_created_by_packaging':False,'fingerprint_helper_sha256':h.file_sha(Path(h.__file__)),'build_helper_sha256':h.file_sha(Path(__file__)),'approved':False,'gameIntegrated':False,'production_ready':False,'limits':['Native values follow Blender importer representation, including BYTE_COLOR and skin conversion; original GLB remains byte-exact.','This checks save integrity, not motion quality, game integration or production readiness.','Only imported source actions and NLA tracks are preserved; the package does not create or rename clips.']}
    h.write_fresh(proof,result);print({'passed':True,'blend':str(out),'proof':str(proof),'candidate_sha256':result['candidate_sha256'],'meshes':result['native_mesh_count'],'armatures':result['native_armature_count'],'actions':result['native_action_count']})

if __name__=='__main__':main()

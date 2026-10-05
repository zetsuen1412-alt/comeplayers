"""Read-only RGB measurements and frozen scoped handoff; never edit input images/assets."""
import hashlib,json,pathlib,struct
from PIL import Image
folder=pathlib.Path(__file__).resolve().parent;root=folder.parents[2];trial=folder/'trial-v3';review=trial/'actual-mesh-review'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
source=root/'outputs/model-review-2026-10-04/viewer/models/yuna.glb';reference=root/'outputs/model-review-2026-10-04/viewer/references/yuna.png'
candidate=trial/'yuna-accessory-refinement-candidate.glb';rebuilt=folder/'reproducibility-check/yuna-accessory-refinement-candidate.glb';blend=review/'yuna-accessory-refinement-editable-candidate.blend'
assert candidate.read_bytes()==rebuilt.read_bytes()
assert sha(source)=='bf8bcd2c18be7b95ac6725219ac510792b14110d0445827262ade05fb374638e'
assert sha(reference)=='3f4c951ef5efbb00d885cd5e20da6083dcb81ec08034a9e2d1b03b5dd38ef1f4'
metrics=[]
for name in ('front','three-quarter','opposite-three-quarter','back'):
    before=Image.open(review/'before'/f'{name}.png').convert('RGB');after=Image.open(review/'after'/f'{name}.png').convert('RGB');assert before.size==after.size==(800,800)
    changed=[];outside=[];palette=brush=0
    for i,(a,b) in enumerate(zip(before.getdata(),after.getdata())):
        if a==b:continue
        x,y=i%800,i//800;changed.append((x,y))
        if name=='front':
            if 95<=x<290 and 365<=y<565:palette+=1
            elif 605<=x<675 and 235<=y<313:brush+=1
            else:outside.append((x,y))
    metrics.append({'view':name,'changed_rgb_pixels':len(changed),'changed_bbox':[min(x for x,y in changed),min(y for x,y in changed),max(x for x,y in changed)+1,max(y for x,y in changed)+1] if changed else None,'front_palette_roi_changed_pixels':palette if name=='front' else None,'front_ferrule_roi_changed_pixels':brush if name=='front' else None,'front_pixels_changed_outside_accessory_rois':len(outside) if name=='front' else None,'limits':'Pixel differences show where the candidate affects the actual render; they do not prove aesthetic improvement. Added geometry may change local accessory shadows.'})
proof=json.loads(candidate.with_suffix('.preservation-proof.json').read_text());receipt=json.loads((review/'render-editable-receipt.json').read_text());reopen=json.loads(blend.with_suffix('.reopen-proof.json').read_text())
assert reopen['editable_blend_reopened_successfully'] and len(reopen['embedded_images'])==2
assert all(shape['closed_index_edge_incidence_two'] and shape['directed_index_edges_balanced'] for shape in proof['shapes'])
metrics_path=trial/'render-change-measurements.json'
with metrics_path.open('x',encoding='utf-8',newline='\n') as f:f.write(json.dumps({'schema':'crwt.actual_render_difference.v1','source_images_modified':False,'views':metrics},indent=2)+'\n')
files=[candidate,candidate.with_suffix('.preservation-proof.json'),blend,blend.with_suffix('.reopen-proof.json'),review/'render-editable-receipt.json',trial/'visual-review.json',trial/'MULAI-DI-SINI-YUNA.md',metrics_path]+sorted(review.glob('*/*.png'))
report={'schema':'crwt.yuna_accessory_handoff.v1','date':'2026-10-05','status':'manual-accessory-improvement-candidate-unapproved','candidate':str(candidate),'sha256':sha(candidate),'bytes':candidate.stat().st_size,'editable_blend':str(blend),'editable_blend_sha256':sha(blend),'source':str(source),'source_sha256':sha(source),'reference':str(reference),'reference_sha256':sha(reference),'reference_size':list(struct.unpack_from('>II',reference.read_bytes(),16)),'actual_counts':proof['actual_glb_validation'],'source_faces':proof['all_source_faces_retained'],'faces_added':proof['new_faces'],'source_bin_prefix_bytes_preserved':proof['source_bin_bytes'],'all_source_faces_retained':True,'source_vertices_moved':0,'source_faces_removed':0,'original_json_records_preserved':proof['original_json_prefix_records_identical'],'new_shape_count':len(proof['shapes']),'all_new_shapes_closed_and_consistently_oriented':True,'paint_matched_front_back_xy_graph':True,'source_global_self_intersection_certificate':False,'new_global_self_intersection_certificate':False,'reproduced_byte_identical':True,'render_views_each':4,'packed_images':2,'render_change_measurements':metrics,'approved':False,'visual_final_approved':False,'gameIntegrated':False,'rig_added':False,'animation_added':False,'scope':'Partial palette rim, six shallow paint volumes and a brass ferrule/collars. Existing grip, fingers, brush tip, body, hair, face, material and texture data preserved.','grip_hole_cut':False,'remaining_gaps':['No true thumb-hole or anatomy repair is certified; source grip unchanged.','Brush paint tip still the existing reconstruction.','Hair/beret, face, overall/strap and back artifacts remain.','Reference-only exact visual perfection, rig, animation and gameplay remain unapproved.'],'artifact_files':[{'path':str(p.relative_to(trial)).replace('\\','/'),'bytes':p.stat().st_size,'sha256':sha(p)} for p in files],'scripts':[{'path':str(p),'sha256':sha(p)} for p in (folder/'build_yuna_accessory_details.py',folder/'render_editable_yuna.py',folder/'reopen_editable_check.py')]}
out=trial/'YUNA-HANDOFF.json'
with out.open('x',encoding='utf-8',newline='\n') as f:f.write(json.dumps(report,indent=2)+'\n')
print(json.dumps({'handoff':str(out),'sha256':sha(out),'candidate_sha256':sha(candidate),'blend_sha256':sha(blend),'artifact_files':len(files),'measurements':metrics}))

"""Validate frozen V2 bytes and issue fresh uniform handoff; no mesh/source writes."""
import hashlib, importlib.util, json, pathlib, struct
from PIL import Image

HERE=pathlib.Path(__file__).resolve().parent
ROOT=HERE.parents[2]
TRIAL=HERE/'trial-v2'
SOURCE=ROOT/'outputs/model-review-2026-10-05/viewer/models/kairo.glb'
REFERENCE=ROOT/'outputs/model-review-2026-10-05/viewer/references/kairo.png'
CANDIDATE=TRIAL/'kairo-fitted-rim-beads-candidate.glb'
BLEND=TRIAL/'kairo-fitted-rim-beads-candidate.blend'
PRESERVATION=TRIAL/'kairo-fitted-rim-beads-candidate.preservation-proof.json'
REOPEN=TRIAL/'editable-readonly-reopen-proof.json'
RENDERS=TRIAL/'final-actual-mesh-renders'
HANDOFF=HERE/'HANDOFF.json'
VALIDATION=TRIAL/'final-glb-validation.json'
FINAL_PROOF=TRIAL/'finalization-proof.json'
GUIDE=TRIAL/'MULAI-DI-SINI-KAIRO.md'
SOURCE_SHA='8a3a8ddeb2b095e1ee179deffedfe03e091f965517384b06ea8dd9e1cda532fc'
REFERENCE_SHA='8411bc47f221e7e48cd58545068c1ff162f9b9997aa565c0ddbb15a7de595bc8'
CANDIDATE_SHA='543cb1ad81f03bd76b30df12259268a94356c8d5cb773b28742a72973c331f52'
BLEND_SHA='4fa2d0c884a40c34e4a28c3cb0fce773dde9a2c4decdd8c8d0020743d19d1447'
sha=lambda raw:hashlib.sha256(raw).hexdigest()

def require(ok,message):
    if not ok:raise ValueError(message)

def record(path):return {'path':str(path.resolve()),'bytes':path.stat().st_size,'sha256':sha(path.read_bytes())}

def parse(raw):
    require(struct.unpack_from('<4sII',raw)==(b'glTF',2,len(raw)),'GLB header mismatch')
    size,kind=struct.unpack_from('<II',raw,12);require(kind==0x4e4f534a,'JSON first required')
    doc=json.loads(raw[20:20+size]);offset=20+size;n,k=struct.unpack_from('<II',raw,offset)
    require(k==0x004e4942 and offset+8+n==len(raw),'Single embedded BIN required')
    return doc,raw[offset+8:]

def save_json(path,doc):
    with path.open('x',encoding='utf-8',newline='\n') as handle:handle.write(json.dumps(doc,ensure_ascii=False,indent=2)+'\n')

def main():
    for path in (HANDOFF,VALIDATION,FINAL_PROOF,GUIDE):require(not path.exists(),'New evidence only; no overwrite')
    snapshots={path:path.read_bytes() for path in (SOURCE,REFERENCE,CANDIDATE,BLEND,PRESERVATION,REOPEN,TRIAL/'editable-build-proof.json',HERE/'rim-fit-v2.json')}
    for path,expected in ((SOURCE,SOURCE_SHA),(REFERENCE,REFERENCE_SHA),(CANDIDATE,CANDIDATE_SHA),(BLEND,BLEND_SHA)):
        require(sha(snapshots[path])==expected,'Frozen hash differs: '+str(path))
    original,oldbin=parse(snapshots[SOURCE]);candidate,newbin=parse(snapshots[CANDIDATE])
    prefix_keys=('accessors','bufferViews','meshes','nodes','materials','textures','images','samplers','skins','animations')
    preserved={key:candidate.get(key,[])[:len(original.get(key,[]))]==original.get(key,[]) for key in prefix_keys}
    require(newbin[:len(oldbin)]==oldbin and all(preserved.values()),'Source BIN/JSON prefix differs')
    for index,scene in enumerate(original['scenes']):
        require(candidate['scenes'][index]['nodes'][:len(scene['nodes'])]==scene['nodes'],'Original scene roots differ')
    proof=json.loads(snapshots[PRESERVATION]);reopen=json.loads(snapshots[REOPEN]);build=json.loads(snapshots[TRIAL/'editable-build-proof.json'])
    require(proof['source_sha256']==SOURCE_SHA and proof['candidate_sha256']==CANDIDATE_SHA and proof['fit_sha256']==sha(snapshots[HERE/'rim-fit-v2.json']),'Preservation pins differ')
    require(reopen['saved_geometry_normal_uv_transform_material_image_fingerprints_identical'] and reopen['no_source_or_blend_writes'] and reopen['blend_sha256']==BLEND_SHA,'Reopen identity proof missing')
    require(reopen['all_file_images_packed'] and reopen['packed_images_byte_identical_to_glb'] and reopen['armatures']==reopen['actions']==0,'Packed/static native proof missing')
    require(all(rim['closed_edges_all_two'] and rim['opposite_edge_winding'] and rim['minimum_triangle_area']>0 and rim['signed_volume']>0 for rim in proof['rims']),'Added rims not closed/oriented')
    planes=[rim['fitted_depth_plane'] for rim in proof['rims'] if rim['fitted_depth_plane']]
    require(len(planes)==1 and len(planes[0]['excluded_source_depth_samples'])==12,'Expected explicit V2 inferred depth segment')
    max_depth=planes[0]['max_absolute_source_depth_residual']
    require(abs(max_depth-0.020289080960561673)<1e-15,'V2 inferred depth residual changed')
    validator_path=ROOT/'work/model-rebuild/tools/validate_roster_candidate.py';spec=importlib.util.spec_from_file_location('roster_validate',validator_path)
    validator=importlib.util.module_from_spec(spec);spec.loader.exec_module(validator);actual=validator.validate_model(snapshots[CANDIDATE])
    require((actual['faces'],actual['vertices'],actual['meshes'],actual['images'],actual['skins'],actual['clips'])==(27820,20492,3,2,0,0),'Actual GLB counts changed')
    save_json(VALIDATION,{'valid':True,'id':'kairo','candidate_sha256':CANDIDATE_SHA,'source_sha256':SOURCE_SHA,'actual':actual,'approved':False,'gameIntegrated':False})
    receipt_path=RENDERS/'render-evidence.json';receipt_raw=receipt_path.read_bytes();receipt=json.loads(receipt_raw)
    require(receipt['input_sha256']==CANDIDATE_SHA and receipt['production_approved'] is False and receipt['orbit_frames']==24 and len(receipt['views'])==7,'Final render receipt stale/incomplete')
    require(receipt['engine']=='CYCLES' and receipt['cycles_samples']==32 and receipt['render_source']=='actual GLB mesh/materials imported by Blender; no reference-image billboard','Expected actual mesh/material render provenance')
    main_names=('front','three-quarter','left','right','back','top','bottom')
    images=[RENDERS/(name+'.png') for name in main_names]+[RENDERS/'orbit'/('frame-%03d.png'%angle) for angle in range(0,360,15)]
    require(len(list(RENDERS.rglob('*.png')))==31,'Unexpected final render count')
    render_records=[]
    for index,path in enumerate(images):
        expected=(640,640) if index<7 else (320,320)
        with Image.open(path) as image:require(image.size==expected,'Actual render resolution differs');image.verify()
        row=record(path);row['size']=list(expected);render_records.append(row)
    scope='Dua bead tipis emas pada rim goggles asli. Lensa, frame dasar, strap, rambut, body dan seluruh tekstur sumber dipertahankan.'
    limits=[
        'Lensa, rambut, wajah, tangan, pakaian dan permukaan belakang rekonstruksi sumber masih lembut; tidak ada perbaikan keseluruhan karakter.',
        'Rim kanan-bawah memakai fitted plane pada sampel yang dipertahankan; 12 sampel kedalaman dikecualikan karena ray mengenai rambut cekung. Segmen tersebut memakai kedalaman perkiraan, dengan deviasi maksimum 0,02028908096 unit dari hit sumber; bukan bukti menempel sempurna.',
        'Thickness/radius bead merupakan interpretasi geometri fisik dari referensi depan. Bead kiri memakai depth hit sumber; bead kanan memakai fitted plane yang dicatat di proof.',
        'Dua bead tambahan masing-masing tertutup dengan winding konsisten dan area triangle positif. Kontak bead/sumber disengaja; tidak ada sertifikasi global bebas intersection atau kualitas anatomi.',
        'Model statis dengan 0 skin/animation; belum mendapat approval visual pengguna atau integrasi runtime game.'
    ]
    final={'schema':'crwt.kairo_v2_finalization.v1','candidate_sha256':CANDIDATE_SHA,'blend_sha256':BLEND_SHA,
           'source_sha256':SOURCE_SHA,'reference_sha256':REFERENCE_SHA,'source_bin_prefix_verified_byte_identical':True,
           'source_bin_bytes':len(oldbin),'original_json_prefix_records_verified_identical':preserved,'source_scene_roots_retained_in_order':True,
           'source_faces_removed':0,'source_vertices_moved':0,'actual_glb_counts':actual,'independent_native_reopen_passed':True,
           'all31_final_render_images_verified':True,'final_render_files':render_records,'render_receipt_sha256':sha(receipt_raw),
           'inferred_depth_samples_excluded':planes[0]['excluded_source_depth_samples'],'maximum_inferred_depth_vs_source_hit':max_depth,
           'perfect_rim_seating_certified':False,'global_self_intersection_certified':False,
           'visual_review':'Actual final front, quarter, left, right, back and orbit030 inspected. V1 rejected kink is preserved in old trial; V2 trim is clearer from front. Existing rear texture/anatomy softness remains unchanged.',
           'frozen_inputs_unchanged':True,'approved':False,'gameIntegrated':False,'limits':limits}
    save_json(FINAL_PROOF,final)
    guide='''# Kairo V2 — trim tipis goggles\n\nDua bead emas asli 3D ditambahkan pada tepi goggles yang sudah ada. Lensa, frame dasar, strap, seluruh body/UV/material/textures dan nodes sumber tetap identik. V1 kink disimpan sebagai prototipe lama; pilih kandidat V2 saja.\n\nBuka `kairo-fitted-rim-beads-candidate.blend`: packed scene dibuka ulang dalam proses Blender terpisah, dan geometri/topologi/corner normals/UV/world transforms/material graph serta image bytes identik dengan scene native yang disimpan. Dua image1024² tersimpan internal, tanpa skin atau animation.\n\n`final-actual-mesh-renders/` berisi tujuh view640px dan24 orbit320px dari mesh GLB sebenarnya. GLB tervalidasi27.820 triangles,20.492 vertices,3 meshes,2 images. Source21.676triangles tetap; dua bead menambah6.144triangles/3.072vertices.\n\nBatas utama: fitted plane pada rim kanan-bawah mengecualikan12sampel kedalaman yang mengenai rambut; segmen tersebut dapat menyimpang0,02028908096unit dari hit sumber. Bukan bukti seating sempurna. Dua bead baru tertutup/winding konsisten, namun tidak ada klaim global bebas intersection. Source wajah, rambut, tangan, pakaian dan rear masih lembut. Kandidat belum disetujui pengguna atau terintegrasi game.\n\n`HANDOFF.json` pada folder karakter menyimpan path/hash/cakupan; recipe membutuhkan path input sumber yang benar. Packedblend adalah awal edit portable setelah dipaketkan. Jangan overwrite source, V1, V2 atau proof frozen.\n'''
    with GUIDE.open('x',encoding='utf-8',newline='\n') as handle:handle.write(guide)
    recipes=[HERE/name for name in ('build_fitted_rim_beads.py','rim-fit-v2.json','save_and_reopen_editable.py','render_review_blender.py','inspect_head.py','finalize_kairo.py')]
    artifacts=[PRESERVATION,REOPEN,TRIAL/'editable-build-proof.json',VALIDATION,FINAL_PROOF,GUIDE,receipt_path]+recipes+images
    handoff={'schema':'crwt.reference_roster_refinement_handoff.v1','id':'kairo','created_date':'2026-10-05',
             'source_sha256':SOURCE_SHA,'source_path':str(SOURCE),'reference_path':str(REFERENCE),'reference_sha256':REFERENCE_SHA,
             'candidate_path':str(CANDIDATE),'candidate_sha256':CANDIDATE_SHA,'candidate_bytes':len(snapshots[CANDIDATE]),
             'blend_path':str(BLEND),'blend_sha256':BLEND_SHA,'blend_bytes':len(snapshots[BLEND]),'render_directory':str(RENDERS),
             'preservation_proof_path':str(PRESERVATION),'preservation_proof_sha256':sha(snapshots[PRESERVATION]),
             'reopen_proof_path':str(REOPEN),'reopen_proof_sha256':sha(snapshots[REOPEN]),'recipe_paths':[str(path) for path in recipes],
             'scope':scope,'limits':limits,'approved':False,'gameIntegrated':False,'actual_glb_validation':actual,
             'source_faces_removed':0,'source_vertices_moved':0,'source_bin_prefix_byte_identical':True,
             'source_vertices':17420,'source_triangles':21676,'added_triangles':6144,'added_vertices':3072,'new_closed_solids':2,
             'full_render_image_count':31,'main_views':7,'orbit_frames':24,'render_receipt_sha256':sha(receipt_raw),
             'validation_proof_path':str(VALIDATION),'finalization_proof_path':str(FINAL_PROOF),
             'maximum_inferred_depth_vs_source_hit':max_depth,'perfect_rim_seating_certified':False,'global_self_intersection_certified':False,
             'saved_native_geometry_normal_uv_transform_material_image_fingerprints_identical':True,
             'artifacts':[record(path) for path in artifacts]}
    require(all(path.read_bytes()==raw for path,raw in snapshots.items()) and receipt_path.read_bytes()==receipt_raw,'Frozen inputs changed during finalization')
    save_json(HANDOFF,handoff)
    print(json.dumps({'handoff':str(HANDOFF),'handoff_sha256':sha(HANDOFF.read_bytes()),'candidate_sha256':CANDIDATE_SHA,
                      'blend_sha256':BLEND_SHA,'images':len(images),'validated':actual,'source_unchanged':True},indent=2))

if __name__=='__main__':main()

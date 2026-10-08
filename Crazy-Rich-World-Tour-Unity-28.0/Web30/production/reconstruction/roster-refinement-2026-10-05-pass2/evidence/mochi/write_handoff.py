"""Freeze Mochi's measured proof, editable native scene and all31 actual renders."""
import hashlib, io, json, pathlib
from PIL import Image, ImageChops, ImageDraw, ImageFont, ImageOps
from inspect_accessories import SOURCE, REFERENCE, EXPECTED, REF_EXPECTED

BASE=pathlib.Path(__file__).resolve().parent
TRIAL=BASE/'trial-v1'
CANDIDATE=TRIAL/'mochi-bag-hardware-candidate.glb'
EXPECTED_CANDIDATE='98ae40d75ef957a82beed4aa63aab918990b3b045bf6dd9d8573bbb456bf40e2'
BLEND=TRIAL/'actual-mesh-review/mochi-bag-hardware-editable-candidate.blend'
EXPECTED_BLEND='52c5729536d66feb709eb3b11ceed3975c8ed90a52ed8808323cbcf78563370e'
RENDER=TRIAL/'final-actual-mesh-renders'
PROOF=CANDIDATE.with_suffix('.preservation-proof.json')
REOPEN=BLEND.with_suffix('.reopen-proof.json')
HANDOFF=TRIAL/'HANDOFF.json'
REPRO_PROOF=TRIAL/'repeat-build-proof.json'
VISUAL_PROOF=TRIAL/'visual-comparison-proof.json'
COMPARISON=TRIAL/'comparison.png'
GUIDE=TRIAL/'MULAI-DI-SINI-MOCHI.md'
sha=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()

def require(ok,message):
    if not ok:raise ValueError(message)

def save_new(path,raw):
    with path.open('xb') as handle:handle.write(raw)

def save_json(path,document):
    save_new(path,(json.dumps(document,ensure_ascii=False,indent=2)+'\n').encode('utf-8'))

def record(path):
    return {'path':str(path.resolve()),'sha256':sha(path),'bytes':path.stat().st_size}

def main():
    for path in (HANDOFF,REPRO_PROOF,VISUAL_PROOF,COMPARISON,GUIDE):require(not path.exists(),'New frozen evidence only: '+str(path))
    require(sha(SOURCE)==EXPECTED and sha(REFERENCE)==REF_EXPECTED and sha(CANDIDATE)==EXPECTED_CANDIDATE and sha(BLEND)==EXPECTED_BLEND,'Input hash differs')
    preservation=json.loads(PROOF.read_bytes());reopened=json.loads(REOPEN.read_bytes())
    require(preservation['source_bin_prefix_byte_identical'] and preservation['source_faces_removed']==0 and preservation['source_vertices_moved']==0,'Source preservation missing')
    require(reopened['editable_blend_reopened_successfully'] and reopened['blend_sha256']==EXPECTED_BLEND and reopened['source_mesh_fingerprint_retained'],'Independent reopen missing')
    receipt_path=RENDER/'render-evidence.json';receipt=json.loads(receipt_path.read_bytes())
    require(receipt['input_sha256']==EXPECTED_CANDIDATE and receipt['production_approved'] is False and receipt['orbit_frames']==24 and len(receipt['views'])==7,'Full render receipt mismatch')
    require(receipt['engine']=='CYCLES' and receipt['cycles_samples']==32,'Expected actual32sample studio renders')
    names=['front','three-quarter','left','right','back','top','bottom']
    pngs=[RENDER/(name+'.png') for name in names]+[RENDER/'orbit'/('frame-%03d.png'%angle) for angle in range(0,360,15)]
    require(len(list(RENDER.rglob('*.png')))==31,'Unexpected render count')
    render_records=[]
    for index,path in enumerate(pngs):
        with Image.open(path) as image:
            expected=(640,640) if index<7 else (320,320);require(image.size==expected,'Render resolution differs');image.verify()
        entry=record(path);entry['size']=list(expected);render_records.append(entry)
    repeat=BASE/'reproducibility-check/mochi-bag-hardware-candidate.glb'
    require(repeat.read_bytes()==CANDIDATE.read_bytes(),'Repeated GLB differs')
    save_json(REPRO_PROOF,{'schema':'crwt.mochi_bag_repeat_build.v1','candidate_sha256':EXPECTED_CANDIDATE,
                         'first_build':record(CANDIDATE),'second_build':record(repeat),'byte_identical':True,
                         'source_sha256':EXPECTED,'source_unchanged':sha(SOURCE)==EXPECTED,'approved':False,'gameIntegrated':False})
    before=TRIAL/'actual-mesh-review/before/front.png';after=TRIAL/'actual-mesh-review/after/front.png'
    reference_image=Image.open(REFERENCE).convert('RGBA');before_image=Image.open(before).convert('RGBA');after_image=Image.open(after).convert('RGBA')
    require(before_image.size==after_image.size==(800,800),'Paired front comparison size mismatch')
    difference=ImageChops.difference(before_image.convert('RGB'),after_image.convert('RGB'))
    rois={'shoulder_strap_buckle':[306,447,365,508],'bag_clasp':[470,516,520,604]}
    counts={}
    for name,box in rois.items():counts[name]=sum(max(pixel)>8 for pixel in difference.crop(box).getdata())
    total=sum(max(pixel)>8 for pixel in difference.getdata())
    require(all(count>0 for count in counts.values()),'Scoped hardware is not visibly changed')
    page=Image.new('RGB',(1280,560),'#101824');draw=ImageDraw.Draw(page)
    font=ImageFont.truetype('C:/Windows/Fonts/segoeuib.ttf',27);body=ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf',18)
    draw.text((28,13),'Mochi · gesper strap dan pengunci tas',font=font,fill='#f5f7fb')
    labels=('REFERENSI 2D','3D SUMBER · SEBELUM','3D KANDIDAT · SESUDAH')
    for index,(image,label) in enumerate(zip((reference_image,before_image,after_image),labels)):
        x=24+index*420;draw.text((x+16,63),label,font=body,fill='#80d9d4')
        draw.rounded_rectangle((x,94,x+392,496),radius=12,fill='#192533')
        thumbnail=ImageOps.contain(image,(386,392),method=Image.Resampling.LANCZOS)
        page.paste(thumbnail,(x+(392-thumbnail.width)//2,99+(392-thumbnail.height)//2),thumbnail)
    draw.text((28,512),'Seluruh geometri sumber dan bagian ekor tetap. Gambar utuh; tidak ada crop/texture repaint.',font=body,fill='#b5c2d1')
    draw.text((28,537),'Kandidat belum disetujui pengguna atau terintegrasi game. Wajah, paws, bag/back masih lembut.',font=body,fill='#80d9d4')
    buffer=io.BytesIO();page.save(buffer,format='PNG',optimize=True);save_new(COMPARISON,buffer.getvalue())
    save_json(VISUAL_PROOF,{'schema':'crwt.mochi_bag_actual_visual_comparison.v1','inputs':[record(REFERENCE),record(before),record(after)],
                          'comparison':record(COMPARISON),'input_front_resolution':[800,800],'layout_size':[1280,560],
                          'source_cropping':False,'source_bitmap_or_texture_edited':False,'reference_used_as_geometry':False,
                          'same_paired_camera_and_lights':True,'pixel_difference_threshold_any_rgb_channel':8,
                          'front_changed_pixels':total,'scoped_rois_xyxy':rois,'front_changed_pixels_within_scoped_roi':counts,
                          'interpretation':'Pixel differences demonstrate visible scoped hardware additions; shadows/sampling may change pixels elsewhere. Raw source geometry/UV/material/image preservation is established separately.',
                          'visual_review':'Front and quarter show crisper buckle and gold/teal clasp. Left/right inspected without displaced side spur; back remains unchanged source softness. Final front/back and orbit075 also inspected.',
                          'approved':False,'gameIntegrated':False})
    guide='''# Mochi — kandidat hardware tas\n\nGesper diagonal pada shoulder strap dan pengunci gold–teal tas kini berupa lima volume 3D baru yang tertutup. Seluruh 23.260 triangle sumber, UV, normal, material, image, node, kedua appendage asli dan connector Oct04 tetap utuh; tidak ada face dihapus atau vertex dipindahkan.\n\nBuka `comparison.png` untuk referensi 2D dan render mesh sebelum–sesudah. `final-actual-mesh-renders/` memuat tujuh view640px dan24 orbit320px. `.blend` packed pada `actual-mesh-review/` dibuka ulang dalam proses Blender terpisah dengan dua tekstur2048² tersimpan internal dan fingerprint mesh sumber identik.\n\nGLB memiliki24.404 triangle,18.334 accessor vertices,2 meshes,2 embedded images,0 skins/animations. Blender mengimpor14.896 vertices sumber yang terpakai plus3.432 vertices hardware; enam vertex sumber yang tidak terpakai tetap disimpan pada accessor GLB aslinya.\n\nSumber belum sempurna: wajah, paws, body, hat, tas/back dan creamy tip masih lembut. Referensi depan mendukung posisi serta warna gesper; ketebalan, detail kedalaman dan stud tengah sederhana merupakan interpretasi manual. Lima volume tambahan masing-masing tertutup dan memiliki winding konsisten, tetapi tidak ada sertifikasi global bebas-intersection. Tidak ada perubahan tekstur bitmap, AI/cloud call, rig, approval visual pengguna atau integrasi game.\n\n`HANDOFF.json` mengikat hash GLB/blend/proofs/renders dan mencatat recipe_paths. Jalankan recipe builder dengan `--out` path BARU untuk reproduksi; output existing ditolak.\n'''
    save_new(GUIDE,guide.encode('utf-8'))
    recipes=[BASE/name for name in ('inspect_accessories.py','build_mochi_bag_hardware.py','render_editable_mochi.py','reopen_native_mochi.py','write_handoff.py')]
    artifacts=[PROOF,REOPEN,REPRO_PROOF,VISUAL_PROOF,COMPARISON,GUIDE,BLEND,receipt_path,TRIAL/'actual-mesh-review/render-editable-receipt.json']+pngs+recipes
    handoff={'schema':'crwt.reference_roster_refinement_handoff.v1','id':'mochi','created_date':'2026-10-05',
             'source_sha256':EXPECTED,'source_path':str(SOURCE),'reference_path':str(REFERENCE),'reference_sha256':REF_EXPECTED,
             'candidate_path':str(CANDIDATE),'candidate_sha256':EXPECTED_CANDIDATE,'candidate_bytes':CANDIDATE.stat().st_size,
             'blend_path':str(BLEND),'blend_sha256':EXPECTED_BLEND,'render_directory':str(RENDER),
             'preservation_proof_path':str(PROOF),'preservation_proof_sha256':sha(PROOF),
             'reopen_proof_path':str(REOPEN),'reopen_proof_sha256':sha(REOPEN),'recipe_paths':[str(path) for path in recipes],
             'scope':'Additive shoulder-strap brass buckle plus bag-flap brass/teal clasp and lower keeper only; source body/paws/hat/appendages/Oct04 connector unchanged.',
             'limits':preservation['limitations'],'approved':False,'gameIntegrated':False,
             'actual_glb_validation':preservation['actual_glb_validation'],'source_faces_removed':0,'source_vertices_moved':0,
             'source_preservation':{'bin_prefix_byte_identical':True,'existing_accessor_index_position_normal_uv_material_image_node_records_identical':True,
                                    'original_scene_roots_retained':True,'source_all_appendages_and_connector_preserved':True},
             'new_closed_solids':5,'new_faces':1144,'native_source_vertices_used':14896,'native_added_vertices':3432,
             'full_render_image_count':31,'main_views':7,'orbit_frames':24,'render_receipt_sha256':sha(receipt_path),
             'render_files':render_records,'repeat_build_byte_identical':True,'repeat_build_proof_path':str(REPRO_PROOF),
             'visual_comparison_path':str(COMPARISON),'visual_comparison_proof_path':str(VISUAL_PROOF),
             'global_self_intersection_certified':False,'source_image_or_mesh_overwritten':False,'artifacts':[record(path) for path in artifacts]}
    require(sha(SOURCE)==EXPECTED and sha(REFERENCE)==REF_EXPECTED and sha(CANDIDATE)==EXPECTED_CANDIDATE and sha(BLEND)==EXPECTED_BLEND,'Frozen inputs changed')
    save_json(HANDOFF,handoff)
    print(json.dumps({'handoff':str(HANDOFF),'handoff_sha256':sha(HANDOFF),'candidate_sha256':EXPECTED_CANDIDATE,
                      'blend_sha256':EXPECTED_BLEND,'render_directory':str(RENDER),'render_images':31,'front_roi_changed_pixels':counts,
                      'source_unchanged':True},indent=2))

if __name__=='__main__':main()

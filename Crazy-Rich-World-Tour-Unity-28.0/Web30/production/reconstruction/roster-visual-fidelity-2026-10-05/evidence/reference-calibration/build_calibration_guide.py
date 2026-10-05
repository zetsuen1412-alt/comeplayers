"""Read-only reference calibration; all outputs are new diagnostic files.

Manual raster landmarks are guidance with stated uncertainty, not a solved camera
or a claim that one mesh can exactly match inconsistent illustrated views.
"""
from pathlib import Path
import copy, hashlib, json, math, struct
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
SHA = lambda data: hashlib.sha256(data).hexdigest()
REF = ROOT / 'outputs/model-review-2026-10-05-pass2/references/alexia-blue-v2-turnaround.png'
MODEL = ROOT / 'outputs/model-review-2026-10-05-pass2/viewer/models/alexia.glb'
RENDERS = ROOT / 'outputs/model-review-2026-10-05-pass2/renders/alexia'
FRONT = ROOT / 'outputs/model-review-2026-10-05-pass2/viewer/references/alexia.png'
TRIAL = ROOT / 'work/reference-fidelity-2026-10-05/trial-v3/renders/front.png'
CONFIG = ROOT / 'work/reference-fidelity-2026-10-05/front-projection-v3.json'
PINS = {
    MODEL: 'd9d868ffd4dbd0829a858df953eced16715742fa5f48dd290d3f08339038a0ae',
    REF: '935b1f8f7d2be4a6a453a089041844f2cd4470eb64be17d9d72568efb3708933',
    FRONT: '419dd06e8f2ce95a7b5e208c667d3f4b31d43b52810b457365cbb618e0805d69',
}
OUTPUT_NAMES = ['alexia-geometry-calibration.json', 'front-landmark-refinement-proposal.json',
                'reference-actual-diagnostic-layout.png', 'diagnostic-input-proof.json']
assert not any((OUT / name).exists() for name in OUTPUT_NAMES), 'Fresh outputs only'
paths = list(PINS) + [RENDERS/'render-evidence.json', CONFIG, TRIAL]
paths += [RENDERS/(name+'.png') for name in ['front','left','right','back']]
frozen = {p: p.read_bytes() for p in paths}
for p, expected in PINS.items():
    assert SHA(frozen[p]) == expected, f'Input hash mismatch: {p}'
evidence = json.loads(frozen[RENDERS/'render-evidence.json'])
assert evidence['input_sha256'] == PINS[MODEL]
lo, hi = evidence['bounds_blender_z_up']
# Blender importer changes glTF (X,Y,Z) to Blender (X,-Z,Y).
world_lo, world_hi = [lo[0],lo[2],-hi[1]], [hi[0],hi[2],-lo[1]]
center = [(a+b)/2 for a,b in zip(world_lo,world_hi)]
extent = max(b-a for a,b in zip(world_lo,world_hi))
ortho = extent * 1.16
scale = 640 / ortho
def current_world(px,py,view):
    y = center[1] + (320-py)/scale
    if view == 'front': return {'x':center[0]+(px-320)/scale,'y':y,'z':None}
    if view == 'back': return {'x':center[0]-(px-320)/scale,'y':y,'z':None}
    sign = -1 if view == 'left' else 1
    return {'x':None,'y':y,'z':center[2]+sign*(px-320)/scale}

crop_boxes = {'front':(0,0,510,488), 'profile-plus-x':(1026,0,1536,488),
              'profile-minus-x':(0,491,510,1024), 'back':(1026,491,1536,1024)}
atlas = Image.open(REF).convert('RGB')
crop_records = []
for name, box in crop_boxes.items():
    p = OUT / ('reference-'+name+'.png')
    image = Image.open(p).convert('RGB')
    assert image.size == atlas.crop(box).size and image.tobytes() == atlas.crop(box).tobytes()
    crop_records.append({'path':str(p),'sha256':SHA(p.read_bytes()),'source_sha256':PINS[REF],
                         'crop_box':list(box),'pixels_exact_source_crop':True,
                         'purpose':'Diagnostic comparison only; not a texture asset.'})

# The root operator measured these geometric eye cavities directly in the source
# render. Color centers in the already projected V3 render are a different datum.
front_landmarks = [
    {'id':'viewer-left-eye','reference_px':[193,126],'source_geometric_px':[278,191],
     'trial_v3_color_px':[283,190],'source_measurement':'Root manual cavity anchor'},
    {'id':'viewer-right-eye','reference_px':[252,126],'source_geometric_px':[346,191],
     'trial_v3_color_px':[347,190],'source_measurement':'Root manual cavity anchor'},
    {'id':'mouth','reference_px':[222,149],'trial_v3_color_px':[315,219]},
    {'id':'belt-center','reference_px':[218,258],'trial_v3_color_px':[303,359]},
    {'id':'suitcase-star','reference_px':[356,385],'source_geometric_px':[468,508],
     'trial_v3_color_px':[478,502],'source_measurement':'Manual soft source star center'},
]
for row in front_landmarks:
    if 'source_geometric_px' in row:
        row['source_world_from_renderer_camera'] = current_world(*row['source_geometric_px'],'front')

# Back illustrated view is calibrated independently by crown and sole. The
# resulting height scale is used only to estimate shape guides, not to assert a
# physically solved orthographic camera for the illustration.
back_top, back_bottom, back_axis = 503, 960, 1287
back_world_per_pixel = extent / (back_bottom-back_top)
def back_world(x,y):
    return [center[0]-(x-back_axis)*back_world_per_pixel,
            world_hi[1]-(y-back_top)*back_world_per_pixel,None]
back_landmarks = [
 ('crown',1287,503), ('rear-wave-viewer-left',1132,705),
 ('rear-wave-viewer-right',1422,705), ('outer-left-tip',1158,764),
 ('inner-left-tip',1192,778), ('center-left-tip',1253,785),
 ('center-tip',1280,791), ('center-right-tip',1307,791),
 ('inner-right-tip',1351,773), ('outer-right-tip',1391,765),
 ('coat-hem',1287,822), ('viewer-left-shoe',1240,960),
 ('viewer-right-shoe',1338,960), ('suitcase-center',1162,883),
]
back_rows = [{'id':name,'atlas_px':[x,y],'estimated_world_xy':back_world(x,y)}
             for name,x,y in back_landmarks]
profiles = [
    {'view':'profile-plus-x','crop':'reference-profile-plus-x.png','camera_world_axis':'+X',
     'earcup_crop_px':[242,114],'preserved_earcup_world_z':.092,
     'crown_crop_y':18,'sole_crop_y':466,'rear_wave_crop_px':[393,215],
     'rear_wave_world_z_estimate':.092-(393-242)*extent/(466-18)},
    {'view':'profile-minus-x','crop':'reference-profile-minus-x.png','camera_world_axis':'-X',
     'earcup_crop_px':[236,111],'preserved_earcup_world_z':.062,
     'crown_crop_y':16,'sole_crop_y':470,'rear_wave_crop_px':[90,216],
     'rear_wave_world_z_estimate':.062+(90-236)*extent/(470-16)},
]
guide = {
 'schema':'crwt.alexia.reference_calibration.manual.v1','source_sha256':PINS[MODEL],
 'approved_reference_sha256':PINS[REF], 'approved':False,'gameIntegrated':False,
 'coordinate_frame':{'system':'glTF world: +Y up, +Z character front',
    'model_root_rotation':[0,1,0,0],'bounds':[world_lo,world_hi],
    'blender_mapping':'(X,Y,Z) glTF world becomes (X,-Z,Y) in Blender'},
 'actual_render_camera':{'projection':'ORTHOGRAPHIC','resolution':[640,640],
    'center_world':center,'ortho_scale':ortho,'pixels_per_world_unit':scale,
    'front_formula':'X=cx+(px-320)/scale; Y=cy+(320-py)/scale',
    'back_formula':'X=cx-(px-320)/scale; Y=cy+(320-py)/scale',
    'plus_x_profile_formula':'Z=cz-(px-320)/scale',
    'minus_x_profile_formula':'Z=cz+(px-320)/scale'},
 'measurement_uncertainty':{'raster_landmark_pixels':4,'derived_position_world_approx':.01,
    'method':'Manual visual landmarks and crown/sole normalization; no solved camera calibration.',
    'limits':['Illustrated views have small pose/proportion inconsistencies.',
              'Landmarks do not certify texture-to-anatomy correspondence.',
              'Single views cannot uniquely determine hidden 3D depth.']},
 'front_landmarks':front_landmarks,'back_atlas_landmarks':back_rows,
 'profile_depth_anchors':profiles,
 'front_mapping_recommendation':{
    'eye_center_pixels':222.5,'eye_horizontal_scale':510,
    'reason':'Align to source geometric cavities measured at x278/346; shift projected midpoint left and expand spacing modestly.',
    'preserve_body_belt_and_sole_mapping':True,
    'case_only_optional_uv_offset':{'source_roi':'world X>.12 and Y<-.18, verify suitcase-only faces first',
      'near_star_world_y':current_world(468,508,'front')['y'],'reference_px_offset':[7,-5],
      'reason':'V3 projected star lies ~10px right and ~6px up of preserved source star.',
      'requires_separate_region_mapping':True,'not_applied':True},
    'selection':'Retain original unlit peripheral hair; projection only visible front with occlusion test/semantic mask. Do not paint reference background onto hair.',
    'render_comparison':'Use Standard view transform for unlit raster colors; keep the same camera for geometric comparison.'},
 'hair_geometry_actions':[
   {'priority':1,'action':'Expand the middle/lower rear hair volume, with roots and earcups frozen.',
    'target_world_z_range':[-.235,-.21],'current_rear_bounds_world_z':world_lo[2],
    'estimated_displacement_world_z':[-.08,-.05],
    'max_weight_height_world_y':[.04,.24],
    'limits':'Only hair-semantic existing vertices; do not move coat/body inside the same AABB.'},
   {'priority':2,'action':'Shape five to seven broad S clumps with shallow valleys, then taper/stagger tips.',
    'clump_center_world_x_approx':[-.25,-.17,-.06,.06,.17,.25],
    'tip_world_y_range':[-.11,-.05],'tip_rear_world_z_range':[-.18,-.10],
    'limits':'Preserve the current overall hair length (~Y=-.10). No narrow spaghetti tubes or a new curtain overlay.'},
   {'priority':3,'action':'Use the back silhouette landmarks to control irregular outer loops separately.',
    'target_middle_world_x_range':[-.30,.31],
    'limits':'Do not uniformly shrink all hair; source outer slivers and inner broad masses need separate weights.'},
 ],
 'protected_features':{'earcup_centers_world':[[-.204,.258,.062],[.163,.258,.092]],
    'freeze':'Face, eyes, eyebrows, bangs/scalp roots, headphone geometry, body, hands, coat and suitcase; keep all vertices outside a frozen hair-semantic selection exactly unchanged.'},
 'old_hair_recipe_use':{
    'method_only':['BVH/ray-picked semantic ROI','Boundary-loop and triangle-orientation checks',
                   'Exact new-cap-versus-retained intersection audit when cutting'],
    'do_not_reuse':'Old V11 face IDs, ROI coordinates or rejected shape candidates; current source is a different mesh and coordinate scale.',
    'v1_cap_issue':'Old cap V1 had four proper cap/retained intersection segments.',
    'v2_scope':'Old cap V2 exact audit passed for new caps only; no whole-hair visual approval.'},
 'crop_provenance':crop_records,
}
config = copy.deepcopy(json.loads(frozen[CONFIG]))
config['horizontal_center_pixels'] = [[-.45,223],[0,223],[.15,220],[.19,222.5],[.30,222.5],[.36,222],[.48,222]]
config['horizontal_scale'] = [[-.45,491],[0,440],[.15,475],[.235,510],[.34,485],[.48,480]]
# The builder safely ignores this explicit status/measurement record.
config['manual_calibration'] = {'status':'proposal, not rendered or approved','source':'geometric eye cavities measured by root',
                              'uncertainty_pixels':4,'guide':'alexia-geometry-calibration.json'}

canvas = Image.new('RGB',(1760,1130),'#141923')
draw = ImageDraw.Draw(canvas)
try:
    title = ImageFont.truetype('C:/Windows/Fonts/segoeuib.ttf',24)
    font = ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf',20)
except OSError:
    title = font = ImageFont.load_default()
draw.text((26,16),'Alexia V2: referensi 2D dan mesh aktual | kamera belum identik',font=title,fill='#edf0f8')
names = ['front','profile-plus-x','profile-minus-x','back']
labels = ['Depan','Profil +X / menghadap kiri','Profil -X / menghadap kanan','Belakang']
actual = ['front','left','right','back']
for i,(name,label,view) in enumerate(zip(names,labels,actual)):
    x = 20+i*435
    draw.text((x,56),label,font=font,fill='#b9ccfa')
    for row,p in enumerate([OUT/('reference-'+name+'.png'), RENDERS/(view+'.png')]):
        source = Image.open(p).convert('RGB')
        thumbnail = source.copy(); thumbnail.thumbnail((420,440),Image.Resampling.LANCZOS)
        px = x+(420-thumbnail.width)//2; py = 96+row*494+(440-thumbnail.height)//2
        canvas.paste(thumbnail,(px,py))
        draw.text((x,76+row*494),'Referensi disetujui (2D)' if row==0 else 'Mesh pass2 aktual (statis)',font=font,fill='#dce2ed')
draw.text((26,1082),'Panduan rambut: tambah kedalaman tengah; ujung S terpisah; panjang tetap. Ketidakpastian manual ±4 piksel.',font=font,fill='#d5dfec')
canvas.save(OUT/OUTPUT_NAMES[2])
def write_json(name,data):
    with (OUT/name).open('x',encoding='utf-8',newline='\n') as handle:
        handle.write(json.dumps(data,indent=2,ensure_ascii=False)+'\n')
write_json(OUTPUT_NAMES[0],guide)
write_json(OUTPUT_NAMES[1],config)
assert all(p.read_bytes()==raw for p,raw in frozen.items()),'A frozen input changed'
proof = {'schema':'crwt.reference_calibration.input_proof.v1','input_files':[
    {'path':str(p),'bytes':len(raw),'sha256':SHA(raw),'unchanged_after':True} for p,raw in frozen.items()],
    'outputs':[{'path':str(OUT/name),'sha256':SHA((OUT/name).read_bytes())} for name in OUTPUT_NAMES[:3]],
    'source_image_modification':False,'source_mesh_modification':False,
    'thumbnail_layout_only':True,'texture_asset_outputs':False,'manual_not_camera_solved':True,
    'approved':False,'gameIntegrated':False}
write_json(OUTPUT_NAMES[3],proof)
print(json.dumps({'status':'manual-calibration-guide-written','guide':str(OUT/OUTPUT_NAMES[0]),
                  'front_proposal':str(OUT/OUTPUT_NAMES[1]),'rear_depth':[p['rear_wave_world_z_estimate'] for p in profiles],
                  'source_inputs_unchanged':True}))

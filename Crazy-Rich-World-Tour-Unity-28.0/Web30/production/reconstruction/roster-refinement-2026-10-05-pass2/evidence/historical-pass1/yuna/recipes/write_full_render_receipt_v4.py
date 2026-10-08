"""Verify finished seven-view/24-orbit mesh render set and write a new supplementary receipt."""
import argparse,hashlib,json,pathlib,struct
p=argparse.ArgumentParser();p.add_argument('--id',choices=['nox','yuna'],required=True);a=p.parse_args()
root=pathlib.Path(__file__).resolve().parents[3];base=root/'work/model-refinement-2026-10-05'/a.id;folder=base/('final-v4-actual-mesh-renders' if a.id=='yuna' else 'final-actual-mesh-renders')
paths={'nox':base/'trial-v1/nox-hip-card-accessory-candidate.glb','yuna':base/'trial-v4/yuna-accessory-refinement-candidate.glb'}
expected={'nox':'0bc43f8be7f61773d6cc3a8cc67a6b3a7c907276d5e8bbd178b94ceecb175b6b','yuna':'07972d86aa8fb6701d26d0a8ee94dc35170a6516c2eb72cebbb0ec947152d224'}
sha=lambda f:hashlib.sha256(f.read_bytes()).hexdigest()
render=json.loads((folder/'render-evidence.json').read_text());assert render['input_sha256']==expected[a.id] and sha(paths[a.id])==expected[a.id]
main={'front.png','three-quarter.png','left.png','right.png','back.png','top.png','bottom.png'};orbit={f'orbit/frame-{t:03d}.png' for t in range(0,360,15)}
files=list(folder.glob('*.png'))+list((folder/'orbit').glob('*.png'));assert {str(f.relative_to(folder)).replace('\\','/') for f in files}==main|orbit
records=[]
for f in sorted(files):
    rel=str(f.relative_to(folder)).replace('\\','/');dimensions=list(struct.unpack_from('>II',f.read_bytes(),16));assert dimensions==([320,320] if rel in orbit else [640,640])
    records.append({'path':rel,'bytes':f.stat().st_size,'sha256':sha(f),'dimensions':dimensions})
assert render['orbit_frames']==24 and len(render['views'])==7
report={'schema':'crwt.complete_candidate_mesh_render_set.v1','id':a.id,'candidate':str(paths[a.id]),'candidate_sha256':sha(paths[a.id]),'folder':str(folder),'seven_views':7,'orbit_frames':24,'images_verified':31,'source':'Actual exported GLB mesh/materials via unchanged render_review_blender.py; no reference-image billboard','render_evidence_sha256':sha(folder/'render-evidence.json'),'engine':render['engine'],'blender_version':render['blender_version'],'render_script_sha256':sha(root/'work/model-rebuild/render_review_blender.py'),'approved':False,'gameIntegrated':False,'limits':['These are geometry render views, not a whole-character visual approval or deformation/game test.'],'images':records}
out=base/'FULL-RENDER-HANDOFF.json'
with out.open('x',encoding='utf-8',newline='\n') as f:f.write(json.dumps(report,indent=2)+'\n')
print(json.dumps({'id':a.id,'folder':str(folder),'views':7,'orbit':24,'receipt':str(out),'receipt_sha256':sha(out),'candidate_sha256':sha(paths[a.id])}))

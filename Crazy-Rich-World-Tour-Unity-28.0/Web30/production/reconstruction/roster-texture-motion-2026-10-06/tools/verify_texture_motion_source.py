#!/usr/bin/env python3
"""Verify canonical source files and actual preserved texture+rigged GLB; stdlib."""
import argparse,gzip,hashlib,importlib.util,io,json,pathlib,re,struct,sys
sys.dont_write_bytecode=True
PREFIX='Crazy-Rich-World-Tour-Unity-28.0/Web30/production/reconstruction/roster-texture-motion-2026-10-06'
OLD_PREFIX='Crazy-Rich-World-Tour-Unity-28.0/Web30/production/reconstruction/roster-side-colors-2026-10-06'
BASELINE_MANIFEST_SHA='a1074ce0ee43c861a60318cf77669876878c4f91f81661d4e241f081633b70c4'
BASELINE_ALEXIA_SHA='aa2a57b3e8c15535d0b29914fdfe0b7da18289f91dbf99fce515346795394000'
INVENTORY='source-inventory.json';PINS='source-pins.json'
RAW_MODEL='viewer/models/alexia.glb';GZIP_MODEL=RAW_MODEL+'.gz'
EXCLUDED={INVENTORY,'evidence/github-publication-receipt.json','BUKA-REVIEW-MODEL.html',RAW_MODEL}
IDS={'alexia','rindi','atlas','kairo','luna','mochi','nox','pip','yuna','zeno'}
VIEWS=['front','three-quarter','left','right','back']
VALIDATOR_SHA='72ef5252320ffe045415287e1101c61af032fc6574580e3c245aa4820a30a942'
def require(ok,message):
 if not ok:raise ValueError(message)
def sha(raw):return hashlib.sha256(raw).hexdigest()
def valid_sha(v):return isinstance(v,str) and bool(re.fullmatch('[0-9a-f]{64}',v)) and v!='0'*64
def safe_relative(name):
 require(isinstance(name,str) and name and name.isascii() and not any(ord(c)<32 for c in name),'Invalid ASCII source name');p=pathlib.PurePosixPath(name)
 require(not p.is_absolute() and '\\' not in name and ':' not in name and all(v not in {'','..','.'} for v in name.split('/')),'Unsafe source path')
 require(all(not part.endswith((' ','.')) and part.split('.')[0].casefold() not in {'con','prn','aux','nul',*[f'com{i}' for i in range(1,10)],*[f'lpt{i}' for i in range(1,10)]} for part in p.parts),'Windows source path collision');return name
def safe_path(root,name):
 safe_relative(name);p=root/name;require(p.resolve().is_relative_to(root.resolve()) and not p.is_symlink() and not getattr(p,'is_junction',lambda:False)(),'Linked or escaped source path');return p
def filehash(path):
 h1=hashlib.sha1(b'blob '+str(path.stat().st_size).encode()+b'\0');h=hashlib.sha256();size=0
 with path.open('rb') as f:
  for block in iter(lambda:f.read(1024*1024),b''):h1.update(block);h.update(block);size+=len(block)
 return {'bytes':size,'sha256':h.hexdigest(),'git_blob_sha1':h1.hexdigest()}
def document(raw):
 def pairs(rows):
  d={}
  for k,v in rows:require(k not in d,'Duplicate JSON key');d[k]=v
  return d
 return json.loads(raw,object_pairs_hook=pairs)
def no_approval(d,mandatory=False):
 for key in ['approved','gameIntegrated']:
  if mandatory or key in d:require(d.get(key) is False,'Unapproved/runtime false flags required')
def pointer(d,path):
 require(isinstance(path,str) and path.startswith('/'),'JSON pointer required')
 for key in path[1:].split('/'):
  key=key.replace('~1','/').replace('~0','~');d=d[int(key)] if isinstance(d,list) else d[key]
 return d
def same(a,b):return json.dumps(a,sort_keys=True,separators=(',',':'))==json.dumps(b,sort_keys=True,separators=(',',':'))
def inventory_document(raw):
 require(raw.isascii(),'ASCII inventory required');d=document(raw);require(d['schema']=='crwt.alexia_texture_motion_source_inventory.v1' and d['prefix']==PREFIX,'Source inventory schema/prefix');no_approval(d,True)
 rows=d['files'];require(rows and d['excluded']==sorted(EXCLUDED),'Explicit self/derived exclusions');names=[]
 for row in rows:
  name=safe_relative(row['path']);require(name not in EXCLUDED and type(row['bytes']) is int and row['bytes']>=0 and valid_sha(row['sha256']) and re.fullmatch('[0-9a-f]{40}',row['git_blob_sha1']) and row['mode'] in {'100644','100755'},'Inventory row');names.append(name)
 require(names==sorted(names) and len({n.casefold() for n in names})==len(names),'Unique sorted source inventory');return d
def pins_document(raw):
 p=document(raw);require(p['schema']=='crwt.alexia_texture_motion_source_pins.v1' and p['prefix']==PREFIX and not p.get('template_only'),'Final source pins');no_approval(p,True)
 b=p['baseline'];require(b['prefix']==OLD_PREFIX and b['manifest_sha256']==BASELINE_MANIFEST_SHA and b['alexia_sha256']==BASELINE_ALEXIA_SHA and b['repository_blobs_preserved_by_parent']==4536,'Current baseline pins')
 r=p['review'];require(r['path']=='review-manifest.json' and valid_sha(r['sha256']) and valid_sha(r['candidate_sha256']),'Review pins')
 m=p['model_storage'];require(m['codec']=='gzip' and m['path']==GZIP_MODEL and m['raw_path']==RAW_MODEL and valid_sha(m['sha256']) and m['raw_sha256']==r['candidate_sha256'] and 0<m['bytes']<=35000000 and 0<m['raw_bytes']<=100000000,'Compressed selected model pins')
 g=p['gallery'];require(g['archive']=='OFFLINE-GALLERY.zip' and g['entry']=='BUKA-REVIEW-MODEL.html' and g['receipt']=='BUKA-REVIEW-MODEL.viewer-receipt.json' and all(valid_sha(g[k]) for k in ['archive_sha256','html_sha256','receipt_sha256']) and g['html_bytes']>0 and g['archive_storage']=='split','Gallery pins')
 parts=g['archive_parts'];require(isinstance(parts,list) and len(parts)>=2 and sum(row['bytes'] for row in parts)==g['archive_bytes'],'Gallery part list')
 for i,row in enumerate(parts,1):require(row['path']==f'OFFLINE-GALLERY.zip.part-{i:02d}' and valid_sha(row['sha256']) and 0<row['bytes']<=22000000,'Bounded ordered gallery part')
 roles=p['proofs'];require(set(roles)>={'selected','independent','native_build','native_reopen','native_certificate'},'Required proof roles')
 require(roles['independent']['expected_fields'].get('/passed') is True and roles['independent']['expected_fields'].get('/visual_accepted') is True,'Actual final visual/numeric acceptance required')
 require(valid_sha(p['source_gate']['sha256']) and p['source_gate']['path']=='tools/verify_texture_motion.py','Direct source gate pin')
 for role,row in roles.items():require(valid_sha(row['sha256']) and row['schema'] and isinstance(row['expected_fields'],dict) and row['expected_fields'],'Explicit pinned proof role '+role);safe_relative(row['path'])
 return p
def decode_model(roster,pins):
 m=pins['model_storage'];compressed=safe_path(roster,m['path']).read_bytes();require(len(compressed)==m['bytes'] and sha(compressed)==m['sha256'],'Compressed model differs')
 with gzip.GzipFile(fileobj=io.BytesIO(compressed),mode='rb') as g:raw=g.read(m['raw_bytes']+1);require(not g.read(1),'Decoded model exceeds exact raw pin')
 require(len(raw)==m['raw_bytes'] and sha(raw)==m['raw_sha256'],'Decoded raw model differs');return raw
class ReadOnlyBytes:
 def __init__(self,raw):self.raw=raw
 def read_bytes(self):return self.raw
def direct_gate(roster,source,candidate,pin=None):
 path=safe_path(roster,'tools/verify_texture_motion.py');require(pin is None or filehash(path)['sha256']==pin,'Frozen direct source gate differs')
 oldpath=list(sys.path);sys.path.insert(0,str(path.parent))
 try:
  spec=importlib.util.spec_from_file_location('actual_texture_motion_source_gate',path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module.verify(ReadOnlyBytes(source),ReadOnlyBytes(candidate),safe_path(roster,'evidence/selected-alexia/semantic-masks.npz'))
 finally:sys.path[:]=oldpath
def verify(roster,baseline,inventory,pins_path=None):
 roster=roster.resolve(strict=True);baseline=baseline.resolve(strict=True);inventory=inventory.resolve(strict=True);pins_path=(pins_path or roster/PINS).resolve(strict=True);require(inventory==roster/INVENTORY and pins_path==roster/PINS and roster!=baseline,'Canonical roots')
 invraw=inventory.read_bytes();inv=inventory_document(invraw);pinsraw=pins_path.read_bytes();pins=pins_document(pinsraw);records={r['path']:r for r in inv['files']};inputs={inventory:filehash(inventory),pins_path:filehash(pins_path)};actual=set()
 for path in roster.rglob('*'):
  require(not path.is_symlink() and not getattr(path,'is_junction',lambda:False)(),'Link in source snapshot')
  if path.is_file():actual.add(path.relative_to(roster).as_posix())
 require(actual-EXCLUDED==set(records),'Canonical source file set differs')
 for name,row in records.items():
  path=safe_path(roster,name);d=filehash(path);require(all(d[k]==row[k] for k in d),'Inventory file differs: '+name);inputs[path]=d
  if name.endswith(('.png','.jpg','.jpeg')):
   with path.open('rb') as f:header=f.read(8)
   require(header==b'\x89PNG\r\n\x1a\n' if name.endswith('.png') else header[:3]==b'\xff\xd8\xff','Image extension/signature mismatch')
 def raw(name,base=roster,pin=None):
  path=safe_path(base,name);data=path.read_bytes();d=filehash(path);require(d['sha256']==sha(data) and (pin is None or sha(data)==pin),'Pinned file differs: '+name);inputs[path]=d;return data
 def item(row):return raw(row['path'],pin=row['sha256'])
 reviewraw=item(pins['review']);review=document(reviewraw);no_approval(review,True);old=document(raw('review-manifest.json',baseline,BASELINE_MANIFEST_SHA));no_approval(old,True)
 require(review['schema']==pins['review']['schema'] and review['changed_models']==1 and review['baseline_manifest_sha256']==BASELINE_MANIFEST_SHA and review['unchanged_models']==sorted(IDS-{'alexia'}),'Review scope/baseline')
 rows=review['models'];require(len(rows)==len(old['models'])==10 and {r['id'] for r in rows}=={r['id'] for r in old['models']}==IDS,'Ten model IDs');oldrows={r['id']:r for r in old['models']};require(oldrows['alexia']['sha256']==BASELINE_ALEXIA_SHA,'Old Alexia pin')
 validator_path=safe_path(roster,'tools/validate_roster_candidate.py');require(filehash(validator_path)['sha256']==VALIDATOR_SHA,'Frozen structural validator');spec=importlib.util.spec_from_file_location('texture_motion_validator',validator_path);validator=importlib.util.module_from_spec(spec);spec.loader.exec_module(validator)
 candidate=decode_model(roster,pins);counts={};modelraw={}
 for r in rows:
  id=r['id'];no_approval(r,True);require(r['path']==f'viewer/models/{id}.glb' and r['reference']==f'viewer/references/{id}.png' and r['baseline_sha256']==oldrows[id]['sha256'] and r['refined_in_this_checkpoint'] is (id=='alexia'),'Model canonical/baseline markers');require(r['sha256']==(pins['review']['candidate_sha256'] if id=='alexia' else oldrows[id]['sha256']) and r['referenceSha256']==oldrows[id]['referenceSha256'],'Model/reference pin')
  data=candidate if id=='alexia' else raw(r['path'],pin=r['sha256']);modelraw[id]=data;counts[id]=validator.validate_model(data);raw(r['reference'],pin=r['referenceSha256'])
  for k,v in r['expected'].items():require(counts[id].get(k)==v,'Actual model count differs: '+id+'/'+k)
  if id=='alexia':require(counts[id]['skins']>0 and set(counts[id]['clip_names'])>={'IdleBreath','Walk'},'Real Alexia skin/clips')
  elif id=='pip':require((counts[id]['skins'],counts[id]['clips'])==(1,6),'Preserved Pip rig/clips')
  else:require((counts[id]['skins'],counts[id]['clips'])==(0,0),'Preserved static model')
 if RAW_MODEL in actual:require(raw(RAW_MODEL,pin=pins['model_storage']['raw_sha256'])==candidate,'Derived raw GLB differs')
 if 'BUKA-REVIEW-MODEL.html' in actual:require(len(raw('BUKA-REVIEW-MODEL.html',pin=pins['gallery']['html_sha256']))==pins['gallery']['html_bytes'],'Derived HTML differs')
 gate=direct_gate(roster,raw('viewer/models/alexia.glb',baseline,BASELINE_ALEXIA_SHA),candidate,pins['source_gate']['sha256']);require(gate['passed'] is True,'Actual source/skin gate failed')
 proofdocs={}
 for role,r in pins['proofs'].items():
  d=document(item(r));require(d['schema']==r['schema'],'Proof schema: '+role);no_approval(d)
  for field,value in r['expected_fields'].items():require(same(pointer(d,field),value),'Proof field: '+role+field)
  for key,override,default in [('candidate_sha_pointer','candidate_sha256',pins['review']['candidate_sha256']),('source_sha_pointer','source_sha256',BASELINE_ALEXIA_SHA),('blend_sha_pointer','blend_sha256',pins['native']['blend']['sha256']),('manifest_sha_pointer','manifest_sha256',pins['native']['editable_manifest']['sha256'])]:
   if key in r:require(pointer(d,r[key])==r.get(override,default),'Proof SHA binding: '+role+'/'+key)
  for bound in r.get('bound_files',[]):raw(bound['path'],pin=pointer(d,bound['sha_pointer']))
  proofdocs[role]=d
 for role in ['selected','independent']:require('candidate_sha_pointer' in pins['proofs'][role] and 'source_sha_pointer' in pins['proofs'][role],'Required source/candidate proof binding')
 n=pins['native'];item(n['blend']);editable=document(item(n['editable_manifest']));no_approval(editable,True);require(editable['models']==[{'id':'alexia','path':RAW_MODEL,'sha256':pins['review']['candidate_sha256']}],'Portable single native manifest');build=proofdocs['native_build'];reopen=proofdocs['native_reopen'];fp=build['native_fingerprints'];require(fp==reopen['native_fingerprints'] and len(fp['meshes'])==counts['alexia']['meshes']==3 and fp['armatures'],'Native rigged fingerprints save/reopen')
 require(sum(m['vertices'] for m in fp['meshes'].values())==counts['alexia']['vertices'] and sum(m['polygons'] for m in fp['meshes'].values())==counts['alexia']['faces'],'Native geometry totals')
 require(set(a['name'] for a in fp['actions'])==set(counts['alexia']['clip_names']),'Actual native action names');colors=sum(len(m['color_attributes']) for m in fp['meshes'].values());require(reopen['native_COLOR_attribute_count']==colors and reopen['native_active_FILE_image_count']==len(fp['packed_FILE_images']),'Dynamic native color/image counts')
 renderpin=pins['render_selection'];selection=document(item(renderpin));no_approval(selection,True);require(selection['schema']==renderpin['schema'] and selection['new_actual_png_count']==5 and selection['reused_actual_png_count']==45 and {r['id'] for r in selection['characters']}==IDS,'Render scope');renderrows={r['id']:r for r in selection['characters']};pngsha={}
 for r in rows:
  id=r['id'];entry=renderrows[id];require(entry['glb_sha256']==r['sha256'],'Render source pin');proofraw=raw(f'renders/{id}/render-evidence.json',pin=entry['render_proof_sha256']);d=document(proofraw);require(d['input_sha256']==r['sha256'] and d['production_approved'] is False and d['orbit_frames']==0 and [v[0] for v in d['views']]==VIEWS and d['polygons']==counts[id]['faces'],'Actual five-view proof');require(entry['source_accessor_vertices']==counts[id]['vertices'] and entry['imported_blender_vertices']==d['vertices'],'Actual render vertex totals')
  if id!='alexia':require(proofraw==raw(f'renders/{id}/render-evidence.json',baseline),'Reused render proof differs')
  for view in VIEWS:
   name=f'renders/{id}/{view}.png';png=raw(name);require(png[:8]==b'\x89PNG\r\n\x1a\n' and struct.unpack('>II',png[16:24])==(640,640),'PNG dimensions/signature');pngsha[name]=sha(png)
   if id!='alexia':require(png==raw(name,baseline),'Reused PNG differs')
 visual=proofdocs['independent'];require(visual['render_proof_sha256']==renderrows['alexia']['render_proof_sha256'] and visual['actual_png_sha256']=={view:pngsha[f'renders/alexia/{view}.png'] for view in VIEWS},'Accepted visual proof must bind five final actual files')
 g=pins['gallery'];receipt=document(raw(g['receipt'],pin=g['receipt_sha256']));require(receipt['viewer_sha256']==g['html_sha256'] and receipt['viewer_bytes']==g['html_bytes'] and receipt['manifest_sha256']==sha(reviewraw) and receipt['visual_approval'] is False and receipt['game_integration'] is False and receipt['requires_network'] is False,'Gallery receipt');require({r['id']:r['sha256'] for r in receipt['models']}=={r['id']:r['sha256'] for r in rows},'Gallery model pins')
 from restore_offline_gallery import inspect_archive
 for part in g['archive_parts']:require(part['path'] in records and all(records[part['path']][k]==part[k] for k in ['bytes','sha256']),'Gallery inventory/parts binding')
 archive=inspect_archive(roster/g['archive'],g)
 for path,pin in inputs.items():require(filehash(path)==pin,'Read-only input changed')
 return {'schema':'crwt.alexia_texture_motion_source_verification.v1','passed':True,'prefix':PREFIX,'files_checked':len(records),'source_inventory_sha256':sha(invraw),'source_pins_sha256':sha(pinsraw),'review_manifest_sha256':sha(reviewraw),'baseline_manifest_sha256':BASELINE_MANIFEST_SHA,'selected_alexia_sha256':pins['review']['candidate_sha256'],'changed_models':1,'unchanged_models':9,'model_counts':counts,'actual_texture_motion_gate':gate,'compressed_selected_model':pins['model_storage'],'native_mesh_count':len(fp['meshes']),'native_armature_count':len(fp['armatures']),'native_action_count':len(fp['actions']),'native_COLOR_attribute_count':colors,'native_blend_sha256':n['blend']['sha256'],'packed_active_FILE_images':len(fp['packed_FILE_images']),'native_reopen_scope':'Pinned actual local build/reopen fingerprints; CI does not run Blender','new_actual_views':5,'reused_actual_views':45,'actual_render_png_sha256':pngsha,'gallery_archive':archive,'all_inputs_unchanged':True,'approved':False,'gameIntegrated':False,'limits':['Manual movement prototype, no gait/contact/production certification.','Complete4536 previous repository blob preservation is parent publisher scope.']}
def main():
 p=argparse.ArgumentParser();p.add_argument('--roster',type=pathlib.Path,required=True);p.add_argument('--baseline-roster',type=pathlib.Path,required=True);p.add_argument('--inventory',type=pathlib.Path,required=True);p.add_argument('--pins',type=pathlib.Path);p.add_argument('--receipt',type=pathlib.Path);a=p.parse_args()
 if a.receipt:require(not a.receipt.exists() and not a.receipt.resolve().is_relative_to(a.roster.resolve()) and not a.receipt.resolve().is_relative_to(a.baseline_roster.resolve()),'Fresh external receipt')
 report=verify(a.roster,a.baseline_roster,a.inventory,a.pins)
 if a.receipt:
  a.receipt.parent.mkdir(parents=True,exist_ok=True)
  with a.receipt.open('x',encoding='utf-8',newline='\n') as f:f.write(json.dumps(report,indent=2)+'\n')
 print(json.dumps(report,indent=2))
if __name__=='__main__':main()

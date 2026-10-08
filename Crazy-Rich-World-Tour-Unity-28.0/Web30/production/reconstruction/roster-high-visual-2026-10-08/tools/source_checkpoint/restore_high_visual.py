"""Restore a lean HIGH checkpoint losslessly, using its pinned sibling baseline.

Standard library only for restoration/gallery/all-ten validation. The optional
HIGH model gate requires NumPy. No Blender run or PNG recreation is performed.
"""
import sys
sys.dont_write_bytecode=True
import argparse,gzip,pathlib,tempfile
import os
if os.name=='nt':
 _module_dir=str(pathlib.Path(__file__).resolve().parent);_extended_prefix=chr(92)*2+'?'+chr(92)
 if not _module_dir.startswith(_extended_prefix):_module_dir=_extended_prefix+('UNC'+_module_dir[1:] if _module_dir.startswith(chr(92)*2)else _module_dir)
 sys.path.insert(0,_module_dir)
from portable_high_common import *

def normalize_gallery_receipt(path,expected,policy):
 need(isinstance(policy,dict)and policy.get('schema')=='crwt.high_gallery_receipt_serialization.v1','Explicit gallery receipt serialization policy required')
 need(policy.get('canonical_line_ending')=='CRLF'and policy.get('accepted_generated_line_endings')==['LF','CRLF']and policy.get('json_serialization')=="json.dumps(document, ensure_ascii=False, indent=2) + LF",'Only declared LF/CRLF JSON serialization is supported')
 need(policy.get('canonical_pin')==expected,'Receipt policy/payload byte pins differ')
 original=path.read_bytes();document=__import__('json').loads(original.decode('utf-8'),parse_constant=lambda value:(_ for _ in()).throw(ValueError('Nonfinite receipt JSON')))
 semantic=__import__('json').dumps(document,ensure_ascii=False,sort_keys=True,separators=(',',':'),allow_nan=False).encode('utf-8')
 need(hashes(semantic)['sha256']==policy.get('canonical_document_sha256'),'Generated receipt JSON document differs')
 lf=(__import__('json').dumps(document,ensure_ascii=False,indent=2,allow_nan=False)+'\n').encode('utf-8');crlf=lf.replace(b'\n',b'\r\n')
 need(original in (lf,crlf),'Generated receipt has unexpected whitespace/mixed endings/BOM')
 need(hashes(crlf)==expected,'Canonical generated receipt SHA/Gitblob/bytes differ')
 changed=original!=crlf
 if changed:path.write_bytes(crlf)
 need(hashes(path.read_bytes())==expected,'Canonical receipt write is not exact')
 return {'canonical_line_ending':'CRLF','generated_line_ending':'LF'if changed else 'CRLF','line_ending_normalization_applied':changed,'JSON_document_unchanged':True,'canonical_sha256':expected['sha256'],'canonical_git_blob_sha1':expected['git_blob_sha1'],'canonical_bytes':expected['bytes']}

def restore(source,output,baseline=None,receipt=None,verify_models=False,verify_high_gate=False):
 source=source.resolve(strict=True);layout=json_read(source/'source-layout.json');payload=json_read(source/'review-payload.json')
 need(layout['schema']==LAYOUT_SCHEMA and payload['schema']==PAYLOAD_SCHEMA,'HIGH layout/payload schema differs')
 baseline=(baseline or source.parent/layout['baseline_directory']).resolve(strict=True);output=fresh(output,source,baseline)
 if receipt:receipt=fresh(receipt,source,baseline,output)
 pins,ipin=source_pins(source);basepins=baseline_catalog(baseline,layout['baseline_inventory_sha256']);expected={r['path']:{k:r[k]for k in ('bytes','sha256','git_blob_sha1')}for r in payload['files']}
 rows=layout['files'];names=[r['path']for r in rows];need(len(names)==len({safe(n)for n in names})==len(expected) and set(names)==set(expected),'Restore mapping is not complete/unique')
 need(all({k:r[k]for k in ('bytes','sha256','git_blob_sha1')}==expected[r['path']]for r in rows),'Layout/payload pins differ')
 output.parent.mkdir(parents=True,exist_ok=True);checks=[]
 with tempfile.TemporaryDirectory(prefix='crwt-high-baseline-',dir=output.parent) as temp:
  resolved_temp=pathlib.Path(temp).resolve();need(resolved_temp.is_relative_to(output.parent.resolve()) and resolved_temp!=output.parent.resolve(),'Temporary cleanup target escaped parent')
  old=pathlib.Path(temp)/'review';baseline_restore(baseline,old,layout['baseline_inventory_sha256']);oldpins=scan(old)
  output.mkdir();generated=[]
  for row in rows:
   name=row['path'];safe(name);destination=output/name;need(destination.resolve().is_relative_to(output),'Restore path escape')
   kind=row['encoding']
   if kind=='gallery-generated':generated.append(row);continue
   if kind=='baseline':
    base=row['baseline_path'];safe(base);need(base in basepins and {k:row[k]for k in ('bytes','sha256')}==basepins[base],'Baseline reference pin differs');raw=(old/base).read_bytes()
   elif kind=='direct':safe(row['source']);raw=(source/row['source']).read_bytes()
   elif kind=='gzip-parts':
    parts=row['parts'];need(parts and len(parts)==len(set(parts)),'Stored parts duplicate/empty')
    for part in parts:safe(part);need(part in pins and pins[part]['bytes']<=PART_BYTES,'Part pin/size')
    stored=b''.join((source/x).read_bytes()for x in parts);need(hashes(stored)==row['stored_pin'],'Stored compressed artifact differs');raw=gzip.decompress(stored)
   else:raise ValueError('Unknown encoding: '+kind)
   need(hashes(raw)==expected[name],'Restored artifact bytes differ: '+name);destination.parent.mkdir(parents=True,exist_ok=True);destination.open('xb').write(raw)
  gallery=layout['gallery'];need({r['path']for r in generated}=={gallery['html_path'],gallery['receipt_path']},'Exactly gallery HTML and receipt must be generated')
  before=scan(output)
  checks.append(command([sys.executable,'-B',output/gallery['builder_path'],'--manifest',output/gallery['manifest_path'],'--output',output/gallery['html_path'],'--expected-output-sha256',expected[gallery['html_path']]['sha256']],'actual delivered offline gallery regeneration'))
  receipt_serialization=normalize_gallery_receipt(output/gallery['receipt_path'],expected[gallery['receipt_path']],gallery['receipt_line_ending_policy'])
  actual=scan(output);need(actual==expected,'Complete restored payload SHA/Gitblob inventory differs')
  need(all(actual[k]==v for k,v in before.items()),'Gallery rebuild changed an input')
  if verify_models:
   checks.append(command([sys.executable,'-B',output/'tools/validate_roster_candidate.py',output/'review-manifest.json'],'all ten actual GLBs'))
  if verify_high_gate:
   gate=layout['high_gate'];need(gate is not None and gate['tool_path'] in expected,'HIGH gate missing from actual payload')
   gateout=fresh(output.parent/(output.name+'-high-source-gate.json'),source,baseline,output)
   checks.append(command([sys.executable,'-B',output/gate['tool_path'],'--source',old/gate['baseline_model_path'],'--candidate',output/gate['candidate_path'],'--masks',output/gate['semantic_mask_path'],'--output',gateout],'actual selected HIGH source gate'))
   g=json_read(gateout);need(g['passed'] is True and g['candidate_sha256']==layout['candidate_sha256'],'HIGH gate selected SHA differs')
  need(scan(output)==expected and scan(old)==oldpins,'Read-only validators changed review/baseline files')
 need(source_pins(source)==(pins,ipin),'HIGH source changed during restore')
 result={'schema':'crwt.alexia_high_visual_source_restore.v1','passed':True,'candidate_sha256':layout['candidate_sha256'],'source_inventory_sha256':ipin['sha256'],'baseline_inventory_sha256':layout['baseline_inventory_sha256'],'source_files_checked':len(pins),'payload_files_restored':len(expected),'all_payload_bytes_git_blob_pins_exact':True,'gallery_HTML_and_receipt_regenerated_byte_exact':True,'gallery_receipt_serialization':receipt_serialization,'checks':checks,'source_unchanged':True,'new_Blender_or_browser_execution':False,'approved':False,'gameIntegrated':False}
 if receipt:write_json(receipt,result)
 return result
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--source',type=pathlib.Path,default=pathlib.Path(__file__).resolve().parents[2]);p.add_argument('--baseline-source',type=pathlib.Path);p.add_argument('--out-dir',required=True,type=pathlib.Path);p.add_argument('--receipt',type=pathlib.Path);p.add_argument('--verify-models',action='store_true');p.add_argument('--verify-high-gate',action='store_true');a=p.parse_args();print(__import__('json').dumps(restore(a.source,a.out_dir,a.baseline_source,a.receipt,a.verify_models,a.verify_high_gate),indent=2))

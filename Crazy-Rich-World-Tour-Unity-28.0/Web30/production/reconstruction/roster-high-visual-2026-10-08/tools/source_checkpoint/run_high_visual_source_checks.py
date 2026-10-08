"""Actual lean-source restore, ten GLBs/native evidence, HIGH gate and rebuild.

The raw review stays byte-identical and does not receive checkpoint-files.json.
The delivered checkpoint verifier's actual_assets API checks native bindings;
its ZIP inventory is created separately by the local checkpoint packager.
No Blender/render/Git/network operation is performed by this helper.
"""
import sys
sys.dont_write_bytecode=True
import argparse,importlib.util,pathlib,re
import os
if os.name=='nt':
 _module_dir=str(pathlib.Path(__file__).resolve().parent);_extended_prefix=chr(92)*2+'?'+chr(92)
 if not _module_dir.startswith(_extended_prefix):_module_dir=_extended_prefix+('UNC'+_module_dir[1:] if _module_dir.startswith(chr(92)*2)else _module_dir)
 sys.path.insert(0,_module_dir)
from portable_high_common import *

def checked_result(result,candidate,steps):
 need(result.get('schema')=='crwt.high_visual_actual_source_checks.v1' and result.get('passed') is True,'Actual source checks did not pass')
 need(result.get('candidate_sha256')==candidate and result.get('actual_recipe_step_count')==steps and type(steps)is int and steps>=5,'Selected candidate/recipe count differs')
 for name in ('restore','assets','rebuild'):
  need(isinstance(result.get(name),dict),'Missing actual check: '+name)
 need(result['restore'].get('passed')is True and result['restore'].get('candidate_sha256')==candidate and result['restore'].get('gallery_HTML_and_receipt_regenerated_byte_exact')is True and result['restore'].get('source_unchanged')is True,'Actual complete restore/gallery did not pass')
 checks=result['restore'].get('checks',[]);required={'actual delivered offline gallery regeneration','all ten actual GLBs','actual selected HIGH source gate'}
 need(isinstance(checks,list)and len(checks)==3 and {q.get('check')for q in checks}==required and all(q.get('passed')is True for q in checks),'Actual restore, all-ten and HIGH checks required')
 need(result['assets'].get('models_checked')==10 and result['assets'].get('candidate_sha256')==candidate and result['assets'].get('native_build_and_readonly_reopen_bindings_valid')is True and result['assets'].get('actual_alexia_clip_names')==['IdleBreath','Walk'] and result['assets'].get('native_bones')==19,'Actual ten-model/native bindings differ')
 need(result['rebuild'].get('passed')is True and result['rebuild'].get('candidate_sha256')==candidate and result['rebuild'].get('actual_step_count')==steps and result['rebuild'].get('final_model_byte_identical')is True and result['rebuild'].get('original_payload_source_SHA_mtime_unchanged')is True,'Actual recipe rebuild differs')
 actualsteps=result['rebuild'].get('steps',[]);need(len(actualsteps)==steps and len({q['id']for q in actualsteps})==steps and all(q.get('matched_actual_pinned_intermediate')is True and re.fullmatch('[a-f0-9]{64}',q.get('candidate_sha256',''))for q in actualsteps)and actualsteps[-1]['candidate_sha256']==candidate,'Every actual recipe intermediate must match')
 need(result.get('source_review_inputs_SHA_mtime_unchanged')is True and result.get('new_Blender_browser_render_execution')is False and result.get('global_repository_CI_success_claimed')is False,'Scope/input preservation flags differ')
 return result

def run(source,work,baseline=None,receipt=None):
 source=source.resolve(strict=True);baseline=(baseline or source.parent/json_read(source/'source-layout.json')['baseline_directory']).resolve(strict=True)
 work=fresh(work,source,baseline)
 if receipt:receipt=fresh(receipt,source,baseline,work)
 pins,ipin=source_pins(source);source_mtimes={str(p):p.stat().st_mtime_ns for p in source.rglob('*')if p.is_file()};chain=json_read(source/'rebuild-chain.json')
 try:from rebuild_high_visual import checked_chain,rebuild
 except ImportError:from rebuild_high_visual_v2 import checked_chain,rebuild
 steps=checked_chain(chain);work.mkdir(parents=True)
 from restore_high_visual import restore
 restored=work/'review';restoration=restore(source,restored,baseline,work/'restore-proof.json',True,True)
 rawpins=scan(restored);rawmtimes={str(p):p.stat().st_mtime_ns for p in restored.rglob('*')if p.is_file()}
 helper=restored/'verify_actual_checkpoint.py';need(helper.is_file(),'Actual delivered checkpoint verifier required')
 spec=importlib.util.spec_from_file_location('crwt_high_actual_checkpoint',helper);v=importlib.util.module_from_spec(spec);spec.loader.exec_module(v)
 assets=v.actual_assets(lambda name:(restored/name).read_bytes())
 for name in rawpins:
  if name.lower().endswith(('.png','.jpg','.jpeg')):
   with(restored/name).open('rb')as f:v.image_magic(name,f.read(8))
 rebuilding=rebuild(source,restored,work/'rebuilt',baseline,work/'rebuild-proof.json')
 need(scan(restored)==rawpins and {str(p):p.stat().st_mtime_ns for p in restored.rglob('*')if p.is_file()}==rawmtimes,'Actual checks changed restored review inputs')
 need(source_pins(source)==(pins,ipin)and {str(p):p.stat().st_mtime_ns for p in source.rglob('*')if p.is_file()}==source_mtimes,'Actual checks changed source inputs')
 result={'schema':'crwt.high_visual_actual_source_checks.v1','passed':True,'candidate_sha256':chain['candidate_sha256'],'source_inventory_sha256':ipin['sha256'],'actual_recipe_step_count':len(steps),'restore':restoration,'assets':assets,'rebuild':rebuilding,'delivered_actual_checkpoint_verifier_sha256':rawpins['verify_actual_checkpoint.py']['sha256'],'source_review_inputs_SHA_mtime_unchanged':True,'new_Blender_browser_render_execution':False,'existing_actual_native_build_reopen_evidence_checked':True,'global_repository_CI_success_claimed':False,'approved':False,'gameIntegrated':False}
 checked_result(result,chain['candidate_sha256'],len(steps))
 if receipt:write_json(receipt,result)
 return result

if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--source',type=pathlib.Path,default=pathlib.Path(__file__).resolve().parents[2]);p.add_argument('--baseline-source',type=pathlib.Path);p.add_argument('--work',required=True,type=pathlib.Path);p.add_argument('--receipt',required=True,type=pathlib.Path);a=p.parse_args();print(__import__('json').dumps(run(a.source,a.work,a.baseline_source,a.receipt),indent=2))

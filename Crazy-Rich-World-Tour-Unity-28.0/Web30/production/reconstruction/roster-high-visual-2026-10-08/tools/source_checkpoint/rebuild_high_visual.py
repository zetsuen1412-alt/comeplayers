"""Replay an actual variable-length HIGH recipe chain, with every SHA bound.

The initial hair/headband/material/body steps stay fixed. Later cleanup and
replacement steps come from structured, pinned argv in rebuild-chain.json.
No Blender, browser, renderer, network, Git or shell command string is used.
"""
import sys
sys.dont_write_bytecode=True
import argparse,pathlib,re
import os
if os.name=='nt':
 _module_dir=str(pathlib.Path(__file__).resolve().parent);_extended_prefix=chr(92)*2+'?'+chr(92)
 if not _module_dir.startswith(_extended_prefix):_module_dir=_extended_prefix+('UNC'+_module_dir[1:] if _module_dir.startswith(chr(92)*2)else _module_dir)
 sys.path.insert(0,_module_dir)
from portable_high_common import *
SCHEMA='crwt.alexia_high_visual_rebuild_chain.v2_variable_steps'
def checked_chain(chain):
 need(chain['schema']==SCHEMA,'Variable-step rebuild schema required');steps=chain['steps']
 need(len(steps)>=5 and chain['step_count']==len(steps)and [s['id']for s in steps[:4]]==['hair','headband','material','body'],'Initial four plus actual later cleanup steps required')
 ids=[];previous=chain['baseline_sha256']
 canonical=['build_clean_hair_final_waves.py','build_clean_headband.py','polish_authored_hair_material.py','build_clean_garment_profile.py'];need([pathlib.PurePosixPath(s['path']).name for s in steps[:4]]==canonical,'Preserved canonical four recipes required')
 known={'source','baseline','work',*['input:'+k for k in chain['inputs']]}
 for step in steps:
  name=step['id'];need(re.fullmatch('[a-z][a-z0-9_-]{0,39}',name)and name not in ids,'Duplicate/unsafe recipe step');ids.append(name)
  safe(step['path']);safe(step['output_glb']);need(pathlib.PurePosixPath(step['output_glb']).parts[0]==name and step['output_glb'].endswith('.glb'),'Step output directory scope')
  need(step['source_sha256']==previous,'Proof hash chain breaks');previous=step['candidate_sha256']
  need(re.fullmatch('[a-f0-9]{64}',previous),'Full observed model SHA required')
  need(isinstance(step['argv'],list)and all(isinstance(v,str)for v in step['argv'])and '{source}'in step['argv'],'Structured current-source argv required')
  for value in step['argv']:
   need(not pathlib.PurePosixPath(value).is_absolute()and not re.search('[A-Za-z]:[/\\\\]',value),'Literal absolute argv path forbidden')
   for key in re.findall(r'\{([^{}]+)\}',value):need(key in known,'Unknown portable input placeholder')
   stripped=re.sub(r'\{[^{}]+\}','',value);need('{'not in stripped and '}'not in stripped,'Malformed portable placeholder')
 need(previous==chain['candidate_sha256'],'Final chain model differs');return steps
def rebuild(source,payload,output,baseline=None,receipt=None):
 source=source.resolve(strict=True);payload=payload.resolve(strict=True);chain=json_read(source/'rebuild-chain.json');steps=checked_chain(chain)
 baseline=(baseline or source.parent/chain['baseline_directory']).resolve(strict=True);output=fresh(output,source,payload,baseline)
 if receipt:receipt=fresh(receipt,source,payload,baseline,output)
 pins,ipin=source_pins(source);payloadpins=scan(payload);stamps={str(p):p.stat().st_mtime_ns for p in payload.rglob('*')if p.is_file()}
 for row in list(chain['inputs'].values())+list(chain['proofs'].values())+[{k:s[k]for k in ('path','sha256')}for s in steps]:safe(row['path']);need(row['path']in payloadpins and payloadpins[row['path']]['sha256']==row['sha256'],'Actual variable-chain input pin differs')
 need(pathlib.PurePosixPath(steps[1]['path']).parent==pathlib.PurePosixPath(steps[2]['path']).parent,'Imported sibling headband helper absent')
 selected=payload/chain['candidate_path'];need(hashes(selected.read_bytes())['sha256']==chain['candidate_sha256'],'Actual selected model differs')
 output.mkdir(parents=True);old=output/'baseline';baseline_restore(baseline,old,chain['baseline_inventory_sha256']);original=old/chain['baseline_model_path'];need(hashes(original.read_bytes())['sha256']==chain['baseline_sha256'],'Actual e18 baseline differs')
 inp={k:payload/v['path']for k,v in chain['inputs'].items()};prior=original;results=[]
 for step in steps:
  need(hashes(prior.read_bytes())['sha256']==step['source_sha256'],'Actual intermediate source differs at '+step['id'])
  values={'source':str(prior),'baseline':str(original),'work':str(output),**{'input:'+k:str(v)for k,v in inp.items()}}
  def expand(value):
   need(not pathlib.PurePosixPath(value).is_absolute()and not re.search('[A-Za-z]:[/\\\\]',value),'Literal absolute argv path forbidden')
   def sub(match):need(match[1]in values,'Unknown portable placeholder');return values[match[1]]
   result=re.sub(r'\{([^{}]+)\}',sub,value);need('{'not in result and '}'not in result,'Unresolved argv token');return result
  target=output/step['output_glb'];need(target.resolve().is_relative_to(output)and not target.is_relative_to(old)and not target.exists(),'Fresh authored output scope')
  command([sys.executable,'-B',payload/step['path'],*[expand(v)for v in step['argv']]],'actual '+step['id']+' recipe')
  pin=hashes(target.read_bytes());need(pin['sha256']==step['candidate_sha256'],'Actual recipe is not byte-identical at '+step['id']);results.append({'id':step['id'],'candidate_sha256':pin['sha256'],'candidate_bytes':pin['bytes'],'matched_actual_pinned_intermediate':True});prior=target
 need(prior.read_bytes()==selected.read_bytes(),'Final cleanup/replacement model is not selected bytes')
 need(scan(payload)==payloadpins and {str(p):p.stat().st_mtime_ns for p in payload.rglob('*')if p.is_file()}==stamps and source_pins(source)==(pins,ipin),'Recipe replay changed a frozen input')
 result={'schema':'crwt.alexia_high_visual_actual_rebuild.v2_variable_steps','passed':True,'candidate_sha256':chain['candidate_sha256'],'source_inventory_sha256':ipin['sha256'],'baseline_inventory_sha256':chain['baseline_inventory_sha256'],'actual_step_count':len(steps),'steps':results,'final_model_byte_identical':True,'final_model_path':str(prior),'original_payload_source_SHA_mtime_unchanged':True,'renders_browser_native_not_regenerated':True,'approved':False,'gameIntegrated':False}
 if receipt:write_json(receipt,result)
 return result
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--source',type=pathlib.Path,default=pathlib.Path(__file__).resolve().parents[2]);p.add_argument('--payload',required=True,type=pathlib.Path);p.add_argument('--baseline-source',type=pathlib.Path);p.add_argument('--out-dir',required=True,type=pathlib.Path);p.add_argument('--receipt',type=pathlib.Path);a=p.parse_args();print(__import__('json').dumps(rebuild(a.source,a.payload,a.out_dir,a.baseline_source,a.receipt),indent=2))

"""Rebuild the selected HIGH GLB from local inputs in an extracted review.

NumPy is needed by the nine authored recipes; this wrapper is standard library.
No sibling repository checkpoint, Blender, renderer, network or Git is needed.
Every recipe/input/proof and intermediate GLB is checked against the delivered
chain. The complete review remains unchanged, including modification times.
"""
import sys
sys.dont_write_bytecode=True
import argparse,hashlib,json,pathlib,re,subprocess
SCHEMA='crwt.alexia_high_visual_rebuild_chain.v2_variable_steps'
def require(ok,message):
 if not ok:raise ValueError(message)
def safe(name):
 require(isinstance(name,str)and name and not any(ord(c)<32 or c in '\\:<>"|?*'for c in name),'Unsafe relative path')
 p=pathlib.PurePosixPath(name);require(not p.is_absolute()and all(x not in {'','.','..'}and not x.endswith((' ','.'))for x in name.split('/')),'Unsafe relative path')
 reserved={'con','prn','aux','nul',*[f'com{i}'for i in range(1,10)],*[f'lpt{i}'for i in range(1,10)]}
 require(all(x.split('.')[0].casefold()not in reserved and x.casefold()not in {'.git','__pycache__','node_modules'}for x in p.parts),'Unsafe Windows/cache path')
 return name.casefold()
def pin(path):
 h=hashlib.sha256();n=0
 with path.open('rb')as f:
  while block:=f.read(1048576):n+=len(block);h.update(block)
 return {'bytes':n,'sha256':h.hexdigest(),'mtime_ns':path.stat().st_mtime_ns}
def inventory(root):
 result={};seen=set()
 for p in root.rglob('*'):
  require(not p.is_symlink()and not getattr(p,'is_junction',lambda:False)(),'Review links are not supported')
  if not p.is_file():continue
  name=p.relative_to(root).as_posix();key=safe(name);require(key not in seen,'Case-colliding review path');seen.add(key);result[name]=pin(p)
 return result
def fresh(path,review):
 path=path.resolve();require(not path.exists()and not path.is_relative_to(review)and not review.is_relative_to(path),'Fresh external output required');return path
def checked_chain(chain):
 require(chain['schema']==SCHEMA and chain['step_count']==len(chain['steps'])and len(chain['steps'])>=5,'Complete variable-step chain required')
 canonical=['build_clean_hair_final_waves.py','build_clean_headband.py','polish_authored_hair_material.py','build_clean_garment_profile.py'];steps=chain['steps']
 require([s['id']for s in steps[:4]]==['hair','headband','material','body']and [pathlib.PurePosixPath(s['path']).name for s in steps[:4]]==canonical,'Original four authoring steps required')
 require(pathlib.PurePosixPath(steps[1]['path']).parent==pathlib.PurePosixPath(steps[2]['path']).parent,'Material recipe needs its pinned sibling headband helper')
 known={'source','baseline','work',*['input:'+k for k in chain['inputs']]};ids=set();previous=chain['baseline_sha256']
 for s in steps:
  require(re.fullmatch('[a-z][a-z0-9_-]{0,39}',s['id'])and s['id']not in ids,'Duplicate/unsafe recipe ID');ids.add(s['id']);safe(s['path']);safe(s['output_glb'])
  require(pathlib.PurePosixPath(s['output_glb']).parts[0]==s['id']and s['output_glb'].endswith('.glb'),'Each recipe output needs its own directory')
  require(s['source_sha256']==previous and re.fullmatch('[a-f0-9]{64}',s['candidate_sha256']),'Broken actual source/candidate chain');previous=s['candidate_sha256']
  require(isinstance(s['argv'],list)and all(isinstance(v,str)for v in s['argv'])and '{source}'in s['argv'],'Structured current-source argv required')
  for value in s['argv']:
   require(not pathlib.PurePosixPath(value).is_absolute()and not pathlib.PureWindowsPath(value).drive,'Literal external argv path forbidden')
   for key in re.findall(r'\{([^{}]+)\}',value):require(key in known,'Unknown input placeholder')
   stripped=re.sub(r'\{[^{}]+\}','',value);require('{'not in stripped and '}'not in stripped,'Malformed placeholder')
 require(previous==chain['candidate_sha256'],'Final chain SHA differs');return steps
def rebuild(review,chain_path,baseline_name,output,receipt,expected_sha=None,expected_count=None,source_gate=False):
 review=review.resolve(strict=True);chain_path=chain_path.resolve(strict=True);require(chain_path.is_relative_to(review),'Use the delivered local chain')
 output=fresh(output,review);receipt=fresh(receipt,review);require(not receipt.is_relative_to(output)and not output.is_relative_to(receipt),'External standalone receipt required')
 before=inventory(review);chain=json.loads(chain_path.read_bytes());steps=checked_chain(chain)
 if expected_sha is not None:require(chain['candidate_sha256']==expected_sha,'Explicit selected candidate differs')
 if expected_count is not None:require(len(steps)==expected_count,'Explicit selected step count differs')
 safe(baseline_name);baseline=review/baseline_name;require(pin(baseline)['sha256']==chain['baseline_sha256'],'Delivered e18 baseline differs')
 for row in list(chain['inputs'].values())+list(chain['proofs'].values())+[{k:s[k]for k in ('path','sha256')}for s in steps]:
  safe(row['path']);require(row['path']in before and before[row['path']]['sha256']==row['sha256'],'Delivered recipe/input/proof differs: '+row['path'])
 safe(chain['candidate_path']);selected=review/chain['candidate_path'];require(pin(selected)['sha256']==chain['candidate_sha256'],'Delivered selected model differs')
 output.mkdir(parents=True);previous=baseline;records=[];inputs={k:review/v['path']for k,v in chain['inputs'].items()}
 for step in steps:
  require(pin(previous)['sha256']==step['source_sha256'],'Actual intermediate source differs: '+step['id'])
  values={'source':str(previous),'baseline':str(baseline),'work':str(output),**{'input:'+k:str(v)for k,v in inputs.items()}}
  def expand(value):
   def substitute(match):require(match[1]in values,'Unknown portable input');return values[match[1]]
   return re.sub(r'\{([^{}]+)\}',substitute,value)
  target=output/step['output_glb'];require(target.resolve().is_relative_to(output)and not target.exists(),'Recipe output scope/freshness differs')
  run=subprocess.run([sys.executable,'-B',str(review/step['path']),*[expand(x)for x in step['argv']]],capture_output=True)
  require(run.returncode==0,'Recipe failed at '+step['id']+': '+(run.stdout+run.stderr).decode('utf-8','replace')[-2000:])
  actual=pin(target);require(actual['sha256']==step['candidate_sha256'],'Recipe byte reproduction differs: '+step['id'])
  records.append({'id':step['id'],'candidate_sha256':actual['sha256'],'candidate_bytes':actual['bytes'],'matched_actual_pinned_intermediate':True});previous=target
 require(previous.read_bytes()==selected.read_bytes(),'Final selected model is not byte-identical');gate=None
 if source_gate:
  helper=review/'tools/verify_high_visual.py';require(helper.is_file(),'Delivered HIGH source gate missing');target=output/'high-source-gate.json'
  run=subprocess.run([sys.executable,'-B',str(helper),'--source',str(baseline),'--candidate',str(previous),'--masks',str(inputs['semantic']),'--output',str(target)],capture_output=True)
  require(run.returncode==0,'Actual HIGH source gate failed: '+(run.stdout+run.stderr).decode('utf-8','replace')[-1800:]);gate=json.loads(target.read_bytes());require(gate['passed']is True and gate['candidate_sha256']==chain['candidate_sha256'],'Actual HIGH gate differs')
 require(inventory(review)==before,'Rebuild changed review SHA/mtime')
 result={'schema':'crwt.alexia_high_visual_local_review_rebuild.v2_pathcheck','passed':True,'candidate_sha256':chain['candidate_sha256'],'chain_sha256':pin(chain_path)['sha256'],'actual_step_count':len(steps),'steps':records,'final_model_path':str(previous),'final_model_byte_identical':True,'all_review_inputs_SHA_mtime_unchanged':True,'baseline_from_local_review':True,'sibling_source_repository_required':False,'Blender_browser_render_Git_network_used':False,'HIGH_source_gate_passed':gate is not None,'approved':False,'gameIntegrated':False}
 receipt.parent.mkdir(parents=True,exist_ok=True);receipt.open('x',encoding='utf-8').write(json.dumps(result,indent=2)+'\n');return result
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--review',type=pathlib.Path,default=pathlib.Path(__file__).resolve().parents[3]);p.add_argument('--chain',default='evidence/selected-alexia/rebuild-chain.json');p.add_argument('--baseline',default='evidence/selected-alexia/source/alexia-baseline.glb');p.add_argument('--out-dir',required=True,type=pathlib.Path);p.add_argument('--receipt',required=True,type=pathlib.Path);p.add_argument('--expected-candidate-sha256');p.add_argument('--expected-step-count',type=int);p.add_argument('--source-gate',action='store_true');a=p.parse_args();print(json.dumps(rebuild(a.review,a.review/a.chain,a.baseline,a.out_dir,a.receipt,a.expected_candidate_sha256,a.expected_step_count,a.source_gate),indent=2))

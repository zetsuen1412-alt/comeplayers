"""Rebuild only the selected polish delta from included frozen e88; no old9 replay.
Contract and receipt paths are explicit. Requires each actual recipe's dependencies.
"""
import sys
sys.dont_write_bytecode=True
import argparse,hashlib,json,pathlib,re,subprocess
BASE='e88b27e4a71058a4576fb4ab1b3d6d24a621d771175ce700a9a3e959729daf52'
def need(ok,msg):
 if not ok:raise ValueError(msg)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def safe(name):
 q=pathlib.PurePosixPath(name);need(isinstance(name,str)and name and not q.is_absolute()and not pathlib.PureWindowsPath(name).drive and '\\'not in name and all(x not in ('','.','..')for x in name.split('/')),'Unsafe relative contract path');return name
def snapshot(root):return {p.relative_to(root).as_posix():(sha(p),p.stat().st_mtime_ns)for p in root.rglob('*')if p.is_file()}
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--review',type=pathlib.Path,required=True);p.add_argument('--contract',type=pathlib.Path,required=True);p.add_argument('--out-dir',type=pathlib.Path,required=True);p.add_argument('--receipt',type=pathlib.Path,required=True);a=p.parse_args();root=a.review.resolve(strict=True);contract=a.contract.resolve(strict=True);out=a.out_dir.resolve();receipt=a.receipt.resolve();need(not out.exists()and not receipt.exists()and not out.is_relative_to(root)and not receipt.is_relative_to(root)and not receipt.is_relative_to(out),'Fresh external delta output and receipt required');d=json.loads(contract.read_bytes());need(d['schema']=='crwt.alexia_high_polish_selected_delta.v1'and d['source_sha256']==BASE and d['selected']is True,'Pinned selected e88-only delta contract required');source=root/safe(d['source_path']);need(sha(source)==BASE,'Frozen e88 baseline differs');need(len(d['steps'])>=1 and len({s['id']for s in d['steps']})==len(d['steps']),'Actual unique delta steps required');need(d['candidate_sha256']==sha(root/safe(d['candidate_path'])),'Selected candidate binding differs')
 for f in d['inputs']:need(sha(root/safe(f['path']))==f['sha256'],'Delta input pin differs: '+f['path'])
 for s in d['steps']:
  need(re.fullmatch('[a-z][a-z0-9-]{0,63}',s['id'])is not None,'Safe delta step id required')
  need(sha(root/safe(s['recipe_path']))==s['recipe_sha256'],'Selected recipe pin differs')
 before=snapshot(root);out.mkdir(parents=True);logs=out/'logs';logs.mkdir();results=[]
 for i,s in enumerate(d['steps']):
  need(sha(source)==s['source_sha256'],'Actual delta source chain differs: '+s['id']);stage=out/(str(i+1)+'-'+s['id']);args=[x.replace('{review}',str(root)).replace('{source}',str(source)).replace('{output_parent}',str(stage))for x in s['argv']];run=subprocess.run([sys.executable,'-B',str(root/safe(s['recipe_path'])),*args],capture_output=True);(logs/(str(i+1)+'.log')).open('xb').write(run.stdout+run.stderr);need(run.returncode==0,'Actual delta recipe failed: '+(run.stderr+run.stdout).decode('utf-8','replace')[-1200:]);model=stage/safe(s['model_output']);need(model.is_file()and sha(model)==s['candidate_sha256'],'Actual delta intermediate SHA differs: '+s['id']);source=model;results.append({'id':s['id'],'candidate_sha256':sha(model),'matched_selected_intermediate':True})
 need(sha(source)==d['candidate_sha256'],'Actual final delta differs');need(before==snapshot(root),'Review input SHA/mtime changed');r={'schema':'crwt.alexia_high_polish_delta_reproduction.v1','passed':True,'source_sha256':BASE,'candidate_sha256':sha(source),'actual_delta_steps':len(results),'old_nine_stage_chain_replayed':False,'steps':results,'all_original_review_SHA_mtime_unchanged':True,'new_Blender_or_browser_execution':False,'approved':False,'gameIntegrated':False};receipt.parent.mkdir(parents=True,exist_ok=True);receipt.open('x',encoding='utf-8').write(json.dumps(r,indent=2,allow_nan=False)+'\n');print(json.dumps(r,indent=2))
if __name__=='__main__':main()

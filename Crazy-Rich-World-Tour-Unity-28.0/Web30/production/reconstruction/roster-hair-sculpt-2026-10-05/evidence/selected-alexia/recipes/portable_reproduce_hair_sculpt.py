"""Reproduce the frozen hair sculpt from explicit files on another computer.

Keep this runner and its three pinned recipe helpers together. Inputs are read
only. --output-parent must be a fresh directory; no historical workspace path
is needed or read. Requires Python 3 and NumPy.
"""
import argparse,hashlib,importlib.util,json,pathlib,platform,sys

HERE=pathlib.Path(__file__).resolve().parent
RECIPE_FILES={
 'build_hair_sculpt.py':'75437b85e74d4452194cc508a9eda15abd4652109090653b0e25aa985cdcdb05',
 'build_hair_sculpt_smooth_normals.py':'9f25470b9f656ccf8878f2335d1c4ac58adf1e03b6094fff73ba1947e2b85282',
 'build_hair_sculpt_continuous.py':'045ecaa659106c42e3e87506e137c0d176ac4e7aab6a76f62160ac5a4f7d0080'
}
SOURCE_PIN='19f007950c8651e81ee2c49374f28af3785e3710171f142324bf67cb7ce74b24'
REFERENCE_PIN='935b1f8f7d2be4a6a453a089041844f2cd4470eb64be17d9d72568efb3708933'
OUTPUT_PINS={'mild':'91bc17229fd5937a17b964f0937d74862204577eb0891ed575c21861c6a0b2fd','moderate':'a605eedeaf86740d14f92d04553b25c016a1c0bf362a2265036fadb5aa60acd4'}
sha=lambda raw:hashlib.sha256(raw).hexdigest()
def require(condition,message):
 if not condition:raise ValueError(message)
def fingerprint(path):
 stat=path.stat();return {'sha256':sha(path.read_bytes()),'bytes':stat.st_size,'mtime_ns':stat.st_mtime_ns}

def main():
 ap=argparse.ArgumentParser(description=__doc__)
 ap.add_argument('--source',type=pathlib.Path,required=True,help='Pinned 19f baseline GLB')
 ap.add_argument('--reference',type=pathlib.Path,required=True,help='Unchanged Alexia six-view PNG')
 ap.add_argument('--output-parent',type=pathlib.Path,required=True,help='Fresh directory; must not already exist')
 ap.add_argument('--variant',choices=['mild','moderate'],required=True)
 args=ap.parse_args();source=args.source.expanduser().resolve(strict=True);reference=args.reference.expanduser().resolve(strict=True);outparent=args.output_parent.expanduser().resolve()
 require(source.is_file() and reference.is_file(),'Input files required')
 require(not outparent.exists(),'Output parent must be a fresh directory: '+str(outparent))
 source_before=fingerprint(source);reference_before=fingerprint(reference)
 require(source_before['sha256']==SOURCE_PIN,'Pinned baseline GLB does not match 19f source')
 require(reference_before['sha256']==REFERENCE_PIN,'Pinned unchanged reference PNG does not match')
 recipes=[]
 for name,pin in RECIPE_FILES.items():
  path=HERE/name;require(path.is_file() and sha(path.read_bytes())==pin,'Frozen recipe missing or changed: '+name);recipes.append({'filename':name,'sha256':pin})
 # Disable import bytecode output before loading read-only packaged recipes.
 sys.dont_write_bytecode=True
 spec=importlib.util.spec_from_file_location('portable_frozen_hair_sculpt',HERE/'build_hair_sculpt_continuous.py');recipe=importlib.util.module_from_spec(spec);spec.loader.exec_module(recipe)
 require(recipe.f.SOURCE_PIN==SOURCE_PIN and recipe.f.REF_PIN==REFERENCE_PIN,'Frozen recipe input pin contract')
 # Only in-memory locations are redirected. Frozen files are never edited.
 recipe.f.SOURCE=source;recipe.f.REF=reference;recipe.HERE=outparent
 outparent.mkdir(parents=True,exist_ok=False)
 saved_argv=sys.argv
 try:
  sys.argv=[str(HERE/'build_hair_sculpt_continuous.py'),'--variant',args.variant]
  recipe.main()
 finally:sys.argv=saved_argv
 candidate=outparent/(args.variant+'-continuous-smooth')/'alexia.glb';actual=sha(candidate.read_bytes())
 require(actual==OUTPUT_PINS[args.variant],'Reproduced GLB hash differs from frozen candidate; output retained for inspection')
 source_after=fingerprint(source);reference_after=fingerprint(reference)
 require(source_before==source_after and reference_before==reference_after,'Input file content or modification time changed')
 import numpy as np
 report={'schema':'crwt.alexia.portable_sculpt_reproduction.v1','passed':True,'variant':args.variant,'candidate_path':str(candidate),'candidate_sha256':actual,'expected_candidate_sha256':OUTPUT_PINS[args.variant],'candidate_hash_reproduced_exactly':True,'source_path':str(source),'source_fingerprint_before':source_before,'source_fingerprint_after':source_after,'reference_path':str(reference),'reference_fingerprint_before':reference_before,'reference_fingerprint_after':reference_after,'inputs_content_and_mtime_unchanged':True,'historical_workspace_glb_dependency':False,'recipe_location_override':'In-memory only: recipe.f.SOURCE, recipe.f.REF, recipe.HERE. Frozen recipe files retained exact bytes.','frozen_recipes':recipes,'runner_sha256':sha(pathlib.Path(__file__).read_bytes()),'python_version':platform.python_version(),'numpy_version':np.__version__,'output_parent':str(outparent)}
 proof=outparent/'portable-reproduction-proof.json';proof.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
 print(json.dumps({'portable_reproduction_passed':True,'candidate_path':str(candidate),'candidate_sha256':actual,'input_files_unchanged':True,'proof_path':str(proof)}))

if __name__=='__main__':main()

"""Append actual verified HIGH JSON to an external CI job summary.

Fails closed on missing/false checks, wrong selected source or omitted recipe
steps. This reports this job only; no repository-wide CI success is claimed.
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
from run_high_visual_source_checks import checked_result
def summary(source,receipt,output,head):
 source=source.resolve(strict=True);receipt=receipt.resolve(strict=True);output=output.resolve()
 need(not output.is_relative_to(source)and output!=receipt,'Summary must be external to frozen source and proof')
 need(re.fullmatch('[a-f0-9]{40}',head),'Explicit actual full CI checkout SHA required')
 _,ipin=source_pins(source);chain=json_read(source/'rebuild-chain.json');result=checked_result(json_read(receipt),chain['candidate_sha256'],chain['step_count'])
 need(result['source_inventory_sha256']==ipin['sha256'],'Actual CI proof source inventory differs')
 raw=receipt.read_text(encoding='utf-8');need(len(raw.encode('utf-8'))<500_000,'Actual proof too large for a job summary')
 text='## Verified HIGH source checks\n\nCheckout: `'+head+'`\n\nSelected Alexia: `'+chain['candidate_sha256']+'`\n\nThis job verified exact restoration, ten actual GLBs, existing native build/reopen evidence, the selected source gate and every pinned model recipe step. It did not execute Blender or claim repository-wide CI success.\n\n```json\n'+raw.rstrip()+'\n```\n'
 output.parent.mkdir(parents=True,exist_ok=True)
 with output.open('a',encoding='utf-8')as f:f.write(text)
 return {'passed':True,'actual_proof_sha256':hashes(receipt.read_bytes())['sha256'],'selected_candidate_sha256':chain['candidate_sha256'],'actual_recipe_step_count':chain['step_count'],'observed_checkout_sha':head,'global_repository_CI_success_claimed':False}
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__)
 for k in ('source','receipt','summary'):p.add_argument('--'+k,type=pathlib.Path,required=True)
 p.add_argument('--head-sha',required=True);a=p.parse_args();print(__import__('json').dumps(summary(a.source,a.receipt,a.summary,a.head_sha),indent=2))

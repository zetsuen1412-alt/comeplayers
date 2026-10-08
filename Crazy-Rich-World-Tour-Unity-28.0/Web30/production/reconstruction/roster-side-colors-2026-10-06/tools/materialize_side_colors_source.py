#!/usr/bin/env python3
"""Read exact HEAD blobs for the new side_colors prefix and frozen comparison inputs."""
import argparse, hashlib, json, os, pathlib, re, subprocess, sys
sys.dont_write_bytecode=True
from verify_side_colors_source import PREFIX, OLD_PREFIX, INVENTORY, PINS, EXCLUDED, IDS, VIEWS, BASELINE_MANIFEST_SHA, BASELINE_ALEXIA_SHA, inventory_document, pins_document, require, safe_relative, safe_path, sha

def git(repo,*args):
    return subprocess.run(['git','-C',str(repo),*args],check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE).stdout

def entries(repo,commit):
    result={}
    for raw in git(repo,'ls-tree','-r','-z','--full-tree',commit).split(b'\0'):
        if not raw:continue
        header,name=raw.split(b'\t',1);mode,kind,blob=header.decode('ascii').split();name=name.decode('utf-8')
        if name.startswith(PREFIX+'/') or name.startswith(OLD_PREFIX+'/'):
            safe_relative(name);require(kind=='blob' and mode in {'100644','100755'} and re.fullmatch('[0-9a-f]{40}',blob),'Unsupported scoped Git entry')
            require(name not in result,'Duplicate scoped Git path');result[name]={'mode':mode,'git_blob_sha1':blob}
    return result

def materialize(repo,output,commit,receipt=None):
    repo=repo.resolve(strict=True);output=output.resolve()
    require(re.fullmatch('[0-9a-f]{40}',commit) and git(repo,'rev-parse','HEAD').strip().decode()==commit,'Exact checkout HEAD mismatch')
    require(not output.exists() and output!=repo and not repo.is_relative_to(output) and not output.is_relative_to(repo/'.git') and not output.is_relative_to(repo/PREFIX) and not output.is_relative_to(repo/OLD_PREFIX),'Raw materialization output must be new outside frozen source prefixes/Git metadata')
    tree=entries(repo,commit); inventory_name=PREFIX+'/'+INVENTORY
    require(inventory_name in tree,'Source inventory absent from exact HEAD')
    inventory_raw=git(repo,'cat-file','blob',tree[inventory_name]['git_blob_sha1']);doc=inventory_document(inventory_raw)
    own_sha=hashlib.sha1(b'blob '+str(len(inventory_raw)).encode()+b'\0'+inventory_raw).hexdigest()
    require(own_sha==tree[inventory_name]['git_blob_sha1'],'Inventory raw Git blob mismatch')
    head_scope={name[len(PREFIX)+1:] for name in tree if name.startswith(PREFIX+'/')}
    require('evidence/github-publication-receipt.json' not in head_scope,'Local Git-publication receipt must not be tracked in its own source snapshot')
    require('BUKA-REVIEW-MODEL.html' not in head_scope and 'OFFLINE-GALLERY.zip' not in head_scope and {'OFFLINE-GALLERY.zip.part-01','OFFLINE-GALLERY.zip.part-02'}<=head_scope,'Exact HEAD must use two pinned ZIP parts, without derived HTML or full ZIP')
    require(head_scope=={r['path'] for r in doc['files']}|{INVENTORY},'New HEAD prefix file set differs from source inventory')
    selected={}
    for row in doc['files']:
        name=PREFIX+'/'+row['path'];require(name in tree and all(tree[name][k]==row[k] for k in ['git_blob_sha1','mode']),'HEAD new file identity/mode mismatch: '+name)
        selected[name]=dict(row,path=name)
    selected[inventory_name]={'path':inventory_name,'bytes':len(inventory_raw),'sha256':sha(inventory_raw),**tree[inventory_name]}
    pins_name=PREFIX+'/'+PINS
    pins_record=next(r for r in doc['files'] if r['path']==PINS)
    pins_raw=git(repo,'cat-file','blob',tree[pins_name]['git_blob_sha1'])
    require(sha(pins_raw)==pins_record['sha256'],'Raw source-pins SHA mismatch')
    pins_document(pins_raw)
    baseline_names=[OLD_PREFIX+'/review-manifest.json',OLD_PREFIX+'/viewer/models/alexia.glb']
    baseline_names.extend(OLD_PREFIX+f'/renders/{id}/{name}' for id in sorted(IDS-{'alexia'}) for name in ['render-evidence.json',*[view+'.png' for view in VIEWS]])
    for name in baseline_names:
        require(name in tree,'Frozen baseline comparison input absent: '+name)
        size=int(git(repo,'cat-file','-s',tree[name]['git_blob_sha1']).strip())
        selected[name]={'path':name,'bytes':size,**tree[name]}
        if name.endswith('/review-manifest.json'):selected[name]['sha256']=BASELINE_MANIFEST_SHA
        if name.endswith('/viewer/models/alexia.glb'):selected[name]['sha256']=BASELINE_ALEXIA_SHA
    if receipt:
        receipt=receipt.resolve();require(not receipt.exists() and not receipt.is_relative_to(output) and not receipt.is_relative_to(repo/PREFIX) and not receipt.is_relative_to(repo/OLD_PREFIX),'Materialization receipt must be new outside source prefixes/raw output')
    output.mkdir(parents=True,exist_ok=False)
    process=subprocess.Popen(['git','-C',str(repo),'cat-file','--batch'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    written=byte_count=0
    try:
        for name,row in sorted(selected.items()):
            expected=row['git_blob_sha1'];process.stdin.write((expected+'\n').encode());process.stdin.flush()
            header=process.stdout.readline().decode('ascii').strip().split()
            require(len(header)==3 and header[:2]==[expected,'blob'] and header[2].isdigit() and int(header[2])==row['bytes'],'Raw Git blob header/size mismatch')
            size=row['bytes'];h1=hashlib.sha1(b'blob '+str(size).encode()+b'\0');h256=hashlib.sha256()
            path=safe_path(output,name);path.parent.mkdir(parents=True,exist_ok=True);remaining=size
            with path.open('xb') as f:
                while remaining:
                    block=process.stdout.read(min(1024*1024,remaining));require(block,'Truncated Git blob');f.write(block);h1.update(block);h256.update(block);remaining-=len(block)
            require(process.stdout.read(1)==b'\n' and h1.hexdigest()==expected,'Raw Git blob delimiter/SHA1 mismatch')
            require(not row.get('sha256') or h256.hexdigest()==row['sha256'],'Raw Git source SHA256 mismatch: '+name)
            os.chmod(path,0o755 if row['mode']=='100755' else 0o644);written+=1;byte_count+=size
        process.stdin.close();require(process.wait(timeout=30)==0,'Git batch reader failed')
    finally:
        if process.poll() is None:process.terminate();process.wait(timeout=30)
        if not process.stdin.closed:process.stdin.close()
        process.stdout.close();process.stderr.close()
    require((output/inventory_name).read_bytes()==inventory_raw and git(repo,'rev-parse','HEAD').strip().decode()==commit,'Inventory/HEAD changed during materialization')
    report={'schema':'crwt.alexia_side_colors_raw_git_materialization.v1','passed':True,'head_sha':commit,'new_prefix':PREFIX,
            'inventory_git_blob_sha1':own_sha,'inventory_sha256':sha(inventory_raw),'new_source_files':len(doc['files'])+1,
            'baseline_comparison_files':len(baseline_names),'files_written':written,'bytes_written':byte_count,
            'HEAD_new_prefix_paths_modes_blobs_checked':True,'raw_Git_blobs_used_without_EOL_filters':True,
            'no_checkout_or_Git_mutation':True,'no_network_or_generation':True,'approved':False,'gameIntegrated':False,
            'html_storage':'zip-parts','scope':'New prefix +56 existing pinned baseline comparison files; complete previous repository preservation is parent-publication scope.'}
    if receipt:
        receipt.parent.mkdir(parents=True,exist_ok=True)
        with receipt.open('x',encoding='utf-8',newline='\n') as f:f.write(json.dumps(report,indent=2)+'\n')
    return report

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--repo-root',type=pathlib.Path,required=True);p.add_argument('--out-dir',type=pathlib.Path,required=True);p.add_argument('--expected-commit',required=True);p.add_argument('--receipt',type=pathlib.Path)
    a=p.parse_args();print(json.dumps(materialize(a.repo_root,a.out_dir,a.expected_commit,a.receipt),indent=2))
if __name__=='__main__':main()

"""Verify a fresh HIGH local checkpoint; standard Python, no Git/CI claim.

python verify_actual_checkpoint.py .
python verify_actual_checkpoint.py . --source-gate
A ZIP path checks its SHA sidecar (when present), every CRC/SHA and ten real GLBs.
Optional --source-gate needs NumPy and runs the delivered HIGH gate in external
scratch; it never writes into the review. --proof-dir keeps actual gate proof.
"""
import sys
sys.dont_write_bytecode=True
import argparse,hashlib,importlib.util,json,pathlib,re,stat,subprocess,tempfile,zipfile
NAME='checkpoint-files.json'
SCHEMA='crwt.alexia_high_polish_local_checkpoint.v1'

def require(ok,message):
    if not ok:raise ValueError(message)

def safe(name):
    require(isinstance(name,str) and name and not any(ord(c)<32 or c in '\\:<>"|?*' for c in name),'Invalid Windows relative path')
    p=pathlib.PurePosixPath(name)
    require(not p.is_absolute() and all(x not in {'','.','..'} for x in name.split('/')),'Unsafe relative path')
    reserved={'con','prn','aux','nul',*[f'com{i}' for i in range(1,10)],*[f'lpt{i}' for i in range(1,10)]}
    require(all(not x.endswith((' ','.')) and x.split('.')[0].casefold() not in reserved for x in p.parts),'Reserved Windows path')
    return name.casefold()

def digest(stream):
    n=0;h=hashlib.sha256()
    while block:=stream.read(1048576):n+=len(block);h.update(block)
    return n,h.hexdigest()

def filehash(path):
    with pathlib.Path(path).open('rb') as f:return digest(f)

def inventory(root):
    root=pathlib.Path(root).resolve(strict=True);rows={};folded=set()
    for p in root.rglob('*'):
        require(not p.is_symlink() and not getattr(p,'is_junction',lambda:False)(),'Payload links are not permitted')
        if not p.is_file():continue
        name=p.relative_to(root).as_posix();key=safe(name)
        require(key not in folded and '__pycache__' not in p.parts and not any(x in {'.git','node_modules'} for x in p.parts),'Duplicate/cache/repository payload')
        folded.add(key);rows[name]=(*filehash(p),p.stat().st_mtime_ns)
    return rows

def parse_inventory(raw):
    d=json.loads(raw);require(d.get('schema')==SCHEMA and d.get('git_published') is False and d.get('approved') is False and d.get('gameIntegrated') is False,'Fresh local HIGH checkpoint schema/flags')
    rows=d['files'];require(isinstance(rows,list) and rows,'Empty payload inventory');seen=set();result={}
    for r in rows:
        key=safe(r['path']);require(key not in seen and r['path']!=NAME,'Duplicate or recursive inventory');seen.add(key)
        require(type(r['bytes']) is int and r['bytes']>=0 and re.fullmatch('[0-9a-f]{64}',r['sha256']),'Invalid file pin');result[r['path']]=r
    require(all(not any('/'.join(n.split('/')[:i]).casefold() in seen for i in range(1,len(n.split('/')))) for n in result),'File/directory path collision')
    return d,result

def load_validator():
    root=pathlib.Path(__file__).resolve().parent
    helper=root/'tools/validate_roster_candidate.py'
    if not helper.is_file():helper=root/'validate_roster_candidate.py'
    require(helper.is_file(),'Delivered standard-library GLB validator is missing')
    spec=importlib.util.spec_from_file_location('high_actual_roster_validator',helper);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

def actual_assets(read):
    validator=load_validator();review=json.loads(read('review-manifest.json'))
    require(review.get('schema')=='crwt.alexia_high_polish_review.v1' and review.get('approved') is False and review.get('gameIntegrated') is False,'Fresh HIGH review manifest required')
    entries=review['models'];require(len(entries)==10 and {r['id'] for r in entries}==validator.IDS,'Ten actual roster entries required')
    records=[]
    for row in entries:
        safe(row['path']);raw=read(row['path']);require(hashlib.sha256(raw).hexdigest()==row['sha256'],'Model SHA differs: '+row['id'])
        actual=validator.validate_model(raw)
        for k,v in row.get('expected',{}).items():require(actual.get(k)==v,'Actual model count differs: '+row['id']+'/'+k)
        records.append({'id':row['id'],'sha256':row['sha256'],'actual':actual})
    alexia=next(r for r in records if r['id']=='alexia');actual=alexia['actual']
    require(actual['skins']==2 and actual['clips']==2 and actual['clip_names']==['IdleBreath','Walk'] and actual['meshes']>0,'Actual Alexia active meshes/two skins/two original clips required')
    model=next(r for r in entries if r['id']=='alexia');doc,_=validator.parse_glb(read(model['path']))
    require(all(len(s['joints'])==19 for s in doc['skins']) and len({i for s in doc['skins'] for i in s['joints']})==19,'Actual nineteen-bone bindings required')
    native=json.loads(read('evidence/native-review.json'));build=json.loads(read('editable/Alexia-high-polish-review.workspace-proof.json'));reopen=json.loads(read('evidence/native-reopen.json'))
    editable_raw=read('alexia-editable-manifest.json');editable=json.loads(editable_raw)['models'];require(len(editable)==1 and editable[0]['id']=='alexia' and editable[0]['path']=='viewer/models/alexia.glb' and editable[0]['sha256']==alexia['sha256'],'Portable native manifest selected source differs')
    editable_sha=hashlib.sha256(editable_raw).hexdigest();require(build['manifest_sha256']==reopen['manifest_sha256']==editable_sha,'Actual native manifest SHA differs')
    require(reopen['native_armature_count']==1 and reopen['native_action_count']==2 and reopen['native_active_mesh_count']==actual['meshes'] and reopen['source_skin_count']==2 and reopen['source_joint_count_per_skin']==[19,19] and [r['bone_count'] for r in reopen['native_fingerprints']['armatures'].values()]==[19],'Actual native bones/actions/skin counts differ')
    require(native.get('passed') is True and native['candidate_sha256']==alexia['sha256'] and native['native_active_mesh_count']==actual['meshes'] and native['native_armatures']==1 and native['native_bones']==19 and native['native_actions']==2,'Actual final native summary required')
    blob=read('editable/Alexia-high-polish-review.blend');require(hashlib.sha256(blob).hexdigest()==native['blend_sha256']==build['output_blend_sha256']==reopen['blend_sha256'],'Actual native bytes differ')
    require(hashlib.sha256(read('editable/Alexia-high-polish-review.workspace-proof.json')).hexdigest()==native['build_proof_sha256']==reopen['build_proof_sha256'] and hashlib.sha256(read('evidence/native-reopen.json')).hexdigest()==native['reopen_proof_sha256'],'Actual native proof bindings differ')
    require(build.get('passed') is True and reopen.get('passed') is True and reopen.get('read_only') is True and reopen['candidate_sha256']==build['candidate_sha256']==alexia['sha256'],'Actual native build/reopen required')
    for r in (build,reopen):
        visibility=r['source_default_scene_visibility'];require(len(visibility['active_source_mesh_objects'])==actual['meshes'] and visibility['inactive_mesh_data_preserved'] is True and visibility['inactive_meshes_hidden_from_viewport_and_render'] is True,'Actual native active scene/orphan preservation differs')
    for proof,field,name in [(build,'build_helper_sha256','build_animated_alexia_native.py'),(reopen,'reopen_helper_sha256','reopen_animated_alexia_native_v2.py'),(build,'fingerprint_helper_sha256','animated_native_fingerprints.py'),(reopen,'fingerprint_helper_sha256','animated_native_fingerprints.py')]:require(hashlib.sha256(read('tools/'+name)).hexdigest()==proof[field],'Actual native helper pin differs: '+name)
    return {'models_checked':10,'models':records,'candidate_sha256':alexia['sha256'],'actual_alexia_clip_names':actual['clip_names'],'actual_active_meshes':actual['meshes'],'native_retained_mesh_data':native['native_mesh_count'],'native_actions':2,'native_bones':19,'native_build_and_readonly_reopen_bindings_valid':True}

def image_magic(name,raw):
    if name.lower().endswith('.png'):require(raw.startswith(b'\x89PNG\r\n\x1a\n'),'PNG magic/extension differs: '+name)
    if name.lower().endswith(('.jpg','.jpeg')):require(raw.startswith(b'\xff\xd8\xff'),'JPEG magic/extension differs: '+name)

def verify(path,expected_sha256=None):
    path=pathlib.Path(path).resolve(strict=True)
    if path.is_file():
        require(path.suffix.lower()=='.zip','ZIP or extracted review folder required');before=(*filehash(path),path.stat().st_mtime_ns)
        if expected_sha256 is not None:require(re.fullmatch('[0-9a-f]{64}',expected_sha256) and before[1]==expected_sha256,'ZIP SHA differs')
        sidecar=pathlib.Path(str(path)+'.sha256')
        if sidecar.exists():
            parts=sidecar.read_text(encoding='utf-8').strip().split('  ');require(parts==[before[1],path.name],'ZIP SHA sidecar differs')
        with zipfile.ZipFile(path) as z:
            entries=z.infolist();seen=set()
            for e in entries:
                key=safe(e.filename);require(key not in seen and not e.is_dir() and stat.S_IFMT(e.external_attr>>16) in {0,stat.S_IFREG},'ZIP duplicate/directory/link entry');seen.add(key)
            header,rows=parse_inventory(z.read(NAME));require(set(z.namelist())==set(rows)|{NAME},'ZIP payload inventory differs')
            for name,r in rows.items():
                with z.open(name) as f:require(digest(f)==(r['bytes'],r['sha256']),'ZIP CRC/SHA differs: '+name)
                if name.lower().endswith(('.png','.jpg','.jpeg')):image_magic(name,z.read(name)[:8])
            assets=actual_assets(z.read)
        require(before==(*filehash(path),path.stat().st_mtime_ns),'ZIP changed during verification');archive_sha=before[1]
    else:
        before=inventory(path);header,rows=parse_inventory((path/NAME).read_bytes());require(set(before)==set(rows)|{NAME},'Extracted payload inventory differs')
        for name,r in rows.items():
            require(before[name][:2]==(r['bytes'],r['sha256']),'Extracted SHA differs: '+name)
            if name.lower().endswith(('.png','.jpg','.jpeg')):
                with (path/name).open('rb') as f:image_magic(name,f.read(8))
        assets=actual_assets(lambda name:(path/name).read_bytes());require(before==inventory(path),'Payload hash/mtime changed during verification');archive_sha=None
    require(header['candidate_sha256']==assets['candidate_sha256'],'Checkpoint selected actor differs')
    return {'schema':'crwt.alexia_high_polish_actual_checkpoint_verification.v1','passed':True,'valid':True,'files_checked':len(rows),'CRC_and_all_payload_SHA256':'passed','zip_sha256':archive_sha,'inputs_hash_mtime_unchanged':True,'local_review_only':True,'git_published':False,'approved':False,'gameIntegrated':False,**assets}

def source_gate(root,proof_dir):
    root=pathlib.Path(root).resolve(strict=True);before=inventory(root);proof_dir=pathlib.Path(proof_dir).resolve()
    require(not proof_dir.exists() and not proof_dir.is_relative_to(root),'Fresh external source-gate proof directory required');proof_dir.mkdir(parents=True)
    plan_path=root/'evidence/source-gate-replay.json'
    if plan_path.is_file():
        plan=json.loads(plan_path.read_bytes());tool=plan['tool_path'];safe(tool);require(filehash(root/tool)[1]==plan['tool_sha256'],'HIGH source-gate helper pin differs');argv=plan['argv'];require(sum('{receipt}' in x for x in argv)==1,'One fresh gate receipt argument required')
        for x in argv:
            if '{root}' in x:
                relative=x.split('{root}',1)[1];require(relative.startswith('/'),'Packaged source path required');safe(relative[1:]);require((root/relative[1:]).is_file(),'Packaged HIGH gate input is missing')
    else:
        raise ValueError('Selected polish delta source-gate descriptor is required; old HIGH gate is not reused')
    out=proof_dir/'polish-source-gate.json';args=[x.replace('{root}',str(root)).replace('{receipt}',str(out)) for x in argv]
    run=subprocess.run([sys.executable,'-B',str(root/tool),*args],capture_output=True)
    (proof_dir/'polish-source-gate.log').open('xb').write(run.stdout+run.stderr)
    require(run.returncode==0 and out.is_file(),'Actual HIGH source gate failed: '+(run.stderr+run.stdout).decode('utf-8','replace')[-1800:])
    proof=json.loads(out.read_bytes());candidate=filehash(root/'viewer/models/alexia.glb')[1]
    require(proof.get('passed') is True and proof['candidate_sha256']==candidate,'Actual HIGH gate selected actor differs');require(before==inventory(root),'HIGH source gate changed delivered payload')
    return {'passed':True,'proof_sha256':filehash(out)[1],'candidate_sha256':candidate,'all_inputs_hash_mtime_unchanged':True}

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('path',nargs='?',type=pathlib.Path,default=pathlib.Path(__file__).resolve().parent);p.add_argument('--sha256');p.add_argument('--source-gate',action='store_true');p.add_argument('--proof-dir',type=pathlib.Path);a=p.parse_args();result=verify(a.path,a.sha256)
    if a.source_gate:
        require(a.path.is_dir(),'Extract the ZIP before optional HIGH NumPy source verification')
        if a.proof_dir:result['POLISH_source_gate']=source_gate(a.path,a.proof_dir)
        else:
            with tempfile.TemporaryDirectory(prefix='crwt-high-source-') as d:result['POLISH_source_gate']=source_gate(a.path,pathlib.Path(d)/'proof')
    print(json.dumps(result,ensure_ascii=True))
if __name__=='__main__':main()

"""Verify profile-pass extracted payload, ZIP CRC/file SHA, and optional fresh Git receipt."""
import argparse,hashlib,json,pathlib,re,stat,zipfile
MANIFEST='checkpoint-manifest.json'
def require(ok,message):
    if not ok:raise ValueError(message)
def safe_name(name):
    require(isinstance(name,str) and name and not any(ord(c)<32 for c in name),'Invalid member name')
    p=pathlib.PurePosixPath(name);require(not p.is_absolute() and '\\' not in name and ':' not in name and not any(v in {'','..','.'} for v in name.split('/')),'Unsafe archive path')
    require(all(not part.endswith((' ','.')) and part.split('.')[0].casefold() not in {'con','prn','aux','nul',*[f'com{i}' for i in range(1,10)],*[f'lpt{i}' for i in range(1,10)]} for part in p.parts),'Windows path collision')
    return name.casefold()
def digest(stream):
    h=hashlib.sha256();size=0
    while block:=stream.read(1024*1024):h.update(block);size+=len(block)
    return size,h.hexdigest()
def filehash(path):
    with path.open('rb') as f:return digest(f)
def document(raw):
    d=json.loads(raw);require(d.get('schema')=='crwt.alexia-profile-checkpoint.v1' and d.get('approved') is False and d.get('gameIntegrated') is False and type(d.get('git_published')) is bool,'Checkpoint flags/schema mismatch')
    rows=d.get('files');require(isinstance(rows,list) and rows,'Empty checkpoint inventory');seen=set();names=set()
    for row in rows:
        name=row['path'];normal=safe_name(name);require(name!=MANIFEST and normal not in seen,'Duplicate/self member');seen.add(normal);names.add(name)
        require(type(row['bytes']) is int and row['bytes']>=0 and re.fullmatch('[0-9a-f]{64}',row['sha256']),'Bad hash/size record')
    for name in names:
        parts=name.split('/')
        require(not any('/'.join(parts[:i]).casefold() in seen for i in range(1,len(parts))),'File/directory hierarchy collision')
    if d['git_published']:
        ref=d.get('git_snapshot_reference');require(isinstance(ref,dict) and ref.get('receipt_path')=='evidence/github-publication-receipt.json','Verified Git reference missing')
        require(any(row['path']==ref['receipt_path'] and row['sha256']==ref.get('receipt_sha256') for row in rows),'Publication receipt not pinned in archive inventory')
    return d
def publication_reference(receipt_raw,review_raw):
    p=json.loads(receipt_raw);review=json.loads(review_raw)
    require(p.get('snapshot_verified') is True and p.get('model_count')==10 and p.get('approved') is False and p.get('gameIntegrated') is False,'Publication snapshot must be verified for ten candidates')
    commit=p.get('commit');branch=p.get('snapshot_branch');require(isinstance(commit,str) and re.fullmatch('[0-9a-f]{40}',commit),'Publication full commit SHA required')
    require(isinstance(branch,str) and branch.startswith('checkpoint/') and re.fullmatch('[A-Za-z0-9._/-]+',branch) and '..' not in branch and '//' not in branch and not branch.endswith('/'),'Invalid snapshot branch')
    expected=hashlib.sha256(review_raw).hexdigest();hashes=[p[k] for k in ['manifest_sha256','review_manifest_sha256'] if k in p];require(hashes and all(h==expected for h in hashes),'Publication manifest hash mismatch')
    actual={r['id']:r['sha256'] for r in review['models']};published=p.get('models');require(len(actual)==10 and isinstance(published,list) and len(published)==10 and all(isinstance(r,dict) for r in published),'Publication model rows required')
    require({r.get('id'):r.get('sha256') for r in published}==actual and len({r.get('id') for r in published})==10,'Published selected model SHA mismatch')
    changed={r['id']:r['sha256'] for r in review['models'] if r.get('refined_in_this_checkpoint') is True};require(set(changed)=={'alexia'} and p.get('changed_model_sha256')==changed,'Publication must pin the exact selected Alexia SHA')
    return {'repository':p.get('repository','https://github.com/zetsuen1412-alt/comeplayers.git'),'commit':commit,'snapshot_branch':branch,'receipt_path':'evidence/github-publication-receipt.json','receipt_sha256':hashlib.sha256(receipt_raw).hexdigest(),'review_manifest_sha256':expected,'snapshot_verified':True}
def verify_zip(path):
    with zipfile.ZipFile(path) as z:
        entries=z.infolist();seen=set()
        for e in entries:
            n=safe_name(e.filename);require(n not in seen and not e.is_dir() and stat.S_IFMT(e.external_attr>>16) in {0,stat.S_IFREG},'Unsafe duplicate/link member');seen.add(n)
        require(MANIFEST in z.namelist(),'Manifest missing');d=document(z.read(MANIFEST));rows={r['path']:r for r in d['files']};require(set(z.namelist())==set(rows)|{MANIFEST},'ZIP file inventory mismatch')
        for name,row in rows.items():
            with z.open(name) as f:actual=digest(f)
            require(actual==(row['bytes'],row['sha256']),'CRC/SHA/size mismatch: '+name)
        if d['git_published']:require(publication_reference(z.read('evidence/github-publication-receipt.json'),z.read('review-manifest.json'))==d['git_snapshot_reference'],'Git snapshot reference does not match payload')
    return {'valid':True,'files_checked':len(rows),'crc_and_all_file_sha256':'passed','scope':'model review payload; full game source remains on recorded Git branch when verified','approved':False,'gameIntegrated':False,'git_published':d['git_published']}
def verify_folder(folder):
    folder=folder.resolve(strict=True);d=document((folder/MANIFEST).read_bytes());rows={r['path']:r for r in d['files']};names=set()
    for p in folder.rglob('*'):
        require(not p.is_symlink() and not getattr(p,'is_junction',lambda:False)(),'Link in extraction')
        if p.is_file() and '__pycache__' not in p.parts:names.add(p.relative_to(folder).as_posix())
    require(names==set(rows)|{MANIFEST},'Extracted file inventory mismatch')
    for name,row in rows.items():
        path=folder/name;require(path.resolve().is_relative_to(folder),'Escaped extraction');require(filehash(path)==(row['bytes'],row['sha256']),'SHA/size mismatch: '+name)
    if d['git_published']:require(publication_reference((folder/'evidence/github-publication-receipt.json').read_bytes(),(folder/'review-manifest.json').read_bytes())==d['git_snapshot_reference'],'Git snapshot reference does not match payload')
    return {'valid':True,'files_checked':len(rows),'all_file_sha256':'passed','scope':'model review payload; full game source remains on recorded Git branch when verified','approved':False,'gameIntegrated':False,'git_published':d['git_published']}
def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('path',nargs='?',type=pathlib.Path,default=pathlib.Path(__file__).resolve().parent);a=p.parse_args();print(json.dumps(verify_zip(a.path) if a.path.suffix.lower()=='.zip' else verify_folder(a.path)))
if __name__=='__main__':main()

"""Verify the Oct8 local review payload. No new Git or CI claim is inferred."""
import argparse,hashlib,json,pathlib,stat,zipfile
NAME='checkpoint-files.json'
def require(ok,message):
    if not ok:raise ValueError(message)
def safe(name):
    require(isinstance(name,str) and name and not any(ord(c)<32 for c in name),'Invalid member name')
    p=pathlib.PurePosixPath(name);require(not p.is_absolute() and '\\' not in name and ':' not in name and all(x not in {'','.','..'} for x in name.split('/')),'Unsafe member path')
    require(all(not x.endswith((' ','.')) and x.split('.')[0].casefold() not in {'con','prn','aux','nul',*[f'com{i}' for i in range(1,10)],*[f'lpt{i}' for i in range(1,10)]} for x in p.parts),'Unsafe Windows member path');return name.casefold()
def digest(stream):
    h=hashlib.sha256();n=0
    while block:=stream.read(1048576):h.update(block);n+=len(block)
    return n,h.hexdigest()
def filehash(path):
    with pathlib.Path(path).open('rb') as f:return digest(f)
def manifest(raw):
    d=json.loads(raw);require(d.get('schema')=='crwt.alexia_side_quality_local_checkpoint.v1' and d.get('git_published') is False and d.get('approved') is False and d.get('gameIntegrated') is False,'Local checkpoint schema/flags')
    rows=d['files'];require(isinstance(rows,list) and rows,'Empty payload');seen=set()
    for r in rows:
        n=safe(r['path']);require(n not in seen and r['path']!=NAME,'Duplicate/self payload');seen.add(n)
        require(type(r['bytes']) is int and r['bytes']>=0 and isinstance(r['sha256'],str) and len(r['sha256'])==64 and all(c in '0123456789abcdef' for c in r['sha256']),'Invalid payload pin')
    require(all(not any('/'.join(r['path'].split('/')[:i]).casefold() in seen for i in range(1,len(r['path'].split('/')))) for r in rows),'File/directory collision')
    return {r['path']:r for r in rows}
def verify(path):
    path=pathlib.Path(path)
    if path.suffix.lower()=='.zip':
        with zipfile.ZipFile(path) as z:
            entries=z.infolist();seen=set()
            for e in entries:
                n=safe(e.filename);require(n not in seen and not e.is_dir() and stat.S_IFMT(e.external_attr>>16) in {0,stat.S_IFREG},'ZIP duplicate/link member');seen.add(n)
            rows=manifest(z.read(NAME));require(set(z.namelist())==set(rows)|{NAME},'ZIP inventory differs')
            for name,r in rows.items():
                with z.open(name) as f:require(digest(f)==(r['bytes'],r['sha256']),'CRC/SHA differs: '+name)
    else:
        path=path.resolve(strict=True);rows=manifest((path/NAME).read_bytes());files=set()
        for p in path.rglob('*'):
            require(not p.is_symlink() and not getattr(p,'is_junction',lambda:False)(),'Link in extracted payload')
            if p.is_file():files.add(p.relative_to(path).as_posix())
        require(files==set(rows)|{NAME},'Extracted inventory differs')
        for name,r in rows.items():require(filehash(path/name)==(r['bytes'],r['sha256']),'Extracted SHA differs: '+name)
    return {'valid':True,'files_checked':len(rows),'all_file_sha256':'passed','local_review_only':True,'git_published':False,'approved':False,'gameIntegrated':False}
if __name__=='__main__':
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('path',nargs='?',type=pathlib.Path,default=pathlib.Path(__file__).resolve().parent);a=ap.parse_args();print(json.dumps(verify(a.path)))

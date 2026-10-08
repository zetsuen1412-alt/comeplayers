"""Fresh texture-motion ZIP; only a matching verified publication receipt permits git_published:true."""
import argparse,hashlib,json,pathlib,re,stat,zipfile
from verify_texture_motion_checkpoint import MANIFEST,digest,filehash,safe_name,verify_zip,publication_reference
IDS={'alexia','rindi','kairo','luna','nox','atlas','zeno','yuna','mochi','pip'}
HERE=pathlib.Path(__file__).resolve().parent
def require(ok,message):
    if not ok:raise ValueError(message)
def inventory(source):
    files={};folded=set()
    for path in source.rglob('*'):
        require(not path.is_symlink() and not getattr(path,'is_junction',lambda:False)(),'Source link forbidden')
        if not path.is_file() or '__pycache__' in path.parts:continue
        name=path.relative_to(source).as_posix();normal=safe_name(name);require(normal not in folded,'Source path collision');folded.add(normal)
        require(not any(part in {'.git','node_modules'} for part in path.parts),'Unexpected repository/dependency tree')
        require(not path.name.casefold().startswith('.env') and path.suffix.casefold() not in {'.pem','.key','.pfx','.p12'} and path.name.casefold() not in {'credentials.json','tokens.json','token.json','secrets.json','id_rsa','id_ed25519'},'Credential-like source file')
        files[name]=path
    return files
def build(source,target,require_native=False):
    source=source.resolve(strict=True);target=target.resolve();companions=[target,pathlib.Path(str(target)+'.sha256'),pathlib.Path(str(target)+'.manifest.json')]
    require(not target.is_relative_to(source) and target.suffix.lower()=='.zip' and not any(p.exists() for p in companions),'Fresh ZIP outside source required')
    files=inventory(source);require(not {MANIFEST,'verify_texture_motion_checkpoint.py'} & {name.casefold() for name in files},'Generated package file collision')
    d=json.loads((source/'review-manifest.json').read_bytes());require(d.get('approved') is False and d.get('gameIntegrated') is False and d.get('schema')=='crwt.alexia_texture_motion_review.v1' and d.get('changed_models')==1 and set(d.get('unchanged_models',[]))==IDS-{'alexia'},'Selected review metadata mismatch')
    require(len(d['models'])==10 and {r['id'] for r in d['models']}==IDS,'All ten models required')
    require('BUKA-REVIEW-MODEL.html' in files and 'BUKA-REVIEW-MODEL.viewer-receipt.json' in files and 'MULAI-DI-SINI.txt' in files,'Missing entry/receipt/guide')
    receipt=json.loads(files['BUKA-REVIEW-MODEL.viewer-receipt.json'].read_bytes());require(filehash(files['BUKA-REVIEW-MODEL.html'])[1]==receipt['viewer_sha256'] and filehash(files['review-manifest.json'])[1]==receipt['manifest_sha256'],'Stale standalone HTML receipt')
    git_reference=None;publication_path='evidence/github-publication-receipt.json'
    if publication_path in files:
        publication_raw=files[publication_path].read_bytes();publication=json.loads(publication_raw)
        if publication.get('snapshot_verified') is True:git_reference=publication_reference(publication_raw,files['review-manifest.json'].read_bytes())
    for r in d['models']:
        for k,h in [('path','sha256'),('reference','referenceSha256')]:safe_name(r[k]);require(r[k] in files and filehash(files[r[k]])[1]==r[h],'Model/reference mismatch')
        require('renders/'+r['id']+'/front.png' in files,'Actual front missing')
    if require_native:
        proofname='evidence/selected-alexia-native-certificate.json';blendname='editable/Alexia-texture-motion-review.blend';require(proofname in files and blendname in files,'Selected single Alexia native required')
        proof=json.loads(files[proofname].read_bytes());require(proof.get('schema')=='crwt.selected_alexia_native.v1' and proof.get('passed') is True and proof.get('all_file_images_packed') is True and proof.get('read_only_reopen') is True and proof.get('native_color_attributes_preserved') is True and proof.get('approved') is False and proof.get('gameIntegrated') is False and filehash(files[blendname])[1]==proof['blend_sha256'] and proof['candidate_sha256']==next(r['sha256'] for r in d['models'] if r['id']=='alexia'),'Native workspace proof mismatch')
    # Nested native ZIPs also require safe member names and a complete CRC read.
    nested=[]
    for name,path in files.items():
        if path.suffix.lower()!='.zip':continue
        members=[];seen=set()
        with zipfile.ZipFile(path) as z:
            for info in z.infolist():
                normal=safe_name(info.filename);require(normal not in seen and not info.is_dir() and stat.S_IFMT(info.external_attr>>16) in {0,stat.S_IFREG},'Unsafe nested archive');seen.add(normal)
                with z.open(info) as f:size,h=digest(f)
                members.append({'path':info.filename,'bytes':size,'sha256':h})
        nested.append({'path':name,'members':members})
    rows=[{'path':n,'bytes':filehash(p)[0],'sha256':filehash(p)[1]} for n,p in sorted(files.items())]
    verifier=(HERE/'verify_texture_motion_checkpoint.py').read_bytes();rows.append({'path':'verify_texture_motion_checkpoint.py','bytes':len(verifier),'sha256':hashlib.sha256(verifier).hexdigest()})
    manifest={'schema':'crwt.alexia-texture-motion-checkpoint.v1','files':sorted(rows,key=lambda r:r['path']),'nested_archives':nested,'scope':'Ten model candidates and references, selected Alexia five-view renders, explicitly reused nine-character renders, gallery and one editable Alexia native. The previous full-roster native checkpoint remains separate; full game source and Git history are not claimed inside this ZIP.','approved':False,'gameIntegrated':False,'git_published':git_reference is not None,'single_alexia_native_required':require_native,'manifest_self_hash_excluded':True}
    if git_reference:manifest['git_snapshot_reference']=git_reference
    target.parent.mkdir(parents=True,exist_ok=True)
    with target.open('xb') as stream,zipfile.ZipFile(stream,'w',zipfile.ZIP_DEFLATED,compresslevel=6,allowZip64=True) as z:
        for row in rows:
            if row['path']=='verify_texture_motion_checkpoint.py':raw=verifier
            else:raw=files[row['path']].read_bytes()
            require((len(raw),hashlib.sha256(raw).hexdigest())==(row['bytes'],row['sha256']),'Input changed during ZIP')
            info=zipfile.ZipInfo(row['path'],date_time=(2026,10,6,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.create_system=3;info.external_attr=0o100644<<16;z.writestr(info,raw)
        z.writestr(MANIFEST,(json.dumps(manifest,indent=2)+'\n').encode())
    require(set(inventory(source))==set(files),'Source inventory changed during package')
    for row in rows:
        if row['path'] in files:require(filehash(files[row['path']])==(row['bytes'],row['sha256']),'Source bytes changed during package')
    result=verify_zip(target);size,h=filehash(target)
    with companions[1].open('x',encoding='utf-8') as f:f.write(h+'  '+target.name+'\n')
    with companions[2].open('x',encoding='utf-8') as f:f.write(json.dumps(manifest,indent=2)+'\n')
    return {'target':str(target),'bytes':size,'sha256':h,**result}
def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--source',type=pathlib.Path,required=True);p.add_argument('--output',type=pathlib.Path,required=True);p.add_argument('--require-native',action='store_true');a=p.parse_args();print(json.dumps(build(a.source,a.output,a.require_native)))
if __name__=='__main__':main()

"""Stage final refinement evidence and fresh editable ZIPs from the selected manifest.

Run only after final handoffs and the independent all10 workspace reopen pass.
This copies byte-identical evidence, never edits models or historical documents.
Recipes preserve original code/path assumptions; they are provenance, not a
promise of a one-command portable rebuild. Packed blends are the restore entry.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import shutil
import stat
import tempfile
import unicodedata
import zipfile

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
IDS={'alexia','rindi','kairo','luna','nox','atlas','zeno','yuna','mochi','pip'}
REFINED={'rindi','luna','nox','yuna','pip'}
NATIVE={'rindi','luna','nox','yuna'}
SUFFIXES={'.json','.md','.py','.txt'}
SHARED={
 'luna':['work/model-rebuild/Mochi-tail/inspect_components.py',
         'work/model-rebuild/Mochi-tail/attach_tail_candidate.py',
         'work/model-rebuild/tools/validate_roster_candidate.py',
         'work/local-sculpt-toolchain/audit_hair_caps_exact.py',
         'work/v11-diagnostic/audit_glb_components.py'],
 'rindi':['work/local-sculpt-toolchain/audit_hair_caps_exact.py',
          'work/v11-diagnostic/audit_glb_components.py',
          'work/model-rebuild/tools/validate_roster_candidate.py'],
}

def require(ok,message):
    if not ok:raise ValueError(message)

def sha(path):
    h=hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda:stream.read(1024*1024),b''):h.update(block)
    return h.hexdigest()

def name(value):
    require(isinstance(value,str) and value and '\\' not in value and '\0' not in value,'Unsafe relative name')
    p=PurePosixPath(value)
    require(not p.is_absolute() and all(part not in {'','.','..'} and ':' not in part for part in p.parts)
            and p.as_posix()==value and not value.endswith('/'),'Unsafe relative name: '+value)
    return value

def file_item(source,relative):
    source=Path(source)
    require(not source.is_symlink(),'Symlink source forbidden: '+str(source))
    source=source.resolve(strict=True)
    require(source.is_file(),'Expected regular source: '+str(source))
    return {'source':source,'path':name(relative),'sha256':sha(source),'bytes':source.stat().st_size}

def memory_item(raw,relative):
    return {'data':raw,'path':name(relative),'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw)}

def public(item):return {k:item[k] for k in ('path','sha256','bytes')}

def validate_names(items):
    seen=set();paths=set()
    for item in items:
        relative=name(item['path']);key=unicodedata.normalize('NFC',relative).casefold()
        require(key not in seen,'Duplicate/case-colliding name: '+relative);seen.add(key);paths.add(key)
    for relative in paths:
        require(all('/'.join(relative.split('/')[:i]) not in paths for i in range(1,len(relative.split('/')))),
                'File/directory name collision: '+relative)

def unchanged(item):
    if 'source' in item:
        require(item['source'].stat().st_size==item['bytes'] and sha(item['source'])==item['sha256'],
                'Input changed: '+str(item['source']))

def verify_zip(path,expected=None):
    with zipfile.ZipFile(path) as archive:
        infos=archive.infolist();validate_names([{'path':i.filename} for i in infos])
        require(all(not i.is_dir() and not i.flag_bits&1 and stat.S_IFMT(i.external_attr>>16)!=stat.S_IFLNK for i in infos),
                'Directory, encrypted or link entry')
        require(archive.testzip() is None,'ZIP CRC failed')
        manifest=json.loads(archive.read('ZIP-MANIFEST.json'))
        entries=manifest['files'];validate_names(entries)
        require(set(i.filename for i in infos)=={r['path'] for r in entries}|{'ZIP-MANIFEST.json'},'ZIP inventory mismatch')
        if expected is not None:require(entries==[public(i) for i in sorted(expected,key=lambda r:r['path'])],'Expected inventory mismatch')
        for row in entries:
            h=hashlib.sha256();size=0
            with archive.open(row['path']) as stream:
                for block in iter(lambda:stream.read(1024*1024),b''):h.update(block);size+=len(block)
            require(size==row['bytes'] and h.hexdigest()==row['sha256'],'ZIP payload hash mismatch: '+row['path'])
    return {'path':str(path),'sha256':sha(path),'bytes':path.stat().st_size,'entries':len(infos),'crc_and_all_payload_hashes_passed':True}

def write_zip(path,items,kind):
    require(not path.exists(),'Fresh ZIP required: '+str(path));validate_names(items)
    require('ZIP-MANIFEST.json' not in {i['path'] for i in items},'Reserved ZIP manifest name')
    for item in items:unchanged(item)
    manifest={'schema':'crwt.editable-archive.v1','kind':kind,'approved':False,'gameIntegrated':False,
              'files':[public(i) for i in sorted(items,key=lambda row:row['path'])]}
    with tempfile.TemporaryDirectory(prefix='stage-evidence-',dir=HERE) as temp:
        require(Path(temp).resolve().is_relative_to(HERE),'Temporary archive folder must remain inside this pass')
        scratch=Path(temp)/path.name
        with zipfile.ZipFile(scratch,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=6,allowZip64=True) as archive:
            for item in sorted(items,key=lambda row:row['path']):
                unchanged(item)
                if 'source' in item:archive.write(item['source'],item['path'])
                else:archive.writestr(item['path'],item['data'])
                unchanged(item)
            archive.writestr('ZIP-MANIFEST.json',(json.dumps(manifest,indent=2)+'\n').encode())
        verify_zip(scratch,items)
        path.parent.mkdir(parents=True,exist_ok=True)
        with scratch.open('rb') as src,path.open('xb') as dest:shutil.copyfileobj(src,dest,1024*1024)
    for item in items:unchanged(item)
    return verify_zip(path,items)

def resolve_declared(value,folder,charroot):
    p=Path(value);p=p if p.is_absolute() else folder/p;p=p.resolve(strict=True)
    require(p.is_relative_to(charroot),'Declared asset escapes character work folder')
    return p

def handoff_native(handoff,folder,charroot):
    value=handoff.get('editable_blend')
    if isinstance(value,dict):
        return resolve_declared(value['path'],folder,charroot),value['sha256']
    if isinstance(value,str):
        return resolve_declared(value,folder,charroot),handoff['editable_blend_sha256']
    rows=[row for row in handoff.get('files',[]) if isinstance(row,dict) and str(row.get('path','')).endswith('.blend')]
    require(len(rows)==1,'Expected one final native blend in handoff')
    return resolve_declared(rows[0]['path'],folder,charroot),rows[0]['sha256']

def plan(output,manifest_path,reopen_path,branch):
    output=output.resolve(strict=True);manifest_path=manifest_path.resolve(strict=True)
    require(output==ROOT/'outputs/model-review-2026-10-05','Only new Oct05 review output is supported')
    require(manifest_path.is_relative_to(output),'Manifest must belong to selected output')
    manifest=json.loads(manifest_path.read_text(encoding='utf-8'));rows=manifest['models']
    require(len(rows)==10 and {r['id'] for r in rows}==IDS,'Expected complete unique10 roster')
    require(manifest.get('approved') is False and manifest.get('gameIntegrated') is False,'Unapproved review status required')
    require(set(manifest['refined_ids'])==REFINED,'Expected current five refinements')
    require((output/'evidence/MOCHI-HANDOFF.json').is_file(),'Historical Mochi handoff is mandatory')
    historical=ROOT/'outputs/model-review-2026-10-04/evidence/MOCHI-HANDOFF.json'
    require(sha(output/'evidence/MOCHI-HANDOFF.json')==sha(historical),'Historical Mochi handoff changed')
    copies=[];byid={};native={};handoffpaths={}
    for row in rows:
        require(row.get('approved') is False and row.get('gameIntegrated') is False,'Model approval status changed')
        staged=output/name(row['path']);require(staged.is_relative_to(output) and sha(staged)==row['sha256'],'Staged model hash mismatch')
        if row['id'] not in REFINED:continue
        id=row['id'];charroot=(HERE/id).resolve(strict=True)
        source=Path(row['source_path_at_generation']).resolve(strict=True);folder=source.parent
        require(source.is_relative_to(charroot) and sha(source)==row['sha256'],'Selected work model mismatch')
        if id=='pip':
            hp=charroot/'review-receipt.json';h=json.loads(hp.read_text())
            require(h['candidate_glb_sha256']==row['sha256'],'Stale Pip receipt')
            blend=source.with_suffix('.blend');digest=h['native_blend_sha256']
        else:
            hp=folder/(id.upper()+'-HANDOFF.json');h=json.loads(hp.read_text())
            actual=h.get('candidate_sha256',h.get('sha256',h.get('candidate',{}).get('sha256') if isinstance(h.get('candidate'),dict) else None))
            require(actual==row['sha256'],'Stale handoff: '+id)
            blend,digest=handoff_native(h,folder,charroot)
        require(sha(blend)==digest,'Native blend hash mismatch: '+id)
        native[id]=file_item(blend,id+'/'+blend.name);handoffpaths[id]=hp
        items=[]
        for p in sorted(folder.rglob('*')):
            if p.is_file() and p.suffix.lower() in SUFFIXES and '__pycache__' not in p.parts:
                items.append(file_item(p,p.relative_to(folder).as_posix()))
        for p in sorted(charroot.iterdir()):
            if p.is_file() and p.suffix.lower() in SUFFIXES:
                items.append(file_item(p,'recipes/'+p.name))
        for relative in SHARED.get(id,[]):
            items.append(file_item(ROOT/relative,'recipes/dependencies/'+relative))
        recipe_rows=h.get('scripts',[])
        for entry in recipe_rows:
            p=resolve_declared(entry['path'],folder,charroot)
            require(sha(p)==entry['sha256'],'Declared recipe hash mismatch')
            rel='recipes/'+p.relative_to(charroot).as_posix()
            if rel not in {i['path'] for i in items}:items.append(file_item(p,rel))
        if hp.resolve() not in {i.get('source') for i in items}:items.append(file_item(hp,hp.name))
        render=output/'renders'/id/'render-evidence.json'
        require(render.is_file() and json.loads(render.read_text())['input_sha256']==row['sha256'],'Render evidence mismatch: '+id)
        items.append(file_item(render,'selected-render-evidence.json'))
        validate_names(items);byid[id]=items
        for item in items:copies.append({**item,'path':'evidence/'+id+'/'+item['path']})
    pip_receipt=file_item(handoffpaths['pip'],'evidence/PIP-HANDOFF.json');copies.append(pip_receipt)
    copies.append(file_item(Path(__file__),'evidence/stage_evidence.py'))
    workspace=output/'editable/CRWT-semua-karakter-review.blend'
    workspace_proof=workspace.with_suffix('.workspace-proof.json')
    w=json.loads(workspace_proof.read_text());workspace_sha=sha(workspace)
    require(w['output_blend_sha256']==workspace_sha and w['character_count']==10 and w['all_file_images_packed'],'Workspace mismatch')
    require({r['id']:r['source_sha256'] for r in w['characters']}=={r['id']:r['sha256'] for r in rows},'Workspace roster mismatch')
    reopen_path=reopen_path.resolve(strict=True);reopen=json.loads(reopen_path.read_text())
    require(reopen['passed'] and reopen['blend_sha256']==workspace_sha and reopen['packed_file_images']==18,'Independent workspace reopen required')
    copies.append(file_item(reopen_path,'evidence/roster-workspace-reopen.json'))
    archive_names=['CRWT-refined-individuals.zip','Pip-source-preserved.zip','CRWT-editable-roster.zip']
    for archive in archive_names:require(not (output/'editable'/archive).exists(),'Fresh ZIP required: '+archive)
    validate_names(copies)
    for item in copies:
        target=output/item['path']
        require(not target.exists() or target.is_file() and sha(target)==item['sha256'],'Different evidence already staged: '+item['path'])
    readme=('Semua model adalah kandidat inspeksi: approved=false, gameIntegrated=false.\n'
            'File .blend sudah packed; buka langsung di Blender untuk mengedit tanpa path gambar lama.\n'
            'Path absolut pada handoff lama hanya provenance. Recipes mempertahankan asumsi path historis dan dependency Blender/numpy; bukan jaminan rebuild satu perintah.\n')
    individual=[]
    for id in sorted(NATIVE):
        individual.append(native[id])
        individual.extend({**i,'path':'evidence/'+id+'/'+i['path']} for i in byid[id])
    individual.append(memory_item(readme.encode(),'MULAI-DI-SINI.txt'))
    pip=[{**native['pip'],'path':native['pip']['source'].name}]
    pip.extend({**i,'path':'evidence/'+i['path']} for i in byid['pip'])
    pip.append(memory_item((readme+'Pip blend menyimpan candidate dan original28objects/60actions; enam clip mechanical belum disetujui.\n').encode(),'MULAI-DI-SINI.txt'))
    roster=[file_item(workspace,workspace.name),file_item(workspace_proof,workspace_proof.name),
            file_item(reopen_path,'roster-workspace-reopen.json'),memory_item(readme.encode(),'MULAI-DI-SINI.txt')]
    zips=[('CRWT-refined-individuals.zip',individual,'four-packed-refined-individuals'),
          ('Pip-source-preserved.zip',pip,'pip-packed-original-source-preserved'),
          ('CRWT-editable-roster.zip',roster,'all10-packed-editable-roster')]
    for _,items,_ in zips:validate_names(items)
    pathmap={'schema':'crwt.refinement-portable-path-map.v1','approved':False,'gameIntegrated':False,
       'planned_snapshot_branch':branch,'manifest_sha256':sha(manifest_path),
       'models':{r['id']:{'glb':r['path'],'sha256':r['sha256'],'reference':r['reference']} for r in rows},
       'editable_archives':{n:{'members':[i['path'] for i in sorted(items,key=lambda r:r['path'])]} for n,items,_ in zips},
       'handoffs':{id:'evidence/'+id+'/'+hp.name if id!='pip' else 'evidence/PIP-HANDOFF.json' for id,hp in handoffpaths.items()},
       'historical_mochi':{'handoff':'evidence/MOCHI-HANDOFF.json','proof':'evidence/mochi-tail-attachment.proof.json',
                           'path_status':'Old scratch dependency paths are historical; the current manifest identifies the selected unchanged Mochi GLB.'},
       'restore_note':'Use relative GLB/reference paths, packed native blends and ZIP manifests. Absolute generation paths in preserved evidence are provenance, not restore dependencies. Recipes are review provenance with historical path/environment assumptions; no one-command portable rebuild is claimed.'}
    return copies,zips,pathmap,workspace_sha

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--output-root',type=Path,default=ROOT/'outputs/model-review-2026-10-05')
    p.add_argument('--manifest',type=Path)
    p.add_argument('--workspace-reopen-proof',type=Path,default=HERE/'roster-workspace-reopen.json')
    p.add_argument('--snapshot-branch',default='checkpoint/crazy-rich-world-tour-2026-10-05-roster-refinement-portable')
    p.add_argument('--dry-run',action='store_true');p.add_argument('--verify-zip',type=Path)
    a=p.parse_args()
    if a.verify_zip:print(json.dumps(verify_zip(a.verify_zip.resolve(strict=True))));return
    copies,zips,pathmap,workspace_sha=plan(a.output_root,a.manifest or a.output_root/'review-manifest.json',a.workspace_reopen_proof,a.snapshot_branch)
    output=a.output_root.resolve();pathmap_path=output/'evidence/PORTABLE-PATH-MAP.json';receipt_path=output/'evidence/refinement-staging-receipt.json'
    require(not pathmap_path.exists() and not receipt_path.exists(),'Fresh generated path map/receipt required')
    if a.dry_run:
        print(json.dumps({'dry_run':True,'evidence_files':len(copies),'zip_names':[n for n,_,_ in zips],
                          'native_blend_members':{n:[i['path'] for i in rows if i['path'].endswith('.blend')] for n,rows,_ in zips},
                          'workspace_sha256':workspace_sha,'manifest_sha256':pathmap['manifest_sha256']}));return
    for item in copies:
        unchanged(item);target=output/item['path'];target.parent.mkdir(parents=True,exist_ok=True)
        if not target.exists():
            with item['source'].open('rb') as src,target.open('xb') as dest:shutil.copyfileobj(src,dest,1024*1024)
        require(sha(target)==item['sha256'],'Staged evidence hash mismatch');unchanged(item)
    archives=[write_zip(output/'editable'/n,items,kind) for n,items,kind in zips]
    with pathmap_path.open('x',encoding='utf-8') as stream:stream.write(json.dumps(pathmap,indent=2)+'\n')
    receipt={'schema':'crwt.refinement-evidence-staging.v1','approved':False,'gameIntegrated':False,
             'manifest_sha256':pathmap['manifest_sha256'],'workspace_sha256':workspace_sha,
             'copied_evidence':[public(i) for i in copies],'archives':[{**r,'path':Path(r['path']).relative_to(output).as_posix()} for r in archives],
             'path_map':{'path':pathmap_path.relative_to(output).as_posix(),'sha256':sha(pathmap_path)},
             'historical_mochi_handoff_preserved':True}
    with receipt_path.open('x',encoding='utf-8') as stream:stream.write(json.dumps(receipt,indent=2)+'\n')
    print(json.dumps({'evidence_files':len(copies),'archives':receipt['archives'],'receipt_sha256':sha(receipt_path)}))

if __name__=='__main__':main()

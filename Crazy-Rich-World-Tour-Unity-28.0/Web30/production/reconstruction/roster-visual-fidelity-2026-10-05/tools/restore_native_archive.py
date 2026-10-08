"""Restore the exact fidelity native ZIP from its Git-storage-only two parts.

--receipt is an INPUT storage manifest, not an output report. Output ZIP and
optional --report must both be fresh. This never modifies the parts or receipt.
"""
from pathlib import Path
import argparse
import hashlib
import json
import re
import zipfile

FULL_NAME='CRWT-fidelity-editable-roster.zip'
FULL_SHA='966c135bd63115bbec746c21d30ef6f1ff33d4e6bf5d195c4975da57d470199a'
FULL_BYTES=65915347

def require(condition,message):
    if not condition:raise ValueError(message)

def digest(path):
    h=hashlib.sha256()
    with Path(path).open('rb') as f:
        for block in iter(lambda:f.read(1024*1024),b''):h.update(block)
    return h.hexdigest()

def restore(parts_dir,output,receipt_path,report_path=None):
    parts_dir=Path(parts_dir).resolve(strict=True)
    receipt_path=Path(receipt_path).resolve(strict=True)
    output=Path(output).absolute()
    require(parts_dir.is_dir(),'Parts directory missing')
    require(receipt_path.parent==parts_dir and not receipt_path.is_symlink(),'Receipt must be a regular file in parts-dir')
    require(not output.exists() and not output.is_symlink(),'Output ZIP must be fresh')
    if report_path is not None:
        report_path=Path(report_path).absolute()
        require(not report_path.exists() and not report_path.is_symlink(),'Report must be fresh')
        require(report_path!=output,'Report and ZIP paths must differ')
    receipt_sha=digest(receipt_path)
    r=json.loads(receipt_path.read_text(encoding='utf-8'))
    require(r.get('schema')=='crwt.git_native_storage.v1' and r.get('approved') is False and
            r.get('gameIntegrated') is False,'Unsupported receipt schema/flags')
    require(r.get('full_archive')=={'path':FULL_NAME,'bytes':FULL_BYTES,'sha256':FULL_SHA},'Pinned native archive differs')
    parts=r.get('parts');require(isinstance(parts,list) and len(parts)==2,'Exactly two parts required')
    sources=[]
    for n,row in enumerate(parts,1):
        name=FULL_NAME+'.part'+str(n).zfill(2)
        require(row.get('path')==name,'Unsafe or unexpected part path/order')
        p=parts_dir/name
        require(not p.is_symlink() and p.is_file() and p.resolve().parent==parts_dir,'Part is missing or escapes directory')
        require(isinstance(row.get('bytes'),int) and not isinstance(row['bytes'],bool) and row['bytes']>0 and
                re.fullmatch('[0-9a-f]{64}',row.get('sha256','')),'Invalid part size/hash')
        require(p.stat().st_size==row['bytes'] and digest(p)==row['sha256'],'Part size/SHA mismatch: '+name)
        sources.append(p)
    require(sum(row['bytes'] for row in parts)==FULL_BYTES,'Part lengths do not equal original')
    require(output.resolve() not in [receipt_path]+[p.resolve() for p in sources],'Output cannot be a source')
    if report_path is not None:
        require(report_path.resolve() not in [receipt_path]+[p.resolve() for p in sources],'Report cannot be a source')
    output.parent.mkdir(parents=True,exist_ok=True)
    # Exclusive creation preserves any existing user ZIP. Failed outputs are
    # retained with a failed command exit, never mistaken for a verified archive.
    with output.open('xb') as out:
        for p,row in zip(sources,parts):
            h=hashlib.sha256();count=0
            with p.open('rb') as src:
                for block in iter(lambda:src.read(1024*1024),b''):
                    out.write(block);h.update(block);count+=len(block)
            require(h.hexdigest()==row['sha256'] and count==row['bytes'],'Part changed during assembly')
    require(output.stat().st_size==FULL_BYTES and digest(output)==FULL_SHA,'Restored full ZIP size/SHA mismatch')
    with zipfile.ZipFile(output) as z:
        require(z.testzip() is None,'Restored native ZIP CRC failure')
        entries=len(z.infolist())
    require(digest(receipt_path)==receipt_sha and all(digest(p)==row['sha256'] for p,row in zip(sources,parts)),
            'Source parts/receipt changed')
    result={'schema':'crwt.native_archive_restore.v1','passed':True,'output_archive':str(output.resolve()),
            'sha256':FULL_SHA,'bytes':FULL_BYTES,'zip_crc_passed':True,'zip_entries':entries,
            'storage_receipt_sha256':receipt_sha,'part_count':2,'source_parts_and_receipt_unchanged':True,
            'approved':False,'gameIntegrated':False}
    if report_path is not None:
        report_path.parent.mkdir(parents=True,exist_ok=True)
        with report_path.open('x',encoding='utf-8',newline='\n') as f:
            json.dump(result,f,indent=2);f.write('\n')
    return result

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--parts-dir',type=Path,required=True,help='Directory containing the two pinned .zip.partNN files')
    ap.add_argument('--output',type=Path,required=True,help='Fresh full ZIP destination; never overwritten')
    ap.add_argument('--receipt',type=Path,required=True,help='INPUT git-native-storage-receipt.json inside parts-dir')
    ap.add_argument('--report',type=Path,help='Optional fresh OUTPUT JSON verification receipt')
    a=ap.parse_args()
    print(json.dumps(restore(a.parts_dir,a.output,a.receipt,a.report),indent=2))

if __name__=='__main__':main()

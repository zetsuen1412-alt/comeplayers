#!/usr/bin/env python3
"""Verify the one-entry offline gallery ZIP and restore a fresh HTML file."""
import argparse, hashlib, json, pathlib, stat, zipfile
EXPECTED_NAME='BUKA-REVIEW-MODEL.html'
EXPECTED_SHA='25ec72ab2ffb0cfeddd93b50e83737cc53ff6e445311721950b6ad8a60369261'
EXPECTED_BYTES=47456895

def require(ok,message):
    if not ok:raise ValueError(message)
def file_sha(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        while block:=f.read(1024*1024):h.update(block)
    return h.hexdigest()
def inspect_archive(archive):
    archive=archive.resolve(strict=True);before=file_sha(archive)
    with zipfile.ZipFile(archive,'r') as z:
        rows=z.infolist();require(len(rows)==1,'Gallery ZIP must contain exactly one entry')
        info=rows[0]
        require(info.filename==EXPECTED_NAME and not info.is_dir() and not info.flag_bits&1 and stat.S_IFMT(info.external_attr>>16) in {0,stat.S_IFREG},'Unsafe gallery ZIP entry')
        require(info.file_size==EXPECTED_BYTES,'Gallery uncompressed length mismatch')
        h=hashlib.sha256();count=0
        with z.open(info,'r') as source:
            while block:=source.read(1024*1024):count+=len(block);require(count<=EXPECTED_BYTES,'Gallery expansion exceeds expected length');h.update(block)
        # ZipExtFile checks its complete CRC while streaming to EOF.
        require(count==EXPECTED_BYTES and h.hexdigest()==EXPECTED_SHA,'Gallery ZIP HTML size/SHA mismatch')
    require(file_sha(archive)==before,'Archive changed during validation')
    return {'archive_sha256':before,'entry':EXPECTED_NAME,'html_bytes':EXPECTED_BYTES,'html_sha256':EXPECTED_SHA,'entry_count':1,'CRC_passed':True}
def restore(archive,out,receipt=None):
    archive=archive.resolve(strict=True);out=out.resolve()
    require(not out.exists() and out!=archive,'HTML output must be a fresh file distinct from archive')
    if receipt:
        receipt=receipt.resolve();require(not receipt.exists() and receipt not in {archive,out},'Receipt must be a fresh distinct file')
    report=inspect_archive(archive)
    out.parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(archive,'r') as z,z.open(EXPECTED_NAME,'r') as source,out.open('xb') as target:
        count=0;h=hashlib.sha256()
        while block:=source.read(1024*1024):count+=len(block);require(count<=EXPECTED_BYTES,'Gallery expansion exceeds expected length');target.write(block);h.update(block)
    require(count==EXPECTED_BYTES and h.hexdigest()==EXPECTED_SHA and file_sha(archive)==report['archive_sha256'],'Restored gallery/archive changed')
    report.update({'schema':'crwt.alexia_profile_offline_gallery_restore.v1','passed':True,'output':str(out),'archive_bytes_unchanged':True,'no_existing_file_overwritten':True,'approved':False,'gameIntegrated':False})
    if receipt:
        receipt.parent.mkdir(parents=True,exist_ok=True)
        with receipt.open('x',encoding='utf-8',newline='\n') as f:f.write(json.dumps(report,indent=2)+'\n')
    return report
def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--archive',type=pathlib.Path,required=True);p.add_argument('--out',type=pathlib.Path,required=True);p.add_argument('--receipt',type=pathlib.Path)
    a=p.parse_args();print(json.dumps(restore(a.archive,a.out,a.receipt),indent=2))
if __name__=='__main__':main()

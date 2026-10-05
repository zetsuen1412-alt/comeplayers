#!/usr/bin/env python3
"""Verify an explicitly pinned one-entry gallery ZIP and restore fresh HTML."""
import argparse, hashlib, json, pathlib, stat, zipfile, sys
sys.dont_write_bytecode=True
def require(ok,message):
    if not ok:raise ValueError(message)
def file_sha(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        while block:=f.read(1024*1024):h.update(block)
    return h.hexdigest()
def inspect_archive(archive,expected):
    archive=archive.resolve(strict=True);before=file_sha(archive)
    require(before==expected['archive_sha256'],'Gallery ZIP source SHA mismatch')
    with zipfile.ZipFile(archive,'r') as z:
        entries=z.infolist();require(len(entries)==1,'One gallery ZIP entry required');info=entries[0]
        require(info.filename==expected['entry']=='BUKA-REVIEW-MODEL.html' and not info.is_dir() and not info.flag_bits&1 and stat.S_IFMT(info.external_attr>>16) in {0,stat.S_IFREG},'Unsafe ZIP entry')
        require(info.file_size==expected['html_bytes'],'Gallery uncompressed size mismatch');h=hashlib.sha256();count=0
        with z.open(info,'r') as source:
            while block:=source.read(1024*1024):count+=len(block);require(count<=expected['html_bytes'],'Gallery expansion exceeds pin');h.update(block)
        require(count==expected['html_bytes'] and h.hexdigest()==expected['html_sha256'],'Gallery HTML SHA/CRC/size mismatch')
    require(file_sha(archive)==before,'Archive changed during validation')
    return {'archive_sha256':before,'entry':info.filename,'html_sha256':expected['html_sha256'],'html_bytes':count,'entry_count':1,'CRC_passed':True}
def restore(archive,out,expected,receipt=None):
    archive=archive.resolve(strict=True);out=out.resolve();require(not out.exists() and out!=archive,'Fresh HTML output distinct from source required')
    if receipt:receipt=receipt.resolve();require(not receipt.exists() and receipt not in {out,archive},'Fresh distinct report required')
    report=inspect_archive(archive,expected);out.parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(archive,'r') as z,z.open(expected['entry'],'r') as source,out.open('xb') as target:
        h=hashlib.sha256();count=0
        while block:=source.read(1024*1024):count+=len(block);require(count<=expected['html_bytes'],'Gallery expansion exceeds pin');target.write(block);h.update(block)
    require(count==expected['html_bytes'] and h.hexdigest()==expected['html_sha256'] and file_sha(archive)==report['archive_sha256'],'Restore identity mismatch/source changed')
    report.update({'schema':'crwt.alexia_hair_strands_gallery_restore.v1','passed':True,'output':str(out),'source_archive_unchanged':True,'no_existing_file_overwritten':True,'approved':False,'gameIntegrated':False})
    if receipt:
        receipt.parent.mkdir(parents=True,exist_ok=True)
        with receipt.open('x',encoding='utf-8',newline='\n') as f:f.write(json.dumps(report,indent=2)+'\n')
    return report
def main():
    from verify_hair_strands_source import pins_document
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--archive',type=pathlib.Path,required=True);p.add_argument('--pins',type=pathlib.Path,required=True);p.add_argument('--out',type=pathlib.Path,required=True);p.add_argument('--receipt',type=pathlib.Path);a=p.parse_args()
    pinraw=a.pins.read_bytes();pins=pins_document(pinraw);require(a.out.resolve()!=a.pins.resolve() and (not a.receipt or a.receipt.resolve()!=a.pins.resolve()),'Pins are immutable input')
    report=restore(a.archive,a.out,pins['gallery'],a.receipt);require(a.pins.read_bytes()==pinraw,'Pins changed during restore');print(json.dumps(report,indent=2))
if __name__=='__main__':main()

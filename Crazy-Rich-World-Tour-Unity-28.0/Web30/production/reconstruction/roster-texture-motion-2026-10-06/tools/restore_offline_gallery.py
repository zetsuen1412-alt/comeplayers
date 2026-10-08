#!/usr/bin/env python3
"""Verify an explicitly pinned one-entry gallery ZIP and restore fresh HTML."""
import argparse, hashlib, io, json, pathlib, stat, zipfile, sys
sys.dont_write_bytecode=True
def require(ok,message):
    if not ok:raise ValueError(message)
def file_sha(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        while block:=f.read(1024*1024):h.update(block)
    return h.hexdigest()
def archive_stream(archive,expected):
    """Resolve a logical archive from its two pinned sibling parts in memory."""
    archive=archive.resolve();parts=expected.get('archive_parts');sources=[]
    if parts:
        require(not archive.exists(),'Split gallery must not contain a full logical ZIP')
        require(archive.name==expected['archive'],'Logical gallery archive name differs')
        data=io.BytesIO();total=0;digest=hashlib.sha256()
        for row in parts:
            require(pathlib.PurePosixPath(row['path']).name==row['path'],'Archive parts must be sibling files')
            path=archive.parent/row['path'];require(path.is_file() and not path.is_symlink(),'Archive part missing/linked')
            before=file_sha(path);require(path.stat().st_size==row['bytes'] and before==row['sha256'],'Gallery part size/SHA mismatch')
            with path.open('rb') as source:
                while block:=source.read(1024*1024):data.write(block);digest.update(block);total+=len(block)
            sources.append((path,before))
        require(total==expected['archive_bytes'] and digest.hexdigest()==expected['archive_sha256'],'Concatenated logical gallery ZIP size/SHA mismatch')
        data.seek(0);return data,sources
    archive=archive.resolve(strict=True);before=file_sha(archive)
    require(before==expected['archive_sha256'],'Gallery ZIP source SHA mismatch')
    return archive,[(archive,before)]
def unchanged(sources):
    require(all(file_sha(path)==digest for path,digest in sources),'Gallery archive input changed')
def inspect_archive(archive,expected):
    stream,sources=archive_stream(archive,expected)
    with zipfile.ZipFile(stream,'r') as z:
        entries=z.infolist();require(len(entries)==1,'One gallery ZIP entry required');info=entries[0]
        require(info.filename==expected['entry']=='BUKA-REVIEW-MODEL.html' and not info.is_dir() and not info.flag_bits&1 and stat.S_IFMT(info.external_attr>>16) in {0,stat.S_IFREG},'Unsafe ZIP entry')
        require(info.file_size==expected['html_bytes'],'Gallery uncompressed size mismatch');h=hashlib.sha256();count=0
        with z.open(info,'r') as source:
            while block:=source.read(1024*1024):count+=len(block);require(count<=expected['html_bytes'],'Gallery expansion exceeds pin');h.update(block)
        require(count==expected['html_bytes'] and h.hexdigest()==expected['html_sha256'],'Gallery HTML SHA/CRC/size mismatch')
    unchanged(sources)
    return {'archive_sha256':expected['archive_sha256'],'archive_storage':'split' if expected.get('archive_parts') else 'single','archive_parts':expected.get('archive_parts',[]),'entry':info.filename,'html_sha256':expected['html_sha256'],'html_bytes':count,'entry_count':1,'CRC_passed':True,'logical_ZIP_written':False}
def restore(archive,out,expected,receipt=None):
    archive=archive.resolve();out=out.resolve();require(not out.exists() and out!=archive,'Fresh HTML output distinct from source required')
    if receipt:receipt=receipt.resolve();require(not receipt.exists() and receipt not in {out,archive},'Fresh distinct report required')
    report=inspect_archive(archive,expected);out.parent.mkdir(parents=True,exist_ok=True)
    stream,sources=archive_stream(archive,expected)
    with zipfile.ZipFile(stream,'r') as z,z.open(expected['entry'],'r') as source,out.open('xb') as target:
        h=hashlib.sha256();count=0
        while block:=source.read(1024*1024):count+=len(block);require(count<=expected['html_bytes'],'Gallery expansion exceeds pin');target.write(block);h.update(block)
    require(count==expected['html_bytes'] and h.hexdigest()==expected['html_sha256'],'Restore identity mismatch')
    unchanged(sources)
    report.update({'schema':'crwt.alexia_texture_motion_gallery_restore.v1','passed':True,'output':str(out),'source_archive_unchanged':True,'no_existing_file_overwritten':True,'approved':False,'gameIntegrated':False})
    if receipt:
        receipt.parent.mkdir(parents=True,exist_ok=True)
        with receipt.open('x',encoding='utf-8',newline='\n') as f:f.write(json.dumps(report,indent=2)+'\n')
    return report
def main():
    from verify_texture_motion_source import pins_document
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--archive',type=pathlib.Path,required=True);p.add_argument('--pins',type=pathlib.Path,required=True);p.add_argument('--out',type=pathlib.Path,required=True);p.add_argument('--receipt',type=pathlib.Path);a=p.parse_args()
    pinraw=a.pins.read_bytes();pins=pins_document(pinraw);require(a.out.resolve()!=a.pins.resolve() and (not a.receipt or a.receipt.resolve()!=a.pins.resolve()),'Pins are immutable input')
    report=restore(a.archive,a.out,pins['gallery'],a.receipt);require(a.pins.read_bytes()==pinraw,'Pins changed during restore');print(json.dumps(report,indent=2))
if __name__=='__main__':main()

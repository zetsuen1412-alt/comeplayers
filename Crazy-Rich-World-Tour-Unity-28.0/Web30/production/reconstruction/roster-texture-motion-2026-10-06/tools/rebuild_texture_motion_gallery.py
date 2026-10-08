#!/usr/bin/env python3
"""Rebuild fresh external HTML; verify two-part logical ZIP/frozen metadata."""
import argparse, json, pathlib, subprocess, sys
sys.dont_write_bytecode=True
from verify_texture_motion_source import pins_document, require, sha
from restore_offline_gallery import inspect_archive
def rebuild(roster,build_dir,receipt=None):
    roster=roster.resolve(strict=True);build_dir=build_dir.resolve();require(not build_dir.exists() and not build_dir.is_relative_to(roster) and not roster.is_relative_to(build_dir),'Fresh external gallery directory required')
    pins_path=roster/'source-pins.json';pinraw=pins_path.read_bytes();pins=pins_document(pinraw);g=pins['gallery']
    frozen_path=roster/g['receipt'];frozen_raw=frozen_path.read_bytes();frozen=json.loads(frozen_raw);manifest_path=roster/pins['review']['path'];manifest_raw=manifest_path.read_bytes()
    require(sha(frozen_raw)==g['receipt_sha256'] and sha(manifest_raw)==pins['review']['sha256'] and frozen['viewer_sha256']==g['html_sha256'] and frozen['viewer_bytes']==g['html_bytes'] and frozen['manifest_sha256']==sha(manifest_raw) and frozen['visual_approval'] is False and frozen['game_integration'] is False,'Frozen pins/receipt mismatch')
    inspect_archive(roster/g['archive'],g)
    if receipt:receipt=receipt.resolve();require(not receipt.exists() and not receipt.is_relative_to(roster) and not receipt.is_relative_to(build_dir),'Fresh external rebuild receipt required')
    build_dir.mkdir(parents=True,exist_ok=False);html=build_dir/g['entry']
    subprocess.run([sys.executable,'-B',str(roster/'viewer/build_offline_gallery.py'),'--manifest',str(manifest_path),'--output',str(html),'--expected-output-sha256',g['html_sha256']],check=True)
    raw=html.read_bytes();generated=json.loads(html.with_suffix('.viewer-receipt.json').read_bytes());require(generated==frozen and sha(raw)==g['html_sha256'] and len(raw)==g['html_bytes'],'Generated gallery/frozen JSON metadata differ')
    require(frozen_path.read_bytes()==frozen_raw and manifest_path.read_bytes()==manifest_raw and pins_path.read_bytes()==pinraw,'Frozen inputs changed')
    existing=roster/g['entry']
    if existing.exists():require(existing.read_bytes()==raw,'Optional extracted HTML differs')
    report={'schema':'crwt.alexia_texture_motion_gallery_rebuild.v1','passed':True,'gallery_sha256':g['html_sha256'],'bytes':len(raw),'gallery_archive_storage':g['archive_storage'],'logical_ZIP_written':False,'frozen_receipt_JSON_equal':True,'frozen_source_bytes_preserved':True,'source_prefix_overwrites':False,'output_html':str(html),'approved':False,'gameIntegrated':False}
    if receipt:
        receipt.parent.mkdir(parents=True,exist_ok=True)
        with receipt.open('x',encoding='utf-8',newline='\n') as f:f.write(json.dumps(report,indent=2)+'\n')
    return report
def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--roster',type=pathlib.Path,required=True);p.add_argument('--build-dir',type=pathlib.Path,required=True);p.add_argument('--receipt',type=pathlib.Path);a=p.parse_args();print(json.dumps(rebuild(a.roster,a.build_dir,a.receipt),indent=2))
if __name__=='__main__':main()

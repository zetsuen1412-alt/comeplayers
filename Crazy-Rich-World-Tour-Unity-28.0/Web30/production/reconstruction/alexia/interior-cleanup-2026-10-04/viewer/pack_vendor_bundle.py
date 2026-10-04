#!/usr/bin/env python3
"""Freeze the six verified Three.js r180 files in compact base64/zlib JSON.

Standard library only. Does not change the vendor files.
  python pack_vendor_bundle.py --vendor path/to/vendor/three --output viewer-vendor-bundle.json
The builder can subsequently use --vendor-bundle without network/artifact access.
"""
import argparse
import base64
import hashlib
import json
import pathlib
import zlib

from build_offline_viewer import EXPECTED_VENDOR_SHA256, read_vendor_bundle, read_vendor_directory


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--vendor', required=True, type=pathlib.Path)
    parser.add_argument('--output', required=True, type=pathlib.Path)
    args = parser.parse_args()
    if args.output.suffix.lower() != '.json':
        raise ValueError('Vendor bundle output must have .json extension')
    root = args.vendor.resolve()
    protected = [root.joinpath(*pathlib.PurePosixPath(relative).parts).resolve() for relative in EXPECTED_VENDOR_SHA256]
    if args.output.resolve() in protected:
        raise ValueError('Output would overwrite frozen vendor source')
    sources = read_vendor_directory(root)
    bundle = {'schema': 'crwt.three.vendor.bundle.v1', 'three_revision': '180',
              'encoding': 'base64(zlib(original UTF-8 bytes))',
              'files': [{'path': relative, 'bytes': len(raw),
                         'sha256': hashlib.sha256(raw).hexdigest(),
                         'zlib_base64': base64.b64encode(zlib.compress(raw, level=9)).decode('ascii')}
                        for relative, raw in sources.items()]}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(bundle, separators=(',', ':')) + '\n', encoding='utf-8', newline='\n')
    recovered = read_vendor_bundle(args.output)
    if sources != recovered:
        raise ValueError('Frozen bundle failed byte identity verification')
    data = args.output.read_bytes()
    print(json.dumps({'bundle': str(args.output), 'files': len(sources),
                      'raw_bytes': sum(map(len, sources.values())), 'bundle_bytes': len(data),
                      'sha256': hashlib.sha256(data).hexdigest(), 'all_original_hashes_verified': True}))


if __name__ == '__main__':
    main()

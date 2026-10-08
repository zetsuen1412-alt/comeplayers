#!/usr/bin/env python3
"""Verify every recorded file in a Web30 portable package; Python 3.10+, stdlib."""
import argparse
import hashlib
import json
import os
import pathlib
import sys


def verify(root, manifest):
    if manifest.get('schema') != 'crwt.web30.portable.v1':
        raise ValueError('Unsupported portable manifest')
    entries = manifest.get('files')
    if not isinstance(entries, list) or not entries:
        raise ValueError('Empty portable manifest')
    paths = [entry['path'] for entry in entries]
    identities = [name.casefold() if os.name == 'nt' and isinstance(name, str) else name for name in paths]
    if len(set(identities)) != len(paths):
        raise ValueError('Duplicate manifest path')
    errors = []
    for entry in entries:
        name = entry['path']
        if not isinstance(name, str) or not name or '\\' in name or ':' in name:
            raise ValueError('Invalid manifest path')
        path = pathlib.PurePosixPath(name)
        if path.as_posix() != name or path.is_absolute() or '..' in path.parts:
            raise ValueError('Manifest path escapes portable folder')
        target = root.joinpath(*path.parts).resolve()
        if not target.is_relative_to(root):
            raise ValueError('Resolved path escapes portable folder')
        if not target.is_file():
            errors.append('Missing: ' + name)
            continue
        data = target.read_bytes()
        if len(data) != entry['bytes'] or hashlib.sha256(data).hexdigest() != entry['sha256']:
            errors.append('Content mismatch: ' + name)
    return {'success': not errors, 'expected': len(entries),
            'checked': len(entries) - len(errors), 'errors': errors,
            'scope': manifest['scope'], 'geometry_approval': False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=pathlib.Path)
    args = parser.parse_args()
    root = (args.root or pathlib.Path(__file__).resolve().parent).resolve()
    try:
        result = verify(root, json.loads((root / 'portable-manifest.json').read_text(encoding='utf-8')))
        print(json.dumps(result, indent=2))
        return 0 if result['success'] else 1
    except (OSError, ValueError, KeyError, TypeError) as exc:
        print('Portable verification failed: ' + str(exc), file=sys.stderr)
        return 2


if __name__ == '__main__':
    raise SystemExit(main())

"""Restore the Oct8 source checkpoint losslessly into a fresh external directory."""
import sys
sys.dont_write_bytecode = True
import argparse, gzip, hashlib, io, json, pathlib, stat, subprocess, zipfile

INVENTORY = 'source-inventory.json'
LAYOUT = 'source-layout.json'
PAYLOAD = 'review-payload.json'
SCHEMA = 'crwt.alexia_side_quality_source_inventory.v1'

def require(ok, message):
    if not ok:
        raise ValueError(message)

def safe(name):
    require(isinstance(name, str) and name and not any(ord(c) < 32 for c in name), 'Invalid path')
    p = pathlib.PurePosixPath(name)
    require(not p.is_absolute() and '\\' not in name and ':' not in name and
            all(x not in {'', '.', '..'} and not x.endswith((' ', '.')) for x in name.split('/')), 'Unsafe path: '+name)
    forbidden = {'con', 'prn', 'aux', 'nul', *[f'com{i}' for i in range(1,10)], *[f'lpt{i}' for i in range(1,10)]}
    require(all(x.split('.')[0].casefold() not in forbidden for x in p.parts), 'Unsafe Windows path')
    require(not any(x in {'.git', '__pycache__', 'node_modules'} for x in p.parts) and
            p.suffix.lower() not in {'.pyc', '.pyo'}, 'Unexpected generated/repository file')
    return name.casefold()

def hashes(raw):
    return {'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(),
            'git_blob_sha1': hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()}

def scan(root):
    result = {}
    seen = set()
    for p in sorted(root.rglob('*')):
        require(not p.is_symlink() and not getattr(p, 'is_junction', lambda: False)(), 'Links are not payload files')
        if not p.is_file():
            continue
        name = p.relative_to(root).as_posix()
        key = safe(name)
        require(key not in seen, 'Case-colliding source path')
        seen.add(key)
        result[name] = hashes(p.read_bytes())
    return result

def source_pins(root):
    doc = json.loads((root/INVENTORY).read_bytes())
    require(doc['schema'] == SCHEMA and doc['approved'] is False and doc['gameIntegrated'] is False,
            'Source inventory schema/flags differ')
    rows = doc['files']
    pins = {}
    keys = set()
    for row in rows:
        key = safe(row['path'])
        require(key not in keys and row['path'] != INVENTORY and row['mode'] == '100644', 'Duplicate/self/mode source pin')
        keys.add(key)
        pins[row['path']] = {k: row[k] for k in ('bytes', 'sha256', 'git_blob_sha1')}
    actual = scan(root)
    inventory_pin = actual.pop(INVENTORY)
    require(actual == pins, 'Source inventory is not exact')
    return pins, inventory_pin

def parts(root, names):
    require(isinstance(names, list) and names and len(set(names)) == len(names), 'Invalid stored part list')
    for name in names:
        safe(name)
    return b''.join((root/name).read_bytes() for name in names)

def restored_bytes(root, row):
    name = row['path']; safe(name)
    if row['encoding'] == 'direct':
        safe(row['source']); raw = (root/row['source']).read_bytes()
    else:
        stored = parts(root, row['parts'])
        require(hashes(stored)['bytes'] == row['stored_bytes'] and
                hashes(stored)['sha256'] == row['stored_sha256'], 'Stored artifact SHA differs: '+name)
        if row['encoding'] == 'gzip-parts':
            raw = gzip.decompress(stored)
        elif row['encoding'] == 'raw-parts':
            raw = stored
        elif row['encoding'] == 'zip-parts':
            with zipfile.ZipFile(io.BytesIO(stored)) as archive:
                entries = archive.infolist()
                require(len(entries) == 1 and entries[0].filename == row['zip_member'] and
                        not entries[0].is_dir() and stat.S_IFMT(entries[0].external_attr >> 16) in {0, stat.S_IFREG},
                        'Gallery must be exactly one regular HTML entry')
                safe(entries[0].filename)
                raw = archive.read(entries[0])  # Also checks the actual entry CRC.
        else:
            raise ValueError('Unknown encoding')
    require(hashes(raw)['bytes'] == row['bytes'] and hashes(raw)['sha256'] == row['sha256'],
            'Restored bytes differ: '+name)
    return raw

def restore(root, output, receipt=None, verify_models=False, verify_source_gate=False):
    root = root.resolve(strict=True)
    output = output.resolve()
    require(not output.exists() and not output.is_relative_to(root) and not root.is_relative_to(output),
            'Restore requires a fresh directory outside the source checkpoint')
    if receipt:
        receipt = receipt.resolve()
        require(not receipt.exists() and not receipt.is_relative_to(root) and not receipt.is_relative_to(output),
                'Receipt requires a fresh external path')
    pins, inventory_pin = source_pins(root)
    layout = json.loads((root/LAYOUT).read_bytes())
    payload_raw = (root/PAYLOAD).read_bytes(); payload = json.loads(payload_raw)
    require(layout['schema'] == 'crwt.alexia_side_quality_source_layout.v1' and
            payload['schema'] == 'crwt.alexia_side_quality_local_checkpoint.v1', 'Layout/payload schema differs')
    expected = {r['path']: {k:r[k] for k in ('bytes','sha256')} for r in payload['files']}
    rows = layout['files']; names = [r['path'] for r in rows]
    require(len(names) == len(set(n.casefold() for n in names)) == len(expected) and set(names) == set(expected),
            'Restore mapping must cover every review file exactly once')
    require(all({k:r[k] for k in ('bytes','sha256')} == expected[r['path']] for r in rows), 'Layout/payload pins differ')
    output.mkdir(parents=True)
    for row in rows:
        destination = output/row['path']; safe(row['path'])
        require(destination.resolve().is_relative_to(output), 'Restore target escaped')
        destination.parent.mkdir(parents=True, exist_ok=True)
        with destination.open('xb') as handle:
            handle.write(restored_bytes(root, row))
    with (output/'checkpoint-files.json').open('xb') as handle:
        handle.write(payload_raw)
    actual = scan(output)
    generated = actual.pop('checkpoint-files.json')
    require({k:{f:v[f] for f in ('bytes','sha256')} for k,v in actual.items()} == expected, 'Complete restored tree differs')
    commands = []
    def run(command, label):
        before = scan(output)
        result = subprocess.run(command, capture_output=True)
        require(result.returncode == 0, label+' failed: '+(result.stdout+result.stderr).decode('utf-8', errors='replace')[-4000:])
        require(scan(output) == before, label+' changed restored files')
        commands.append({'check':label, 'passed':True})
    run([sys.executable,'-B',str(output/'verify_local_checkpoint.py'),str(output)], 'delivered local payload verifier')
    if verify_models:
        run([sys.executable,'-B',str(output/'tools/validate_roster_candidate.py'),str(output/'review-manifest.json')], 'all ten actual GLBs')
    if verify_source_gate:
        replay = json.loads((output/'evidence/source-gate-replay.json').read_bytes())
        tool = output/replay['tool_path']; safe(replay['tool_path'])
        require(hashes(tool.read_bytes())['sha256'] == replay['tool_sha256'], 'Source gate helper SHA differs')
        gate_receipt = output.parent/(output.name+'-source-gate.json')
        require(not gate_receipt.exists(), 'Source-gate receipt must be new and external')
        require(sum('{receipt}' in x for x in replay['argv']) == 1, 'One external gate receipt required')
        argv = [x.replace('{root}',str(output)).replace('{receipt}',str(gate_receipt)) for x in replay['argv']]
        run([sys.executable,'-B',str(tool),*argv], 'selected bounded side-quality source gate')
        gate = json.loads(gate_receipt.read_bytes())
        require(gate['passed'] is True and gate['candidate_sha256'] == layout['candidate_sha256'], 'Source gate candidate differs')
    require(source_pins(root) == (pins,inventory_pin), 'Read-only source bytes changed')
    result = {'schema':'crwt.alexia_side_quality_source_restore.v1', 'passed':True,
              'source_inventory_sha256':inventory_pin['sha256'], 'source_files_checked':len(pins),
              'candidate_sha256':layout['candidate_sha256'], 'review_payload_files':len(expected),
              'all_review_bytes_exact':True, 'generated_checkpoint_manifest_sha256':generated['sha256'],
              'checks':commands, 'source_unchanged':True, 'restored_payload_unchanged':True,
              'new_blender_or_browser_execution':False, 'approved':False, 'gameIntegrated':False}
    if receipt:
        receipt.parent.mkdir(parents=True,exist_ok=True)
        receipt.open('x',encoding='utf-8').write(json.dumps(result,indent=2)+'\n')
    return result

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source',type=pathlib.Path,default=pathlib.Path(__file__).resolve().parent.parent)
    parser.add_argument('--out-dir',type=pathlib.Path,required=True)
    parser.add_argument('--receipt',type=pathlib.Path)
    parser.add_argument('--verify-models',action='store_true')
    parser.add_argument('--verify-source-gate',action='store_true',help='Requires NumPy installed; no generation or Blender run.')
    args = parser.parse_args()
    print(json.dumps(restore(args.source,args.out_dir,args.receipt,args.verify_models,args.verify_source_gate),indent=2))

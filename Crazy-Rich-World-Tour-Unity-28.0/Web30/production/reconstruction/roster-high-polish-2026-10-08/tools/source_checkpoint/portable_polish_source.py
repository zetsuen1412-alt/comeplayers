"""Standard-library integrity helpers for the incremental HIGH-polish source."""
import sys
sys.dont_write_bytecode = True
import hashlib
import json
import os
import pathlib
import subprocess

PART_BYTES = 22_000_000
BASE_INVENTORY = '25c05d65bc7cb7e986f8dbd1191570a340c7f4a78679c3e9f3cc0a12e02b1798'
BASE_MODEL = 'e88b27e4a71058a4576fb4ab1b3d6d24a621d771175ce700a9a3e959729daf52'
SOURCE_SCHEMA = 'crwt.alexia_high_polish_source_inventory.v1'
LAYOUT_SCHEMA = 'crwt.alexia_high_polish_source_layout.v1'
PAYLOAD_SCHEMA = 'crwt.alexia_high_polish_source_payload.v1'


def need(ok, message):
    if not ok:
        raise ValueError(message)


def safe(name):
    need(isinstance(name, str) and name and
         not any(ord(c) < 32 or c in '\\:<>"|?*' for c in name), 'Unsafe relative path')
    parts = name.split('/')
    forbidden = {'con', 'prn', 'aux', 'nul', *('com' + str(i) for i in range(1, 10)),
                 *('lpt' + str(i) for i in range(1, 10))}
    need(not pathlib.PurePosixPath(name).is_absolute() and
         all(p not in ('', '.', '..') and not p.endswith((' ', '.')) and
             p.split('.')[0].casefold() not in forbidden for p in parts), 'Unsafe Windows path: ' + name)
    need(not any(p in ('.git', '__pycache__', 'node_modules') for p in parts) and
         pathlib.PurePosixPath(name).suffix.lower() not in ('.pyc', '.pyo'), 'Cache/repository payload')
    return name.casefold()


def hashes(raw):
    return {'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(),
            'git_blob_sha1': hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()}


def scan(root):
    result, seen = {}, set()
    for path in sorted(root.rglob('*')):
        need(not path.is_symlink() and not getattr(path, 'is_junction', lambda: False)(), 'No payload links')
        if not path.is_file():
            continue
        name = path.relative_to(root).as_posix()
        key = safe(name)
        need(key not in seen, 'Case-colliding payload path')
        seen.add(key)
        result[name] = hashes(path.read_bytes())
    return result


def stamps(root):
    return {p.relative_to(root).as_posix(): p.stat().st_mtime_ns for p in root.rglob('*') if p.is_file()}


def read_json(path):
    return json.loads(path.read_bytes())


def put(path, raw):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.open('xb').write(raw)


def write_json(path, value):
    put(path, (json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + '\n').encode('utf-8'))


def fresh(path, *protected):
    path = path.resolve()
    need(not path.exists(), 'Fresh destination required: ' + str(path))
    for other in protected:
        other = other.resolve()
        need(not path.is_relative_to(other) and not other.is_relative_to(path), 'Destination overlaps an input')
    return path


def command(argv, label):
    env = os.environ.copy()
    env['PYTHONDONTWRITEBYTECODE'] = '1'
    if os.name == 'nt' and len(argv) > 2 and pathlib.Path(str(argv[2])).suffix == '.py':
        directory = str(pathlib.Path(str(argv[2])).resolve().parent)
        prefix = chr(92) * 2 + '?' + chr(92)
        extended = directory if directory.startswith(prefix) else prefix + ('UNC' + directory[1:] if directory.startswith(chr(92) * 2) else directory)
        env['PYTHONPATH'] = extended + (os.pathsep + env['PYTHONPATH'] if env.get('PYTHONPATH') else '')
    run = subprocess.run([str(x) for x in argv], capture_output=True, env=env)
    need(run.returncode == 0, label + ' failed: ' + (run.stdout + run.stderr).decode('utf-8', 'replace')[-4500:])
    return {'check': label, 'passed': True}


def checked_inventory(root, expected_sha=None, schema=SOURCE_SCHEMA):
    inventory_path = root / 'source-inventory.json'
    inventory_pin = hashes(inventory_path.read_bytes())
    need(expected_sha is None or inventory_pin['sha256'] == expected_sha, 'Pinned source inventory differs')
    doc = read_json(inventory_path)
    need(doc['schema'] == schema and doc['approved'] is False and doc['gameIntegrated'] is False, 'Source inventory schema/flags')
    expected, keys = {}, set()
    for row in doc['files']:
        name, key = row['path'], safe(row['path'])
        need(key not in keys and name != 'source-inventory.json' and row['mode'] == '100644', 'Source inventory uniqueness/self/mode')
        keys.add(key)
        expected[name] = {k: row[k] for k in ('bytes', 'sha256', 'git_blob_sha1')}
    actual = scan(root)
    need(actual.pop('source-inventory.json') == inventory_pin and actual == expected, 'Actual complete source inventory differs')
    return expected, inventory_pin


def baseline_catalog(root):
    checked_inventory(root, BASE_INVENTORY, 'crwt.alexia_high_visual_source_inventory.v1')
    payload = read_json(root / 'review-payload.json')
    need(payload['schema'] == 'crwt.alexia_high_visual_source_payload.v1', 'Frozen HIGH payload schema')
    rows = {r['path']: {k: r[k] for k in ('bytes', 'sha256', 'git_blob_sha1')} for r in payload['files']}
    need(len(rows) == len(payload['files']) and rows['viewer/models/alexia.glb']['sha256'] == BASE_MODEL,
         'Pinned HIGH e88 payload differs')
    return rows


def restore_baseline(source, output, receipt, legacy_side_source=None):
    baseline_catalog(source)
    # This is the lossless byte restore, not run_high_visual_source_checks.py
    # or rebuild_high_visual.py. No old authoring recipe is invoked.
    argv = [sys.executable, '-B', source / 'tools/source_checkpoint/restore_high_visual.py',
            '--source', source, '--out-dir', output, '--receipt', receipt]
    if legacy_side_source is not None:
        argv += ['--baseline-source', legacy_side_source]
    command(argv, 'pinned HIGH byte restoration only')
    result = read_json(receipt)
    need(result['passed'] is True and result['candidate_sha256'] == BASE_MODEL and
         result['source_inventory_sha256'] == BASE_INVENTORY and result['payload_files_restored'] == 169,
         'Actual baseline restoration receipt differs')
    need(scan(output) == baseline_catalog(source), 'Actual HIGH restored byte catalog differs')
    return result

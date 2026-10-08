"""Plan/build an additive incremental HIGH-polish Git source payload.

No Git/network/CI operation. Unchanged payload bytes are mapped by SHA to the
pinned HIGH byte restore. Changed GLB/native data use <=22MB gzip parts. Large
offline HTML is regenerated rather than stored. Default is a read-only plan.
"""
import sys
sys.dont_write_bytecode = True
import argparse
import gzip
import io
import pathlib
import tempfile
from portable_polish_source import *

HERE = pathlib.Path(__file__).resolve().parent
TOOLS = ('portable_polish_source.py', 'restore_high_polish.py', 'prepare_high_polish_source.py')
PREFIX = 'Crazy-Rich-World-Tour-Unity-28.0/Web30/production/reconstruction/roster-high-polish-2026-10-08'


def pack(raw):
    buffer = io.BytesIO()
    with gzip.GzipFile(filename='', mode='wb', fileobj=buffer, mtime=0, compresslevel=9) as stream:
        stream.write(raw)
    result = buffer.getvalue()
    need(gzip.decompress(result) == raw, 'Actual gzip roundtrip differs')
    return result


def receipt_policy(raw, pin):
    document = json.loads(raw.decode('utf-8'))
    lf = (json.dumps(document, ensure_ascii=False, indent=2, allow_nan=False) + '\n').encode('utf-8')
    crlf = lf.replace(b'\n', b'\r\n')
    need(raw in (lf, crlf), 'Final gallery receipt is not declared canonical JSON LF/CRLF')
    semantic = json.dumps(document, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False).encode('utf-8')
    return {'schema': 'crwt.polish_gallery_receipt_serialization.v1',
            'canonical_line_ending': 'LF' if raw == lf else 'CRLF',
            'accepted_generated_line_endings': ['LF', 'CRLF'],
            'canonical_document_sha256': hashes(semantic)['sha256'], 'canonical_pin': pin}


def prepare(payload, output, baseline, execute=False, legacy_side_source=None, verify_delta=False):
    payload = payload.resolve(strict=True)
    baseline = baseline.resolve(strict=True)
    output = fresh(output, payload, baseline)
    actual, source_stamps = scan(payload), stamps(payload)
    base = baseline_catalog(baseline)
    base_before, base_stamps = scan(baseline), stamps(baseline)
    manifest = read_json(payload / 'review-manifest.json')
    old_manifest = read_json(baseline / 'review-manifest.json')
    need(manifest['schema'] == 'crwt.alexia_high_polish_review.v1' and
         manifest['approved'] is False and manifest['gameIntegrated'] is False,
         'Final selected HIGH-polish review schema/flags')
    models, oldmodels = ({row['id']: row for row in doc['models']} for doc in (manifest, old_manifest))
    need(len(models) == 10 and set(models) == set(oldmodels), 'Actual ten baseline roster entries')
    for name, row in models.items():
        need(actual[row['path']]['sha256'] == row['sha256'], 'Actual model manifest SHA differs')
        if name != 'alexia':
            need(row['sha256'] == oldmodels[name]['sha256'], 'One of nine other model bytes changed')
    for name, pin in base.items():
        protected = name.startswith('references/') or any(name.startswith('renders/' + key + '/') for key in oldmodels if key != 'alexia')
        if protected:
            need(actual.get(name) == pin, 'Old reference/non-Alexia render or proof differs: ' + name)
    html = 'BUKA-REVIEW-MODEL.html'
    viewer_receipt = 'BUKA-REVIEW-MODEL.viewer-receipt.json'
    need(all(name in actual for name in (html, viewer_receipt, 'viewer/build_offline_gallery.py',
                                        'review-manifest.json', 'evidence/native-review.json',
                                        'verify_actual_checkpoint.py', 'evidence/source-gate-replay.json')),
         'Complete actual gallery/native/selected source-gate payload required')
    contract = read_json(payload / 'evidence/selected-alexia/selected-delta.json')
    need(contract['schema'] == 'crwt.alexia_high_polish_selected_delta.v1' and
         contract['selected'] is True and contract['source_sha256'] == BASE_MODEL and
         contract['candidate_sha256'] == models['alexia']['sha256'] and
         [row['id'] for row in contract['steps']] == ['hair', 'temple', 'shirt'],
         'Actual selected e88-only three-delta contract required')
    for row in contract['inputs']:
        need(row['path'] in actual and actual[row['path']]['sha256'] == row['sha256'], 'Actual delta input pin differs')
    bysha = {}
    for name, pin in sorted(base.items()):
        bysha.setdefault((pin['sha256'], pin['bytes']), name)
    rows, counts = [], {'baseline': 0, 'direct': 0, 'gzip-parts': 0, 'gallery-generated': 0}
    for name, pin in sorted(actual.items()):
        row = {'path': name, **pin}
        if name in (html, viewer_receipt):
            row['encoding'] = 'gallery-generated'
        elif (pin['sha256'], pin['bytes']) in bysha:
            row.update(encoding='baseline', baseline_path=bysha[(pin['sha256'], pin['bytes'])])
        elif pathlib.PurePosixPath(name).suffix.lower() in ('.glb', '.blend'):
            row['encoding'] = 'gzip-parts'
        else:
            need(pin['bytes'] <= PART_BYTES, 'Unexpected large direct payload: ' + name)
            row.update(encoding='direct', source=name)
        counts[row['encoding']] += 1
        rows.append(row)
    plan = {'schema': 'crwt.alexia_high_polish_source_plan.v1', 'preflight_passed': True,
            'candidate_sha256': models['alexia']['sha256'], 'baseline_inventory_sha256': BASE_INVENTORY,
            'baseline_selected_model_sha256': BASE_MODEL, 'payload_files': len(actual),
            'encoding_counts': counts, 'old_nine_models_references_45renders_and_proofs_exact': True,
            'old_nine_stage_chain_replayed': False, 'new_authoring_delta_steps': 3,
            'Git_prefix': PREFIX, 'source_output': str(output), 'executed': False,
            'Git_writes': False, 'CI_executed_or_claimed': False}
    if not execute:
        return plan
    need(all((HERE / name).is_file() for name in TOOLS), 'New incremental source tools missing')
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='crwt-polish-source-prep-', dir=output.parent) as directory:
        temp = pathlib.Path(directory).resolve()
        need(temp.is_relative_to(output.parent.resolve()) and temp != output.parent.resolve(), 'Temporary path escaped')
        old = temp / 'old-high'
        restore_baseline(baseline, old, temp / 'old-high-restore.json', legacy_side_source)
        old_before, old_stamps = scan(old), stamps(old)
        output.mkdir()
        stored = {}
        for row in rows:
            name, kind = row['path'], row['encoding']
            if kind == 'baseline':
                need(hashes((old / row['baseline_path']).read_bytes()) == actual[name], 'Actual restored HIGH reference differs')
            elif kind == 'direct':
                put(output / row['source'], (payload / name).read_bytes())
            elif kind == 'gzip-parts':
                key = row['sha256']
                if key not in stored:
                    packed = pack((payload / name).read_bytes())
                    parts = []
                    for index, start in enumerate(range(0, len(packed), PART_BYTES), 1):
                        part = f'storage/{key}.gz.part-{index:02d}'
                        put(output / part, packed[start:start + PART_BYTES])
                        parts.append(part)
                    stored[key] = (parts, hashes(packed))
                row.update(parts=stored[key][0], stored_pin=stored[key][1])
        for name in TOOLS:
            put(output / 'tools/source_checkpoint' / name, (HERE / name).read_bytes())
        write_json(output / 'review-payload.json', {'schema': PAYLOAD_SCHEMA,
                    'files': [{'path': name, **pin} for name, pin in sorted(actual.items())],
                    'approved': False, 'gameIntegrated': False})
        layout = {'schema': LAYOUT_SCHEMA, 'candidate_sha256': models['alexia']['sha256'],
                  'baseline_directory': baseline.name, 'baseline_inventory_sha256': BASE_INVENTORY,
                  'baseline_selected_model_sha256': BASE_MODEL, 'files': rows,
                  'gallery': {'html_path': html, 'receipt_path': viewer_receipt,
                              'builder_path': 'viewer/build_offline_gallery.py', 'manifest_path': 'review-manifest.json',
                              'receipt_line_ending_policy': receipt_policy((payload / viewer_receipt).read_bytes(), actual[viewer_receipt])},
                  'old_nine_stage_chain_replayed': False, 'approved': False, 'gameIntegrated': False}
        write_json(output / 'source-layout.json', layout)
        readme = '''# Incremental HIGH-polish source\n\nKeep the pinned sibling `roster-high-visual-2026-10-08` and its older\n`roster-side-quality-2026-10-08` source directory. The HIGH inventory SHA is\n`25c05d65bc7cb7e986f8dbd1191570a340c7f4a78679c3e9f3cc0a12e02b1798`.\nThis command restores reviewed bytes and validates all ten models, image magic\nand actual native nineteen-bone/two-action build/reopen evidence using stdlib:\n\n```text\npython -B tools/source_checkpoint/restore_high_polish.py --source . --out-dir ../CRWT-POLISH-restored --receipt ../CRWT-POLISH-restore-proof.json --verify-models\n```\n\nUnchanged files reuse exact HIGH byte materialization. No old nine-step model\nauthoring recipe is invoked. New GLB/native data use gzip parts <=22,000,000 B.\nOffline HTML and JSON receipt are regenerated to the declared exact byte pins.\nThe restored review contains its frozen e88 model and independent selected\nhair→original temple-material partition→shirt delta contract. To run the three\nnew recipes and independent source check as an OPTIONAL extra, add\n`--verify-delta` (requires NumPy). Its SHA comparisons must actually pass on\nthe runtime used; no cross-platform/hosted CI success is assumed.\n\nNo new Blender/browser/render/Git action occurs during source restoration.\nNative proof checks refer to the actual earlier saved/read-only reopened file.\nIdleBreath/Walk remain manual prototype motion; no production game integration\nor global CI approval is claimed. Use fresh external output/receipt paths.\n'''
        put(output / 'SOURCE-README.md', readme.encode('utf-8'))
        source_files = scan(output)
        write_json(output / 'source-inventory.json', {'schema': SOURCE_SCHEMA,
                    'files': [{'path': name, **pin, 'mode': '100644'} for name, pin in sorted(source_files.items())],
                    'approved': False, 'gameIntegrated': False})
        from restore_high_polish import restore
        restored = restore(output, temp / 'new-restored-review', baseline, temp / 'new-restore-proof.json',
                           True, verify_delta, legacy_side_source)
        need(scan(payload) == actual and stamps(payload) == source_stamps and
             scan(old) == old_before and stamps(old) == old_stamps and
             scan(baseline) == base_before and stamps(baseline) == base_stamps,
             'Source preparation changed frozen review/HIGH inputs')
        plan.update(executed=True, source_files=len(source_files),
                    source_inventory_sha256=hashes((output / 'source-inventory.json').read_bytes())['sha256'],
                    actual_full_byte_restore_passed=restored['passed'], actual_ten_models_native_evidence_checked=True,
                    actual_new_three_delta_replay_checked=restored['new_delta_replay_checked'],
                    all_input_SHA_mtime_unchanged=True)
    return plan


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--payload', required=True, type=pathlib.Path)
    parser.add_argument('--source-output', required=True, type=pathlib.Path)
    parser.add_argument('--baseline-source', required=True, type=pathlib.Path)
    parser.add_argument('--legacy-side-source', type=pathlib.Path)
    parser.add_argument('--execute', action='store_true')
    parser.add_argument('--verify-delta', action='store_true')
    parser.add_argument('--receipt', type=pathlib.Path)
    args = parser.parse_args()
    result = prepare(args.payload, args.source_output, args.baseline_source, args.execute,
                     args.legacy_side_source, args.verify_delta)
    if args.receipt:
        write_json(fresh(args.receipt, args.payload, args.source_output, args.baseline_source), result)
    print(json.dumps(result, indent=2))

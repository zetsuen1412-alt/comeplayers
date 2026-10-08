"""Restore exact HIGH-polish review bytes; never replay the old nine recipes.

Standard library restore/all-ten/native evidence validation. --verify-delta is
separate optional NumPy authoring validation of only the three new e88 deltas.
"""
import sys
sys.dont_write_bytecode = True
import argparse
import gzip
import importlib.util
import os
import pathlib
import tempfile
if os.name == 'nt':
    directory = str(pathlib.Path(__file__).resolve().parent)
    prefix = chr(92) * 2 + '?' + chr(92)
    sys.path.insert(0, directory if directory.startswith(prefix) else prefix + ('UNC' + directory[1:] if directory.startswith(chr(92) * 2) else directory))
from portable_polish_source import *


def canonical_gallery_receipt(path, expected, policy):
    need(policy['schema'] == 'crwt.polish_gallery_receipt_serialization.v1' and
         policy['canonical_line_ending'] in ('LF', 'CRLF') and
         policy['accepted_generated_line_endings'] == ['LF', 'CRLF'], 'Declared LF/CRLF JSON receipt policy required')
    raw = path.read_bytes()
    document = json.loads(raw.decode('utf-8'), parse_constant=lambda _: (_ for _ in ()).throw(ValueError('Nonfinite JSON receipt')))
    semantic = json.dumps(document, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False).encode('utf-8')
    need(hashes(semantic)['sha256'] == policy['canonical_document_sha256'], 'Gallery receipt JSON semantics differ')
    lf = (json.dumps(document, ensure_ascii=False, indent=2, allow_nan=False) + '\n').encode('utf-8')
    crlf = lf.replace(b'\n', b'\r\n')
    need(raw in (lf, crlf), 'Unexpected generated receipt whitespace/BOM/mixed endings')
    target = lf if policy['canonical_line_ending'] == 'LF' else crlf
    need(hashes(target) == expected and policy['canonical_pin'] == expected, 'Canonical receipt bytes/pin differ')
    if raw != target:
        path.write_bytes(target)
    return {'canonical_line_ending': policy['canonical_line_ending'], 'JSON_document_unchanged': True,
            'line_ending_normalization_applied': raw != target, 'canonical_sha256': expected['sha256']}


def restore(source, output, baseline=None, receipt=None, verify_models=False,
            verify_delta=False, legacy_side_source=None):
    source = source.resolve(strict=True)
    pins, inventory_pin = checked_inventory(source)
    source_stamps = stamps(source)
    layout = read_json(source / 'source-layout.json')
    payload = read_json(source / 'review-payload.json')
    need(layout['schema'] == LAYOUT_SCHEMA and payload['schema'] == PAYLOAD_SCHEMA and
         layout['baseline_inventory_sha256'] == BASE_INVENTORY and
         layout['baseline_selected_model_sha256'] == BASE_MODEL, 'Pinned incremental layout/payload contract differs')
    baseline = (baseline or source.parent / layout['baseline_directory']).resolve(strict=True)
    basepins = baseline_catalog(baseline)
    base_before, base_stamps = scan(baseline), stamps(baseline)
    output = fresh(output, source, baseline)
    if receipt:
        receipt = fresh(receipt, source, baseline, output)
    expected = {row['path']: {k: row[k] for k in ('bytes', 'sha256', 'git_blob_sha1')} for row in payload['files']}
    rows = layout['files']
    need(len(rows) == len(expected) == len(payload['files']) and
         len({safe(row['path']) for row in rows}) == len(rows) and
         {row['path'] for row in rows} == set(expected) and
         all({k: row[k] for k in ('bytes', 'sha256', 'git_blob_sha1')} == expected[row['path']] for row in rows),
         'Exact complete unique restore mapping required')
    output.parent.mkdir(parents=True, exist_ok=True)
    checks = []
    with tempfile.TemporaryDirectory(prefix='crwt-polish-baseline-', dir=output.parent) as name:
        temp = pathlib.Path(name).resolve()
        need(temp.is_relative_to(output.parent.resolve()) and temp != output.parent.resolve(), 'Temporary cleanup path escaped')
        old = temp / 'review'
        baseline_result = restore_baseline(baseline, old, temp / 'baseline-restore.json', legacy_side_source)
        oldpins, old_stamps = scan(old), stamps(old)
        output.mkdir()
        generated = []
        for row in rows:
            destination = output / row['path']
            need(destination.resolve().is_relative_to(output), 'Restore path escaped')
            kind = row['encoding']
            if kind == 'gallery-generated':
                generated.append(row)
                continue
            if kind == 'baseline':
                name = row['baseline_path']
                safe(name)
                need(basepins.get(name) == expected[row['path']], 'Referenced frozen HIGH bytes differ')
                raw = (old / name).read_bytes()
            elif kind == 'direct':
                name = row['source']
                safe(name)
                need(name in pins, 'Direct source payload is unpinned')
                raw = (source / name).read_bytes()
            elif kind == 'gzip-parts':
                parts = row['parts']
                need(parts and len(parts) == len({safe(p) for p in parts}), 'Unique bounded gzip parts required')
                need(all(p in pins and pins[p]['bytes'] <= PART_BYTES for p in parts), 'Gzip part pin or size differs')
                packed = b''.join((source / part).read_bytes() for part in parts)
                need(hashes(packed) == row['stored_pin'], 'Concatenated gzip bytes differ')
                raw = gzip.decompress(packed)
            else:
                raise ValueError('Unknown payload encoding: ' + str(kind))
            need(hashes(raw) == expected[row['path']], 'Restored bytes differ: ' + row['path'])
            put(destination, raw)
        gallery = layout['gallery']
        need({row['path'] for row in generated} == {gallery['html_path'], gallery['receipt_path']}, 'Only gallery HTML/receipt may be generated')
        before_generation, generation_stamps = scan(output), stamps(output)
        checks.append(command([sys.executable, '-B', output / gallery['builder_path'], '--manifest',
                               output / gallery['manifest_path'], '--output', output / gallery['html_path'],
                               '--expected-output-sha256', expected[gallery['html_path']]['sha256']], 'delivered offline gallery regeneration'))
        serialization = canonical_gallery_receipt(output / gallery['receipt_path'], expected[gallery['receipt_path']], gallery['receipt_line_ending_policy'])
        need(scan(output) == expected and all(hashes((output / n).read_bytes()) == pin and
             (output / n).stat().st_mtime_ns == generation_stamps[n] for n, pin in before_generation.items()),
             'Gallery generation altered payload inputs')
        model_check = None
        if verify_models:
            verifier_path = output / 'verify_actual_checkpoint.py'
            spec = importlib.util.spec_from_file_location('polish_delivered_actual_assets', verifier_path)
            verifier = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(verifier)
            model_check = verifier.actual_assets(lambda name: (output / name).read_bytes())
            for name in expected:
                if name.lower().endswith(('.png', '.jpg', '.jpeg')):
                    with (output / name).open('rb') as stream:
                        verifier.image_magic(name, stream.read(8))
            need(model_check['models_checked'] == 10 and model_check['candidate_sha256'] == layout['candidate_sha256'] and
                 model_check['actual_alexia_clip_names'] == ['IdleBreath', 'Walk'] and
                 model_check['native_build_and_readonly_reopen_bindings_valid'] is True,
                 'Actual ten-model/native/clip source validation differs')
        delta = None
        if verify_delta:
            descriptor = read_json(output / 'evidence/source-gate-replay.json')
            tool = descriptor['tool_path']
            safe(tool)
            need(hashes((output / tool).read_bytes())['sha256'] == descriptor['tool_sha256'], 'Delivered delta gate helper differs')
            gate_receipt = fresh(output.parent / (output.name + '-delta-source-gate.json'), source, baseline, output)
            need(sum('{receipt}' in arg for arg in descriptor['argv']) == 1, 'One fresh gate receipt required')
            argv = [arg.replace('{root}', str(output)).replace('{receipt}', str(gate_receipt)) for arg in descriptor['argv']]
            checks.append(command([sys.executable, '-B', output / tool, *argv], 'actual new three-delta source gate'))
            delta = read_json(gate_receipt)
            need(delta['passed'] is True and delta['candidate_sha256'] == layout['candidate_sha256'] and
                 delta['actual_delta_steps'] == 3 and delta['old_nine_stage_chain_replayed'] is False,
                 'Actual new delta gate receipt differs')
        need(scan(output) == expected and scan(old) == oldpins and stamps(old) == old_stamps, 'Validators altered restored review/baseline')
    need(checked_inventory(source) == (pins, inventory_pin) and stamps(source) == source_stamps and
         scan(baseline) == base_before and stamps(baseline) == base_stamps, 'Frozen source inputs changed during restoration')
    result = {'schema': 'crwt.alexia_high_polish_source_restore.v1', 'passed': True,
              'candidate_sha256': layout['candidate_sha256'], 'source_inventory_sha256': inventory_pin['sha256'],
              'baseline_inventory_sha256': BASE_INVENTORY, 'payload_files_restored': len(expected),
              'all_payload_SHA_git_blob_bytes_exact': True, 'gallery_regenerated_byte_exact': True,
              'gallery_receipt_serialization': serialization, 'checks': checks,
              'actual_models_and_native_evidence': model_check, 'new_delta_replay_checked': delta is not None,
              'old_nine_stage_chain_replayed': False, 'baseline_restoration_only': baseline_result['passed'],
              'all_source_input_SHA_mtime_unchanged': True, 'new_Blender_or_browser_execution': False,
              'Git_writes': False, 'approved': False, 'gameIntegrated': False}
    if receipt:
        write_json(receipt, result)
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=pathlib.Path, default=pathlib.Path(__file__).resolve().parents[2])
    parser.add_argument('--baseline-source', type=pathlib.Path)
    parser.add_argument('--legacy-side-source', type=pathlib.Path)
    parser.add_argument('--out-dir', type=pathlib.Path, required=True)
    parser.add_argument('--receipt', type=pathlib.Path)
    parser.add_argument('--verify-models', action='store_true')
    parser.add_argument('--verify-delta', action='store_true')
    args = parser.parse_args()
    print(json.dumps(restore(args.source, args.out_dir, args.baseline_source, args.receipt,
                             args.verify_models, args.verify_delta, args.legacy_side_source), indent=2))

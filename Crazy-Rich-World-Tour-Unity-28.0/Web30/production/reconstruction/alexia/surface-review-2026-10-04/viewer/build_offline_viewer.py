#!/usr/bin/env python3
"""Build a standalone, offline Three.js viewer from actual embedded GLB files.

Python 3.10+, standard library. Reads models/vendor files without editing them.
Example:
  python build_offline_viewer.py --vendor path/to/vendor/three \
    --original original.glb --projection projection.glb --output inspection.html
Optional --cleanup adds a separately identified, unapproved cleanup candidate.
"""
import argparse
import base64
import hashlib
import json
import pathlib
import re
import struct
import zlib


VENDOR_PATHS = {'core': 'build/three.core.js', 'three': 'build/three.module.js',
                'utils': 'examples/jsm/utils/BufferGeometryUtils.js',
                'orbit': 'examples/jsm/controls/OrbitControls.js',
                'loader': 'examples/jsm/loaders/GLTFLoader.js'}
EXPECTED_VENDOR_SHA256 = {
    'build/three.core.js': 'eb077d2417f61d3e6d9264c317cabc4ea35769ed6b0ab533067292a550784c20',
    'build/three.module.js': 'c8211c69345d2e9949dc7a8ac969380497aa0600a5a8ac6a459c8cd02dd9cb8a',
    'examples/jsm/utils/BufferGeometryUtils.js': 'fda7e946b8e0b5ab39b779206589e7a1079a22eb24efb89d7223e03fdfb1f751',
    'examples/jsm/controls/OrbitControls.js': 'b97879c748170baadeb3fb84cea1ffdf4674e283dc06042f34e2acb95a76042c',
    'examples/jsm/loaders/GLTFLoader.js': '67ac5551fdafa6e349bd80c8f8e5e39c136d6b2fb1ad647db9abb21dc86f9e4a',
    'LICENSE': 'bfe119ea4fd413f5f7ca3fcd63adb0c4a073ed39daa2fe7d3e6b769e21272601'
}
MAX_VENDOR_BYTES = 4 * 1024 * 1024


def verify_vendor_bytes(relative, raw):
    if relative not in EXPECTED_VENDOR_SHA256:
        raise ValueError('Unexpected vendor path: ' + relative)
    if len(raw) > MAX_VENDOR_BYTES:
        raise ValueError('Vendor file exceeds size limit: ' + relative)
    if hashlib.sha256(raw).hexdigest() != EXPECTED_VENDOR_SHA256[relative]:
        raise ValueError('Vendor does not match frozen Three.js r180: ' + relative)
    raw.decode('utf-8')
    return raw


def read_vendor_directory(directory):
    directory = directory.resolve()
    contents = {}
    for relative in EXPECTED_VENDOR_SHA256:
        path = directory.joinpath(*pathlib.PurePosixPath(relative).parts).resolve()
        if not path.is_relative_to(directory):
            raise ValueError('Vendor file resolves outside vendor directory')
        contents[relative] = verify_vendor_bytes(relative, path.read_bytes())
    return contents


def read_vendor_bundle(path):
    bundle = json.loads(path.read_text(encoding='utf-8'))
    if bundle.get('schema') != 'crwt.three.vendor.bundle.v1' or bundle.get('three_revision') != '180':
        raise ValueError('Unsupported frozen vendor bundle')
    entries = bundle.get('files')
    if not isinstance(entries, list) or len(entries) != len(EXPECTED_VENDOR_SHA256):
        raise ValueError('Vendor bundle must contain exactly five modules and LICENSE')
    names = [entry['path'] for entry in entries]
    if len(set(names)) != len(names) or set(names) != set(EXPECTED_VENDOR_SHA256):
        raise ValueError('Vendor bundle has duplicate, missing or unexpected paths')
    contents = {}
    for entry in entries:
        relative, count = entry['path'], entry['bytes']
        if not isinstance(count, int) or isinstance(count, bool) or not 0 < count <= MAX_VENDOR_BYTES:
            raise ValueError('Invalid vendor file size: ' + relative)
        if entry.get('sha256') != EXPECTED_VENDOR_SHA256[relative]:
            raise ValueError('Vendor bundle recorded hash does not match frozen source: ' + relative)
        encoded = entry['zlib_base64']
        if not isinstance(encoded, str) or len(encoded) > MAX_VENDOR_BYTES * 2:
            raise ValueError('Invalid compressed vendor data size: ' + relative)
        compressed = base64.b64decode(encoded, validate=True)
        decoder = zlib.decompressobj()
        raw = decoder.decompress(compressed, count + 1)
        if len(raw) != count or not decoder.eof or decoder.unused_data or decoder.unconsumed_tail:
            raise ValueError('Compressed vendor size/stream mismatch: ' + relative)
        contents[relative] = verify_vendor_bytes(relative, raw)
    return contents


def b64(data):
    return base64.b64encode(data).decode('ascii')


def inspect_glb(path, key, label, note):
    raw = path.read_bytes()
    if len(raw) < 20 or struct.unpack_from('<4sII', raw, 0) != (b'glTF', 2, len(raw)):
        raise ValueError('Invalid GLB header: ' + str(path))
    json_bytes, chunk_type = struct.unpack_from('<II', raw, 12)
    if chunk_type != 0x4e4f534a or 20 + json_bytes > len(raw):
        raise ValueError('Invalid GLB JSON: ' + str(path))
    doc = json.loads(raw[20:20 + json_bytes])
    for resource in doc.get('buffers', []) + doc.get('images', []):
        if resource.get('uri') and not resource['uri'].startswith('data:'):
            raise ValueError('External resource is not offline: ' + str(path))
    faces, position_accessors = 0, set()
    for mesh in doc.get('meshes', []):
        for primitive in mesh.get('primitives', []):
            if primitive.get('mode', 4) != 4:
                raise ValueError('Viewer requires triangle primitives: ' + str(path))
            position = primitive['attributes']['POSITION']
            position_accessors.add(position)
            count = doc['accessors'][primitive.get('indices', position)]['count']
            if count % 3:
                raise ValueError('Non-triangle index count: ' + str(path))
            faces += count // 3
    return {'id': key, 'label': label, 'filename': path.name, 'bytes': len(raw),
            'sha256': hashlib.sha256(raw).hexdigest(), 'faces': faces,
            'vertices': sum(doc['accessors'][i]['count'] for i in position_accessors),
            'skins': len(doc.get('skins', [])), 'animations': len(doc.get('animations', [])),
            'images': len(doc.get('images', [])), 'note': note,
            'visualApproved': False, 'gameIntegrated': False, 'encoding': 'zlib', 'base64': b64(zlib.compress(raw, 9))}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    vendor_source = parser.add_mutually_exclusive_group(required=True)
    vendor_source.add_argument('--vendor', type=pathlib.Path)
    vendor_source.add_argument('--vendor-bundle', type=pathlib.Path)
    parser.add_argument('--original', required=True, type=pathlib.Path)
    parser.add_argument('--projection', required=True, type=pathlib.Path)
    parser.add_argument('--cleanup', type=pathlib.Path)
    parser.add_argument('--cleanup-note', default='Kandidat pembersihan terpisah. Periksa bukti penghapusan komponen dan bandingkan semua sisi dengan V11 asli; belum disetujui atau dipasang ke game.')
    parser.add_argument('--output', required=True, type=pathlib.Path)
    parser.add_argument('--reference-v2', required=True, type=pathlib.Path)
    parser.add_argument('--expected-output-sha256', help='Fail before writing if generated HTML differs from the expected hash')
    args = parser.parse_args()
    if args.output.suffix.lower() != '.html':
        raise ValueError('Viewer output must have .html extension')
    protected = [args.original, args.projection, args.reference_v2] + ([args.cleanup] if args.cleanup else []) + ([args.vendor_bundle] if args.vendor_bundle else [])
    if args.output.resolve() in [p.resolve() for p in protected]:
        raise ValueError('Viewer output would overwrite a source model')
    if args.expected_output_sha256 and not re.fullmatch('[0-9a-f]{64}', args.expected_output_sha256):
        raise ValueError('Expected output hash must be lowercase SHA-256 hex')
    raw_vendors = read_vendor_bundle(args.vendor_bundle) if args.vendor_bundle else read_vendor_directory(args.vendor)
    reference = args.reference_v2.read_bytes()
    reference_sha = hashlib.sha256(reference).hexdigest()
    if reference_sha != '935b1f8f7d2be4a6a453a089041844f2cd4470eb64be17d9d72568efb3708933':
        raise ValueError('Reference differs from the preserved Alexia blue V2 source')
    vendors, vendor_hashes = {}, {}
    for key, relative in VENDOR_PATHS.items():
        raw = raw_vendors[relative]
        vendors[key] = b64(raw)
        vendor_hashes[relative] = hashlib.sha256(raw).hexdigest()
    license_raw = raw_vendors['LICENSE']
    license_text = license_raw.decode('utf-8')
    if '-->' in license_text:
        raise ValueError('Unexpected HTML comment terminator in vendor license')
    vendor_hashes['LICENSE'] = hashlib.sha256(license_raw).hexdigest()
    models = [inspect_glb(args.original, 'original', 'V11 asli · geometri',
                         'Geometri V11 asli. Tanpa tekstur, rig, animasi atau persetujuan visual.'),
              inspect_glb(args.projection, 'projection', 'Interior bersih · proyeksi depan',
                         'Kandidat hasil pembersihan interior dengan proyeksi depan yang sama. Mata biru dan warna depan dipertahankan; sisi tersembunyi tetap abu-abu. Belum tekstur penuh atau rig.')]
    if args.cleanup:
        models.append(inspect_glb(args.cleanup, 'cleanup', 'Tiga fragmen luar · pembanding',
                                  args.cleanup_note))
    template_dir = pathlib.Path(__file__).resolve().parent
    template = (template_dir / 'viewer.html').read_text(encoding='utf-8')
    app = (template_dir / 'viewer.js').read_text(encoding='utf-8')
    payload = json.dumps({'models': models, 'vendor': vendors}, ensure_ascii=False).replace('</', '<\\/')
    rendered = template.replace('<!-- EMBEDDED_PAYLOAD -->', '<script type="application/json" id="payload">' + payload + '</script>')
    rendered = rendered.replace('<!-- VIEWER_APP -->', '<script type="module">\n' + app + '\n</script>')
    rendered = rendered.replace('<!-- THIRD_PARTY_LICENSE -->', '<!-- Three.js license\n' + license_text + '\n-->')
    rendered = rendered.replace('<!-- REFERENCE_V2 -->', '<img src="data:image/png;base64,' + b64(reference) + '" alt="Panduan Alexia V2 bermata biru dalam enam sudut, termasuk koper"/>')
    generated_hash = hashlib.sha256(rendered.encode('utf-8')).hexdigest()
    if args.expected_output_sha256 and generated_hash != args.expected_output_sha256:
        raise ValueError('Generated viewer SHA-256 differs from expected output: ' + generated_hash)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(rendered, encoding='utf-8', newline='\n')
    receipt = {'schema': 'crwt.offline_mesh_inspection.v1', 'viewer': args.output.name,
               'viewer_bytes': args.output.stat().st_size,
               'viewer_sha256': hashlib.sha256(args.output.read_bytes()).hexdigest(),
               'models': [{k: v for k, v in m.items() if k != 'base64'} for m in models],
               'vendor_sha256': vendor_hashes, 'requires_network': False,
               'source_files_edited': False, 'visual_approval': False, 'game_integration': False}
    receipt['reference'] = {'filename': args.reference_v2.name, 'sha256': reference_sha, 'bytes': len(reference), 'is_3d_mesh_approval': False}
    receipt_path = args.output.with_suffix('.viewer-receipt.json')
    receipt_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'viewer': str(args.output), 'bytes': receipt['viewer_bytes'],
                      'models': len(models), 'sha256': receipt['viewer_sha256'],
                      'receipt': str(receipt_path)}))


if __name__ == '__main__':
    main()

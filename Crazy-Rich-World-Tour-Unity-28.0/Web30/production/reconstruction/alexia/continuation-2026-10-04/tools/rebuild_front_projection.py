"""CPU-only, standard-library reconstruction of the frozen V11 front diagnostic.

This reproduces the existing unapproved diagnostic GLB byte for byte. It does
not recalculate visibility, infer texture, remesh, weld, remove components, or
change any game asset. The original GPU-selected face IDs are frozen in a
hash-pinned RLE manifest. Python 3.10+; no GPU, NumPy, or Pillow is required.
"""

import argparse
import copy
import hashlib
import json
import pathlib
import struct
import sys


EXPECTED_MESH_SHA = 'd0a0fea651079aa98d026a1610ef0a9e7f4c14c0c466cb1d949886df45c24a66'
EXPECTED_IMAGE_SHA = '1202424fc57571aaad7b7e1389d4de1ae7ba155c1ec113bd4425b5f05ab02928'
EXPECTED_SELECTION_SHA = 'e40c2db62e6089c289ac58b7a6252205ddb239d22ba797b16590b24223970f94'
EXPECTED_OUTPUT_SHA = '032e64c6adfd6367f2bc6a92f15adc3df10ba535b6dade9f46d9b251443cd200'
EXPECTED_UV_SHA = '5d54bdc8a18d1d32bbfb370a73b5ef242ec69e47817b42aa3c4ab67b6be2b9aa'
EXPECTED_POSITION_SHA = '416825b530ca4cdae092800cb917a2ffdbc5f30202f6621b58d5ce80219218e6'
EXPECTED_INDICES_SHA = 'e5a321d62cdacca1924f83c966dbba454cba7edcafa444d2fc320cfe1ba1c941'
VERTICES, FACES, SELECTED = 224713, 449582, 103443
IMAGE_SIZE = (584, 584)
REFERENCE_BOUNDS = (106, 18, 478, 567)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def read_glb(raw):
    require(len(raw) >= 28 and struct.unpack_from('<4sII', raw) == (b'glTF', 2, len(raw)),
            'Expected a complete GLB 2.0 binary.')
    doc, binary, offset = None, None, 12
    while offset < len(raw):
        require(offset + 8 <= len(raw), 'Truncated chunk header.')
        size, kind = struct.unpack_from('<II', raw, offset)
        offset += 8
        data = raw[offset:offset + size]
        require(len(data) == size, 'Truncated chunk data.')
        if kind == 0x4E4F534A:
            require(doc is None, 'Duplicate JSON chunk.')
            doc = json.loads(data.rstrip(b' \x00'))
        elif kind == 0x004E4942:
            require(binary is None, 'Duplicate BIN chunk.')
            binary = data
        else:
            raise ValueError('Unknown GLB chunk.')
        offset += size
    require(doc is not None and binary is not None, 'Missing embedded JSON/BIN.')
    require(len(doc.get('buffers', [])) == 1 and 'uri' not in doc['buffers'][0],
            'Expected a single embedded source buffer.')
    return doc, binary


def accessor_bytes(doc, binary, index):
    a = doc['accessors'][index]
    require('sparse' not in a and not a.get('normalized'), 'Unsupported accessor.')
    width = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3}[a['type']]
    require(a['componentType'] in (5125, 5126), 'Expected uint32/float32 V11 accessors.')
    view = doc['bufferViews'][a['bufferView']]
    require(view.get('buffer', 0) == 0 and view.get('byteStride', width * 4) == width * 4,
            'Expected packed embedded accessor.')
    start = view.get('byteOffset', 0) + a.get('byteOffset', 0)
    size = a['count'] * width * 4
    data = binary[start:start + size]
    require(len(data) == size, 'Accessor exceeds embedded buffer.')
    return data


def selection_runs(raw):
    require(digest(raw) == EXPECTED_SELECTION_SHA, 'Selection manifest hash mismatch.')
    selection = json.loads(raw)
    expected = {'schemaVersion': 1, 'sourceMeshSha256': EXPECTED_MESH_SHA,
                'referenceImageSha256': EXPECTED_IMAGE_SHA,
                'expectedOutputGlbSha256': EXPECTED_OUTPUT_SHA,
                'sourceVertexCount': VERTICES, 'sourceFaceCount': FACES,
                'selectedFaceCount': SELECTED, 'unknownGrayFaceCount': FACES - SELECTED,
                'referenceImageSize': list(IMAGE_SIZE),
                'referenceBoundsManual': list(REFERENCE_BOUNDS),
                'accepted': False, 'productionReady': False}
    for key, value in expected.items():
        require(selection.get(key) == value, 'Selection field mismatch: ' + key)
    runs, end, total = selection.get('projectedFaceRle'), 0, 0
    require(isinstance(runs, list) and runs, 'Missing face runs.')
    for run in runs:
        require(isinstance(run, list) and len(run) == 2
                and all(type(value) is int for value in run), 'Invalid face run.')
        start, count = run
        require(start >= end and count > 0 and start + count <= FACES,
                'Face runs must be sorted, nonoverlapping, positive, and within the source.')
        total += count
        end = start + count
    require(total == SELECTED, 'Selected face count mismatch.')
    return selection, runs


def partition(source_indices, runs):
    front_parts, gray_parts, end = [], [], 0
    for start, count in runs:
        gray_parts.append(source_indices[end * 12:start * 12])
        front_parts.append(source_indices[start * 12:(start + count) * 12])
        end = start + count
    gray_parts.append(source_indices[end * 12:])
    return b''.join(front_parts), b''.join(gray_parts)


def restore_partition(front, gray, runs):
    restored, fpos, gpos, end = [], 0, 0, 0
    for start, count in runs:
        gap_bytes, front_bytes = (start - end) * 12, count * 12
        restored.append(gray[gpos:gpos + gap_bytes])
        restored.append(front[fpos:fpos + front_bytes])
        gpos += gap_bytes
        fpos += front_bytes
        end = start + count
    restored.append(gray[gpos:])
    require(fpos == len(front) and len(gray[gpos:]) == (FACES - end) * 12,
            'Active face subset sizes do not match the frozen partition.')
    return b''.join(restored)


def rebuild(source_doc, source_bin, image_bytes, source_positions, source_indices, runs):
    positions = list(struct.iter_unpack('<3f', source_positions))
    low = [min(p[axis] for p in positions) for axis in range(3)]
    high = [max(p[axis] for p in positions) for axis in range(3)]
    center = [(low[axis] + high[axis]) / 2 for axis in range(3)]
    xmin, ymin, xmax, ymax = REFERENCE_BOUNDS
    reference_center = (xmin + xmax) / 2, (ymin + ymax) / 2
    scale = (ymax - ymin) / (high[1] - low[1])
    # Exact operation order of the original NumPy float64 projection, then f32.
    uv = b''.join(struct.pack('<2f',
                              (reference_center[0] + (x - center[0]) * scale) / IMAGE_SIZE[0],
                              (reference_center[1] - (y - center[1]) * scale) / IMAGE_SIZE[1])
                  for x, y, z in positions)
    require(digest(uv) == EXPECTED_UV_SHA, 'Projection UV hash mismatch.')
    front, gray = partition(source_indices, runs)
    require(restore_partition(front, gray, runs) == source_indices,
            'Face partition is not exactly the source indexed triangles.')
    doc = copy.deepcopy(source_doc)
    binary = bytearray(source_bin)

    def append_view(data, target=None):
        binary.extend(b'\0' * (-len(binary) % 4))
        view = {'buffer': 0, 'byteOffset': len(binary), 'byteLength': len(data)}
        if target:
            view['target'] = target
        doc['bufferViews'].append(view)
        binary.extend(data)
        return len(doc['bufferViews']) - 1

    def append_accessor(data, component, count, kind, target):
        view = append_view(data, target)
        doc['accessors'].append({'bufferView': view, 'componentType': component,
                                'count': count, 'type': kind})
        return len(doc['accessors']) - 1

    uv_index = append_accessor(uv, 5126, VERTICES, 'VEC2', 34962)
    front_index = append_accessor(front, 5125, SELECTED * 3, 'SCALAR', 34963)
    gray_index = append_accessor(gray, 5125, (FACES - SELECTED) * 3, 'SCALAR', 34963)
    image_view = append_view(image_bytes)
    doc.setdefault('images', []).append({'name': 'original-front-capture-unchanged.jpg',
                                         'mimeType': 'image/jpeg', 'bufferView': image_view})
    doc.setdefault('samplers', []).append({'magFilter': 9729, 'minFilter': 9729, 'wrapS': 33071, 'wrapT': 33071})
    doc.setdefault('textures', []).append({'source': len(doc['images']) - 1, 'sampler': len(doc['samplers']) - 1})
    front_mat = len(doc.setdefault('materials', []))
    doc['materials'].append({'name': 'DIAGNOSTIC-front-projection-unapproved', 'doubleSided': True,
                             'pbrMetallicRoughness': {'baseColorTexture': {'index': len(doc['textures']) - 1},
                                                      'metallicFactor': 0, 'roughnessFactor': 1}})
    gray_mat = len(doc['materials'])
    doc['materials'].append({'name': 'UNKNOWN-unprojected-gray-not-textured', 'doubleSided': True,
                             'pbrMetallicRoughness': {'baseColorFactor': [.42, .42, .42, 1],
                                                      'metallicFactor': 0, 'roughnessFactor': 1}})
    primitive = source_doc['meshes'][0]['primitives'][0]
    front_primitive, gray_primitive = copy.deepcopy(primitive), copy.deepcopy(primitive)
    front_primitive.update({'indices': front_index, 'material': front_mat})
    front_primitive['attributes']['TEXCOORD_0'] = uv_index
    gray_primitive.update({'indices': gray_index, 'material': gray_mat})
    doc['meshes'][0]['primitives'] = [front_primitive, gray_primitive]
    doc['asset']['generator'] = 'CRWT V11 actual-mesh front-only projection diagnostic; unapproved'
    doc.setdefault('extras', {})['projectionDiagnostic'] = {
        'accepted': False, 'productionReady': False, 'referenceViews': 1,
        'geometryRemeshed': False, 'gameAssetsReplaced': False,
        'unknownSurfaces': 'gray material; no inferred back/side texture',
        'sourceSha256': EXPECTED_MESH_SHA, 'referenceSha256': EXPECTED_IMAGE_SHA}
    doc['buffers'][0]['byteLength'] = len(binary)
    binary.extend(b'\0' * (-len(binary) % 4))
    encoded = json.dumps(doc, separators=(',', ':')).encode()
    encoded += b' ' * (-len(encoded) % 4)
    result = struct.pack('<4sII', b'glTF', 2, 28 + len(encoded) + len(binary))
    result += struct.pack('<II', len(encoded), 0x4E4F534A) + encoded
    result += struct.pack('<II', len(binary), 0x004E4942) + binary
    require(digest(result) == EXPECTED_OUTPUT_SHA,
            'Reconstructed bytes differ from the frozen original diagnostic; refusing output.')
    out_doc, out_bin = read_glb(result)
    require(out_bin[:len(source_bin)] == source_bin, 'Original source BIN prefix changed.')
    require(out_doc['nodes'] == source_doc['nodes'] and out_doc['scenes'] == source_doc['scenes'],
            'Source nodes/scenes changed.')
    require(out_doc['accessors'][:len(source_doc['accessors'])] == source_doc['accessors']
            and out_doc['bufferViews'][:len(source_doc['bufferViews'])] == source_doc['bufferViews'],
            'Original accessors/buffer views changed.')
    require(accessor_bytes(out_doc, out_bin, primitive['attributes']['POSITION']) == source_positions
            and accessor_bytes(out_doc, out_bin, primitive['indices']) == source_indices,
            'Original POSITION/index bytes changed.')
    active_front = accessor_bytes(out_doc, out_bin, front_index)
    active_gray = accessor_bytes(out_doc, out_bin, gray_index)
    restored = restore_partition(active_front, active_gray, runs)
    require(restored == source_indices, 'Active face union differs from the original source.')
    image = out_doc['images'][-1]
    view = out_doc['bufferViews'][image['bufferView']]
    require(out_bin[view['byteOffset']:view['byteOffset'] + view['byteLength']] == image_bytes,
            'Embedded reference JPEG changed.')
    return result, {'sourceBinPrefixByteIdentical': True,
                    'sourcePositionAndIndexBytesPreserved': True,
                    'originalAccessorsAndBufferViewsPreserved': True,
                    'sourceNodesAndScenesPreserved': True,
                    'faceUnionExactlyOriginalNoDuplicatesOrLoss': True,
                    'facePartitionRestoredSha256': digest(restored),
                    'embeddedReferenceJpegBytesUnchanged': True,
                    'uvSha256': digest(uv)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mesh', type=pathlib.Path)
    parser.add_argument('reference', type=pathlib.Path)
    parser.add_argument('--selection', type=pathlib.Path,
                        default=pathlib.Path(__file__).with_name('front-face-selection.json'))
    parser.add_argument('--out', type=pathlib.Path, required=True)
    parser.add_argument('--proof', type=pathlib.Path)
    parser.add_argument('--overwrite', action='store_true')
    args = parser.parse_args()
    output = args.out.resolve()
    proof_path = args.proof.resolve() if args.proof else output.with_suffix('.rebuild-proof.json')
    source_paths = [args.mesh.resolve(), args.reference.resolve(), args.selection.resolve()]
    require(output != proof_path, 'GLB and proof paths must differ.')
    if output.exists() and proof_path.exists():
        require(not output.samefile(proof_path), 'GLB and proof paths must not alias the same file.')
    for target in (output, proof_path):
        require(target not in source_paths, 'An output path must not overwrite an input.')
        if target.exists():
            require(not any(target.samefile(source) for source in source_paths),
                    'Output aliases an input file.')
            require(args.overwrite, 'Output exists; pass --overwrite intentionally: ' + str(target))
    source_raw = args.mesh.read_bytes()
    image_bytes = args.reference.read_bytes()
    selection_raw = args.selection.read_bytes()
    require(digest(source_raw) == EXPECTED_MESH_SHA, 'Actual V11 source mesh hash mismatch.')
    require(digest(image_bytes) == EXPECTED_IMAGE_SHA, 'Actual front JPEG hash mismatch.')
    selection, runs = selection_runs(selection_raw)
    doc, binary = read_glb(source_raw)
    require(len(doc.get('meshes', [])) == 1 and len(doc['meshes'][0]['primitives']) == 1,
            'Expected the audited single-primitive V11 source.')
    primitive = doc['meshes'][0]['primitives'][0]
    require(primitive['attributes'] == {'POSITION': 1} and primitive['indices'] == 0
            and primitive.get('mode', 4) == 4, 'V11 primitive structure changed.')
    positions = accessor_bytes(doc, binary, 1)
    indices = accessor_bytes(doc, binary, 0)
    require(len(positions) == VERTICES * 12 and digest(positions) == EXPECTED_POSITION_SHA,
            'Source POSITION accessor mismatch.')
    require(len(indices) == FACES * 12 and digest(indices) == EXPECTED_INDICES_SHA,
            'Source index accessor mismatch.')
    result, preservation = rebuild(doc, binary, image_bytes, positions, indices, runs)
    proof = {'status': 'reproduced-frozen-front-projection-diagnostic-byte-identical',
             'pythonVersion': sys.version.split()[0], 'dependencyPolicy': 'Python standard library only',
             'gpuUsed': False, 'visibilityRecalculated': False,
             'visibilitySelectionProvenance': selection['selectionMethod'],
             'originalVisibilityRenderer': selection['originalVisibilityRenderer'],
             'sourceMeshSha256': EXPECTED_MESH_SHA, 'referenceImageSha256': EXPECTED_IMAGE_SHA,
             'selectionManifestSha256': EXPECTED_SELECTION_SHA,
             'referenceBoundsManualPinned': list(REFERENCE_BOUNDS),
             'referenceImageSizePinned': list(IMAGE_SIZE),
             'expectedOutputGlbSha256': EXPECTED_OUTPUT_SHA, 'outputGlbSha256': digest(result),
             'outputGlbBytes': len(result), 'sourceVertices': VERTICES, 'sourceFaces': FACES,
             'projectedFaces': SELECTED, 'unknownGrayFaces': FACES - SELECTED,
             'rleRuns': len(runs), 'accepted': False, 'productionReady': False,
             'geometryRemeshed': False, 'normalsAdded': False, 'gameAssetsChanged': False,
             **preservation}
    mode = 'wb' if args.overwrite else 'xb'
    output.parent.mkdir(parents=True, exist_ok=True)
    proof_path.parent.mkdir(parents=True, exist_ok=True)
    with output.open(mode) as handle:
        handle.write(result)
    require(digest(output.read_bytes()) == EXPECTED_OUTPUT_SHA, 'Written output hash mismatch.')
    proof['sourceFilesPreservedSha256Match'] = all(
        digest(path.read_bytes()) == expected for path, expected in zip(source_paths,
            (EXPECTED_MESH_SHA, EXPECTED_IMAGE_SHA, EXPECTED_SELECTION_SHA)))
    require(proof['sourceFilesPreservedSha256Match'], 'An input changed during reconstruction.')
    with proof_path.open(mode) as handle:
        handle.write((json.dumps(proof, indent=2) + '\n').encode('utf-8'))
    print(json.dumps(proof | {'output': str(output), 'proof': str(proof_path)}), flush=True)


if __name__ == '__main__':
    main()

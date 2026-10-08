"""Transport the frozen front-only diagnostic onto the exact cleanup candidate.

Python standard library only. Reads the four hash-pinned inputs without editing
them. No new visibility calculation, mesh generation, image editing, unwrapping,
back/side texturing, rigging, or game integration is performed. The complete
cleanup candidate BIN/accessors/nodes/scenes remain intact; two appended index
subsets activate its original retained triangles with frozen albedo materials.
"""

import argparse
import copy
import hashlib
import json
import pathlib
import struct
import sys


CANDIDATE_SHA = 'dae2b0784b190649e5ae69ef2854aa06798468d2244eb5982d61a759c0c54af0'
BASELINE_SHA = '032e64c6adfd6367f2bc6a92f15adc3df10ba535b6dade9f46d9b251443cd200'
REMAP_SHA = '3dde11f6884f18264a363712daf9104ea718f4180a6fa1eb754f87af99bc5ef6'
IMAGE_SHA = '1202424fc57571aaad7b7e1389d4de1ae7ba155c1ec113bd4425b5f05ab02928'
ORIGINAL_SOURCE_SHA = 'd0a0fea651079aa98d026a1610ef0a9e7f4c14c0c466cb1d949886df45c24a66'
ORIGINAL_SELECTION_SHA = 'e40c2db62e6089c289ac58b7a6252205ddb239d22ba797b16590b24223970f94'
POSITION_SHA = '416825b530ca4cdae092800cb917a2ffdbc5f30202f6621b58d5ce80219218e6'
ORIGINAL_INDICES_SHA = 'e5a321d62cdacca1924f83c966dbba454cba7edcafa444d2fc320cfe1ba1c941'
CANDIDATE_INDICES_SHA = '4a7e4d20641fb45675b5c0d157bb3812e9864512f204509074afce6a7e1671a6'
UV_SHA = '5d54bdc8a18d1d32bbfb370a73b5ef242ec69e47817b42aa3c4ab67b6be2b9aa'
VERTICES, ORIGINAL_FACES, CANDIDATE_FACES = 224713, 449582, 449164
COLORED_FACES, GRAY_FACES, REMOVED_FACES = 103443, 345721, 418


def digest(data):
    return hashlib.sha256(data).hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def parse_glb(raw):
    require(len(raw) >= 28 and struct.unpack_from('<4sII', raw) == (b'glTF', 2, len(raw)),
            'Expected a complete GLB 2.0.')
    doc, binary, offset = None, None, 12
    while offset < len(raw):
        require(offset + 8 <= len(raw), 'Truncated chunk header.')
        length, kind = struct.unpack_from('<II', raw, offset)
        offset += 8
        data = raw[offset:offset + length]
        require(len(data) == length, 'Truncated GLB chunk.')
        if kind == 0x4E4F534A:
            require(doc is None, 'Duplicate JSON chunk.')
            doc = json.loads(data.rstrip(b' \0'))
        elif kind == 0x004E4942:
            require(binary is None, 'Duplicate BIN chunk.')
            binary = data
        else:
            raise ValueError('Unknown chunk type.')
        offset += length
    require(doc is not None and binary is not None, 'Missing embedded JSON/BIN.')
    require(len(doc.get('buffers', [])) == 1 and 'uri' not in doc['buffers'][0],
            'Expected a single embedded buffer.')
    return doc, binary


def accessor_bytes(doc, binary, index):
    accessor = doc['accessors'][index]
    require('sparse' not in accessor and not accessor.get('normalized'), 'Unsupported accessor.')
    width = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3}[accessor['type']]
    require(accessor['componentType'] in (5125, 5126), 'Expected packed u32/f32 accessor.')
    view = doc['bufferViews'][accessor['bufferView']]
    require(view.get('buffer', 0) == 0 and view.get('byteStride', width * 4) == width * 4,
            'Interleaved/external accessor unsupported.')
    start = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
    size = accessor['count'] * width * 4
    data = binary[start:start + size]
    require(len(data) == size, 'Accessor exceeds BIN.')
    return data


def frozen_projection_uv(positions):
    points = list(struct.iter_unpack('<3f', positions))
    require(len(points) == VERTICES, 'POSITION count differs.')
    low = [min(point[i] for point in points) for i in range(3)]
    high = [max(point[i] for point in points) for i in range(3)]
    center = [(low[i] + high[i]) / 2 for i in range(3)]
    scale = 549 / (high[1] - low[1])
    uv = b''.join(struct.pack('<2f', (292 + (x - center[0]) * scale) / 584,
                              (292.5 - (y - center[1]) * scale) / 584)
                  for x, y, z in points)
    require(digest(uv) == UV_SHA, 'Frozen UV mapping differs.')
    return uv


def verify_remap(raw, original_indices, candidate_indices, baseline_front, baseline_gray):
    require(digest(raw) == REMAP_SHA, 'Frozen transported selection SHA mismatch.')
    remap = json.loads(raw)
    pinned = {'schemaVersion': 1, 'originalSourceMeshSha256': ORIGINAL_SOURCE_SHA,
              'candidateMeshSha256': CANDIDATE_SHA, 'originalFrontSelectionSha256': ORIGINAL_SELECTION_SHA,
              'sourceOriginalFaceCount': ORIGINAL_FACES, 'candidateFaceCount': CANDIDATE_FACES,
              'projectedFaceCount': COLORED_FACES, 'originalProjectedFacesRemoved': 0,
              'projectedFaceGeometryExactlyPreserved': True, 'uvProjectionUnchanged': True,
              'visibilityRecalculated': False, 'accepted': False, 'productionReady': False}
    for key, value in pinned.items():
        require(remap.get(key) == value, 'Transported selection field mismatch: ' + key)
    removed = remap['removedOriginalSourceFaceIds']
    require(len(removed) == REMOVED_FACES and removed == sorted(set(removed))
            and all(type(i) is int and 0 <= i < ORIGINAL_FACES for i in removed),
            'Removed original face IDs are not a valid exact selection.')
    removed_set = set(removed)
    retained_old_ids = [i for i in range(ORIGINAL_FACES) if i not in removed_set]
    kept_original_bytes = b''.join(original_indices[i * 12:(i + 1) * 12] for i in retained_old_ids)
    require(kept_original_bytes == candidate_indices,
            'Candidate active triangles are not the frozen retained original geometry/order.')
    selected, end = [], 0
    for run in remap['candidateProjectedFaceRle']:
        require(isinstance(run, list) and len(run) == 2 and all(type(i) is int for i in run),
                'Invalid candidate projected face run.')
        start, count = run
        require(start >= end and count > 0 and start + count <= CANDIDATE_FACES,
                'Projected runs are unsorted, overlapping, or out of bounds.')
        selected.extend(range(start, start + count))
        end = start + count
    require(len(selected) == COLORED_FACES and len(set(selected)) == COLORED_FACES,
            'Projected face membership count differs.')
    selected_set = set(selected)
    mapped_original_ids = [retained_old_ids[i] for i in selected]
    require(len(set(mapped_original_ids)) == COLORED_FACES,
            'Transported original-to-candidate face mapping is not bijective.')
    colored = b''.join(candidate_indices[i * 12:(i + 1) * 12] for i in selected)
    gray = b''.join(candidate_indices[i * 12:(i + 1) * 12]
                    for i in range(CANDIDATE_FACES) if i not in selected_set)
    require(len(colored) == COLORED_FACES * 12 and len(gray) == GRAY_FACES * 12,
            'Transported colored/gray face counts differ.')
    require(colored == baseline_front, 'Colored triangle indices/order differ from the original projection.')
    mapped_original_set = set(mapped_original_ids)
    original_gray_expected = b''.join(original_indices[i * 12:(i + 1) * 12]
                                      for i in range(ORIGINAL_FACES) if i not in mapped_original_set)
    require(original_gray_expected == baseline_gray,
            'Original projection gray membership differs from the transported baseline partition.')
    restored, cpos, gpos = [], 0, 0
    for i in range(CANDIDATE_FACES):
        if i in selected_set:
            restored.append(colored[cpos:cpos + 12])
            cpos += 12
        else:
            restored.append(gray[gpos:gpos + 12])
            gpos += 12
    require(b''.join(restored) == candidate_indices,
            'Appended colored/gray union does not restore candidate triangles exactly.')
    return colored, gray, selected


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('candidate', type=pathlib.Path)
    parser.add_argument('reference', type=pathlib.Path)
    parser.add_argument('--baseline-projection', required=True, type=pathlib.Path)
    parser.add_argument('--remap', required=True, type=pathlib.Path)
    parser.add_argument('--out', required=True, type=pathlib.Path)
    parser.add_argument('--proof', type=pathlib.Path)
    parser.add_argument('--expected-output-sha256')
    parser.add_argument('--overwrite', action='store_true')
    args = parser.parse_args()
    input_paths = [args.candidate.resolve(), args.reference.resolve(),
                   args.baseline_projection.resolve(), args.remap.resolve()]
    expected_hashes = [CANDIDATE_SHA, IMAGE_SHA, BASELINE_SHA, REMAP_SHA]
    output = args.out.resolve()
    proof_path = args.proof.resolve() if args.proof else output.with_suffix('.projection-proof.json')
    require(output != proof_path, 'Model and proof output paths must differ.')
    for path in (output, proof_path):
        require(path not in input_paths, 'An output would overwrite an input.')
        if path.exists():
            require(not any(path.samefile(source) for source in input_paths), 'An output aliases an input.')
            require(args.overwrite, 'Output exists; use --overwrite intentionally: ' + str(path))
    if output.exists() and proof_path.exists():
        require(not output.samefile(proof_path), 'Model and proof outputs alias one another.')
    raw_candidate, image_bytes, baseline_raw, remap_raw = [path.read_bytes() for path in input_paths]
    for raw, expected in zip((raw_candidate, image_bytes, baseline_raw, remap_raw), expected_hashes):
        require(digest(raw) == expected, 'Input hash mismatch; refusing to transport uncertain geometry/texture.')
    source_doc, source_bin = parse_glb(raw_candidate)
    baseline_doc, baseline_bin = parse_glb(baseline_raw)
    require(len(source_doc['meshes']) == 1 and len(source_doc['meshes'][0]['primitives']) == 1,
            'Expected the exact single-primitive cleanup candidate.')
    require(all(not source_doc.get(key) for key in ('materials', 'textures', 'samplers', 'images', 'skins', 'animations')),
            'Cleanup candidate unexpectedly already contains material/rig resources.')
    primitive = source_doc['meshes'][0]['primitives'][0]
    require(primitive['attributes'] == {'POSITION': 1} and primitive.get('mode', 4) == 4,
            'Cleanup candidate attribute structure differs.')
    baseline_primitives = baseline_doc['meshes'][0]['primitives']
    require(len(baseline_primitives) == 2 and baseline_primitives[0]['material'] == 0
            and baseline_primitives[1]['material'] == 1, 'Baseline projection primitive/material structure differs.')
    positions = accessor_bytes(source_doc, source_bin, 1)
    original_indices = accessor_bytes(source_doc, source_bin, 0)
    candidate_indices = accessor_bytes(source_doc, source_bin, primitive['indices'])
    require(digest(positions) == POSITION_SHA and digest(original_indices) == ORIGINAL_INDICES_SHA
            and digest(candidate_indices) == CANDIDATE_INDICES_SHA, 'Frozen geometry accessor hash mismatch.')
    require(len(original_indices) == ORIGINAL_FACES * 12 and len(candidate_indices) == CANDIDATE_FACES * 12,
            'Active/source triangle counts differ.')
    require(positions == accessor_bytes(baseline_doc, baseline_bin, baseline_primitives[0]['attributes']['POSITION']),
            'Colored vertex positions differ from the baseline projection.')
    require(source_doc['nodes'] == baseline_doc['nodes'] and source_doc['scenes'] == baseline_doc['scenes'],
            'Baseline/candidate scene transforms differ.')
    uv = frozen_projection_uv(positions)
    require(uv == accessor_bytes(baseline_doc, baseline_bin, baseline_primitives[0]['attributes']['TEXCOORD_0']),
            'Frozen baseline UV bytes differ.')
    colored, gray, selected = verify_remap(remap_raw, original_indices, candidate_indices,
        accessor_bytes(baseline_doc, baseline_bin, baseline_primitives[0]['indices']),
        accessor_bytes(baseline_doc, baseline_bin, baseline_primitives[1]['indices']))
    image = baseline_doc['images'][0]
    image_view = baseline_doc['bufferViews'][image['bufferView']]
    require(baseline_bin[image_view.get('byteOffset', 0):image_view.get('byteOffset', 0) + image_view['byteLength']] == image_bytes,
            'Embedded baseline JPEG differs from the frozen reference.')
    require(len(baseline_doc['images']) == 1 and len(baseline_doc['materials']) == 2
            and len(baseline_doc['textures']) == 1 and len(baseline_doc['samplers']) == 1,
            'Baseline albedo resource layout differs.')
    doc, binary = copy.deepcopy(source_doc), bytearray(source_bin)

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
        doc['accessors'].append({'bufferView': view, 'componentType': component, 'count': count, 'type': kind})
        return len(doc['accessors']) - 1

    uv_index = append_accessor(uv, 5126, VERTICES, 'VEC2', 34962)
    colored_index = append_accessor(colored, 5125, COLORED_FACES * 3, 'SCALAR', 34963)
    gray_index = append_accessor(gray, 5125, GRAY_FACES * 3, 'SCALAR', 34963)
    embedded_image_view = append_view(image_bytes)
    for key in ('images', 'textures', 'samplers', 'materials'):
        doc[key] = copy.deepcopy(baseline_doc[key])
    doc['images'][0]['bufferView'] = embedded_image_view
    colored_primitive, gray_primitive = copy.deepcopy(primitive), copy.deepcopy(primitive)
    colored_primitive['attributes']['TEXCOORD_0'] = uv_index
    colored_primitive.update({'indices': colored_index, 'material': 0})
    gray_primitive.update({'indices': gray_index, 'material': 1})
    doc['meshes'][0]['primitives'] = [colored_primitive, gray_primitive]
    doc['asset']['generator'] = 'CRWT cleanup candidate frozen front-only projection; unapproved'
    doc.setdefault('extras', {})['cleanupFrontProjectionCandidate'] = {
        'accepted': False, 'productionReady': False, 'sourceCandidateSha256': CANDIDATE_SHA,
        'originalSourceMeshSha256': ORIGINAL_SOURCE_SHA, 'baselineProjectionSha256': BASELINE_SHA,
        'transportedSelectionSha256': REMAP_SHA, 'referenceImageSha256': IMAGE_SHA,
        'activeFaceCount': CANDIDATE_FACES, 'coloredFaceCount': COLORED_FACES,
        'unknownGrayFaceCount': GRAY_FACES, 'visibilityRecalculated': False,
        'newBackSideTextureInvented': False, 'gameAssetsChanged': False}
    doc['buffers'][0]['byteLength'] = len(binary)
    binary.extend(b'\0' * (-len(binary) % 4))
    encoded = json.dumps(doc, separators=(',', ':')).encode('utf-8')
    encoded += b' ' * (-len(encoded) % 4)
    result = struct.pack('<4sII', b'glTF', 2, 28 + len(encoded) + len(binary))
    result += struct.pack('<II', len(encoded), 0x4E4F534A) + encoded
    result += struct.pack('<II', len(binary), 0x004E4942) + binary
    output_sha = digest(result)
    if args.expected_output_sha256:
        require(output_sha == args.expected_output_sha256, 'Output differs from pinned candidate hash.')
    check_doc, check_bin = parse_glb(result)
    require(check_bin[:len(source_bin)] == source_bin, 'Cleanup candidate BIN prefix changed.')
    require(check_doc['accessors'][:len(source_doc['accessors'])] == source_doc['accessors']
            and check_doc['bufferViews'][:len(source_doc['bufferViews'])] == source_doc['bufferViews'],
            'Cleanup candidate original accessors/buffer views changed.')
    require(check_doc['nodes'] == source_doc['nodes'] and check_doc['scenes'] == source_doc['scenes'],
            'Cleanup candidate nodes/scenes changed.')
    require(check_doc['extras']['interiorCleanupCandidate'] == source_doc['extras']['interiorCleanupCandidate'],
            'Cleanup candidate containment provenance changed.')
    require(accessor_bytes(check_doc, check_bin, 1) == positions
            and accessor_bytes(check_doc, check_bin, primitive['indices']) == candidate_indices
            and accessor_bytes(check_doc, check_bin, colored_index) == colored
            and accessor_bytes(check_doc, check_bin, gray_index) == gray
            and accessor_bytes(check_doc, check_bin, uv_index) == uv, 'Output accessors differ from verified buffers.')
    proof = {'status': 'cleanup-front-projection-candidate-unapproved',
             'pythonVersion': sys.version.split()[0], 'dependencies': 'Python standard library only',
             'sourceCandidateSha256': CANDIDATE_SHA, 'baselineProjectionSha256': BASELINE_SHA,
             'transportedSelectionSha256': REMAP_SHA, 'referenceImageSha256': IMAGE_SHA,
             'originalSourceMeshSha256': ORIGINAL_SOURCE_SHA,
             'outputGlbSha256': output_sha, 'outputGlbBytes': len(result),
             'activeFaces': CANDIDATE_FACES, 'coloredFaces': COLORED_FACES,
             'unknownGrayFaces': GRAY_FACES, 'storedVertices': VERTICES,
             'sourceCandidateBinPrefixByteIdentical': True, 'sourceCandidateBinSha256': digest(source_bin),
             'sourceCandidateAccessorsAndBufferViewsPreserved': True,
             'sourceCandidatePositionAndIndicesBytesPreserved': True,
             'sourceCandidateNodesScenesAndContainmentProvenancePreserved': True,
             'candidateFaceUnionRestoredExactlyInOriginalOrder': True,
             'originalToCandidateFaceMappingBijective': True,
             'coloredTriangleIndicesOrderAndPositionsByteIdenticalToBaseline': True,
             'coloredTriangleIndicesSha256': digest(colored), 'grayTriangleIndicesSha256': digest(gray),
             'positionAccessorSha256': POSITION_SHA, 'uvSha256': UV_SHA,
             'uvMappingByteIdenticalToBaseline': True, 'albedoMaterialsAndSamplersFrozenFromBaseline': True,
             'embeddedReferenceImageBytesUnchanged': True, 'visibilityRecalculated': False,
             'originalProjectedFacesRemoved': 0, 'newBackSideTextureInvented': False,
             'geometryRemeshed': False, 'vertexPositionsEdited': False, 'normalsAdded': False,
             'imagePixelsEdited': False, 'rigOrAnimationAdded': False, 'gameAssetsChanged': False,
             'accepted': False, 'productionReady': False,
             'renderComparison': 'Pending root actual-mesh comparisons against original front-projection diagnostic.',
             'limitations': ['Frozen projection uses one conditioning JPEG with baked lighting/background.',
                             'Unknown/hidden triangles retain the original gray material; no complete texture is produced.',
                             'Hair, eye relief, fingers/cuffs, outer islands and global self-intersections remain uncorrected.',
                             'Only five certified interior components were removed in the input cleanup candidate.',
                             'Original candidate BIN and inactive source data remain, so file size grows.',
                             'This is an unapproved diagnostic candidate, without rig/game integration.']}
    for path in (output, proof_path):
        path.parent.mkdir(parents=True, exist_ok=True)
    mode = 'wb' if args.overwrite else 'xb'
    with output.open(mode) as handle:
        handle.write(result)
    require(digest(output.read_bytes()) == output_sha, 'Written output SHA mismatch.')
    proof['allSourceFilesPreservedSha256Match'] = all(digest(path.read_bytes()) == expected
                                                   for path, expected in zip(input_paths, expected_hashes))
    require(proof['allSourceFilesPreservedSha256Match'], 'An input changed during export.')
    with proof_path.open(mode) as handle:
        handle.write((json.dumps(proof, indent=2) + '\n').encode('utf-8'))
    print(json.dumps({key: proof[key] for key in ('status', 'outputGlbSha256', 'outputGlbBytes',
                     'activeFaces', 'coloredFaces', 'unknownGrayFaces', 'allSourceFilesPreservedSha256Match')}
                    | {'output': str(output), 'proof': str(proof_path)}), flush=True)


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""Export an isolated visual-review ablation of source components 2/3/4 only.

Requires original V11, exact certified interior candidate, pinned cleanup proof,
and a separately frozen face selection. All source files remain untouched.
Python 3.10+, standard library. Not production approval or a hair design repair.
"""
import argparse
import bisect
import copy
import hashlib
import json
import pathlib
import struct

SOURCE_SHA = 'd0a0fea651079aa98d026a1610ef0a9e7f4c14c0c466cb1d949886df45c24a66'
BASE_SHA = 'dae2b0784b190649e5ae69ef2854aa06798468d2244eb5982d61a759c0c54af0'
CLEANUP_PROOF_SHA = '8548a25b5d3599753c9f7015f8326510fa23cedf1526d33b6b5e7688db4d2b81'
POSITION_SHA = '416825b530ca4cdae092800cb917a2ffdbc5f30202f6621b58d5ce80219218e6'
INDICES_SHA = 'e5a321d62cdacca1924f83c966dbba454cba7edcafa444d2fc320cfe1ba1c941'
FRONT_SHA = 'e40c2db62e6089c289ac58b7a6252205ddb239d22ba797b16590b24223970f94'
VERTICES, SOURCE_FACES, BASE_FACES, ABLATION_FACES = 224713, 449582, 449164, 912
COMPONENTS = {
    2: (500, '8d6c76283b08476e41c470f89dafce573c679cf921df1ca3c70798b0c93fba66'),
    3: (212, 'c5623ebac3addea22bf6210d06e7a56542e728c598fd3b6b73ecc996a412ce68'),
    4: (200, '9a66c18cf3e0090e1f7df2c25c5dc38b57831d87411dd90bb8365b54fab02a35')}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def membership_sha(ids):
    return digest(b''.join(struct.pack('<Q', i) for i in ids))


def read_glb(raw):
    require(len(raw) >= 28 and struct.unpack_from('<4sII', raw) == (b'glTF', 2, len(raw)), 'Invalid GLB2 header')
    doc, binary, offset = None, None, 12
    while offset < len(raw):
        require(offset + 8 <= len(raw), 'Truncated GLB chunk')
        count, kind = struct.unpack_from('<II', raw, offset); offset += 8
        data = raw[offset:offset + count]; offset += count
        require(len(data) == count, 'Truncated GLB data')
        if kind == 0x4e4f534a:
            require(doc is None, 'Duplicate JSON chunk'); doc = json.loads(data.rstrip(b' \0'))
        elif kind == 0x004e4942:
            require(binary is None, 'Duplicate BIN chunk'); binary = data
        else:
            raise ValueError('Unknown GLB chunk')
    require(doc is not None and binary is not None, 'Missing GLB JSON/BIN')
    require(len(doc.get('buffers', [])) == 1 and 'uri' not in doc['buffers'][0], 'Embedded buffer required')
    return doc, binary


def accessor_bytes(doc, binary, index):
    accessor = doc['accessors'][index]
    require('sparse' not in accessor and not accessor.get('normalized'), 'Unsupported accessor')
    width = {'SCALAR': 1, 'VEC3': 3}[accessor['type']]
    require(accessor['componentType'] in (5125, 5126), 'Expected packed uint32/float32')
    view = doc['bufferViews'][accessor['bufferView']]
    require(view.get('buffer', 0) == 0 and view.get('byteStride', width * 4) == width * 4, 'Packed embedded accessor required')
    start = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
    data = binary[start:start + accessor['count'] * width * 4]
    require(len(data) == accessor['count'] * width * 4, 'Accessor outside BIN')
    return data


def component_faces(indices):
    parents, ranks = list(range(VERTICES)), bytearray(VERTICES)
    def find(i):
        while parents[i] != i:
            parents[i] = parents[parents[i]]; i = parents[i]
        return i
    def union(a, b):
        a, b = find(a), find(b)
        if a == b:
            return
        if ranks[a] < ranks[b]:
            a, b = b, a
        parents[b] = a
        if ranks[a] == ranks[b]:
            ranks[a] += 1
    triangles = list(struct.iter_unpack('<3I', indices))
    require(len(triangles) == SOURCE_FACES, 'Source face count changed')
    for a, b, c in triangles:
        require(max(a, b, c) < VERTICES, 'Index outside source POSITION')
        union(a, b); union(a, c)
    by_root = {}
    for face, triangle in enumerate(triangles):
        by_root.setdefault(find(triangle[0]), []).append(face)
    ordered = sorted(by_root, key=lambda root: (-len(by_root[root]), root))
    require(len(ordered) == 10, 'Source component count changed')
    parts = {rank + 1: by_root[root] for rank, root in enumerate(ordered)}
    for component, (count, expected) in COMPONENTS.items():
        require(len(parts[component]) == count and membership_sha(parts[component]) == expected, 'Frozen component identity changed: ' + str(component))
    require(len(parts[1]) == 448244 and len(parts[9]) == 8, 'Main/eye-adjacent component identity changed')
    return parts


def validate_inputs(original, candidate, cleanup_proof):
    raw_source, raw_base, raw_proof = original.read_bytes(), candidate.read_bytes(), cleanup_proof.read_bytes()
    require(digest(raw_source) == SOURCE_SHA and digest(raw_base) == BASE_SHA, 'Source/base GLB SHA-256 mismatch')
    require(digest(raw_proof) == CLEANUP_PROOF_SHA, 'Pinned cleanup proof SHA-256 mismatch')
    source_doc, source_bin = read_glb(raw_source); base_doc, base_bin = read_glb(raw_base)
    require(len(source_doc['meshes']) == 1 and len(source_doc['meshes'][0]['primitives']) == 1, 'Source primitive structure changed')
    primitive = source_doc['meshes'][0]['primitives'][0]
    require(primitive['attributes'] == {'POSITION': 1} and primitive['indices'] == 0 and primitive.get('mode', 4) == 4, 'Original V11 primitive required')
    positions, indices = accessor_bytes(source_doc, source_bin, 1), accessor_bytes(source_doc, source_bin, 0)
    require(digest(positions) == POSITION_SHA and digest(indices) == INDICES_SHA, 'Source POSITION/index bytes changed')
    require(base_bin[:len(source_bin)] == source_bin and accessor_bytes(base_doc, base_bin, 1) == positions, 'Original binary prefix/positions changed in base')
    require(base_doc['nodes'] == source_doc['nodes'] and base_doc['scenes'] == source_doc['scenes'], 'Base transforms changed')
    require(len(base_doc['meshes']) == 1 and len(base_doc['meshes'][0]['primitives']) == 1, 'Base primitive structure changed')
    base_primitive = base_doc['meshes'][0]['primitives'][0]
    require(base_primitive['attributes'] == {'POSITION': 1} and base_primitive.get('mode', 4) == 4, 'POSITION-only base required')
    parts = component_faces(indices)
    interior = sorted(face for component in [5, 6, 7, 8, 10] for face in parts[component])
    proof = json.loads(raw_proof)
    require(proof['sourceMeshSha256'] == SOURCE_SHA and proof['candidateMeshSha256'] == BASE_SHA and proof['removedOriginalSourceFaceIds'] == interior, 'Cleanup proof source/component mapping mismatch')
    require(len(interior) == 418, 'Interior removal count changed')
    interior_set = set(interior)
    base_source_ids = [face for face in range(SOURCE_FACES) if face not in interior_set]
    base_indices = accessor_bytes(base_doc, base_bin, base_primitive['indices'])
    expected_indices = b''.join(indices[face * 12:face * 12 + 12] for face in base_source_ids)
    require(base_indices == expected_indices and len(base_indices) == BASE_FACES * 12, 'Base active faces are not exactly the certified interior cleanup')
    return source_doc, source_bin, base_doc, base_bin, indices, parts, interior, base_source_ids, base_indices


def frozen_selection(parts):
    ids = sorted(face for component in COMPONENTS for face in parts[component])
    return {'schema': 'crwt.exterior.ablation.selection.v1', 'purpose': 'Visual comparison only; not a hair-design approval',
            'originalSourceMeshSha256': SOURCE_SHA, 'baseInteriorCandidateSha256': BASE_SHA,
            'cleanupProofSha256': CLEANUP_PROOF_SHA, 'sourceFaceCount': SOURCE_FACES,
            'baseFaceCount': BASE_FACES, 'sourceComponentIds': [2, 3, 4], 'removedFaceCount': ABLATION_FACES,
            'components': [{'id': component, 'faces': count, 'sourceFaceMembershipSha256': expected}
                           for component, (count, expected) in COMPONENTS.items()],
            'sourceOriginalFaceIds': ids, 'sourceFaceMembershipSha256': membership_sha(ids),
            'retainedSourceComponentIds': [1, 9], 'vertexPositionsEdited': False, 'accepted': False}


def rle(ids):
    runs = []
    for face in ids:
        if runs and runs[-1][0] + runs[-1][1] == face:
            runs[-1][1] += 1
        else:
            runs.append([face, 1])
    return runs


def front_remap(path, all_removed, output_sha):
    raw = path.read_bytes(); require(digest(raw) == FRONT_SHA, 'Frozen front-selection SHA mismatch')
    original = json.loads(raw); ids, end = [], 0
    require(original['sourceMeshSha256'] == SOURCE_SHA and original['sourceFaceCount'] == SOURCE_FACES, 'Front selection source mismatch')
    for start, count in original['projectedFaceRle']:
        require(type(start) is int and type(count) is int and start >= end and count > 0 and start + count <= SOURCE_FACES, 'Invalid original front RLE')
        ids.extend(range(start, start + count)); end = start + count
    require(len(ids) == original['selectedFaceCount'] == 103443, 'Front selection count changed')
    removed_set = set(all_removed); kept = [face for face in ids if face not in removed_set]
    remapped = [face - bisect.bisect_left(all_removed, face) for face in kept]
    return {'schema': 'crwt.exterior.ablation.front-remap.v1', 'originalSourceMeshSha256': SOURCE_SHA,
            'candidateMeshSha256': output_sha, 'originalFrontSelectionSha256': FRONT_SHA,
            'originalProjectedFaces': len(ids), 'projectedFacesRemovedByAblation': len(ids) - len(kept),
            'projectedFacesRetained': len(kept), 'candidateProjectedFaceRle': rle(remapped),
            'visibilityRecalculated': False, 'uvProjectionUnchanged': True, 'accepted': False,
            'purpose': 'Index transport only. No texture generated and no visual approval.'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--original', type=pathlib.Path, required=True)
    parser.add_argument('--base-candidate', type=pathlib.Path, required=True)
    parser.add_argument('--cleanup-proof', type=pathlib.Path, required=True)
    parser.add_argument('--selection', type=pathlib.Path, required=True)
    parser.add_argument('--selection-sha256', required=True)
    parser.add_argument('--confirm-exterior-ablation-review', action='store_true')
    parser.add_argument('--out', type=pathlib.Path, required=True)
    parser.add_argument('--proof', type=pathlib.Path, help='Separate proof output (for example *.ci-ablation-proof.json)')
    parser.add_argument('--expected-output-sha256')
    parser.add_argument('--front-selection', type=pathlib.Path)
    parser.add_argument('--overwrite', action='store_true')
    args = parser.parse_args()
    require(args.confirm_exterior_ablation_review, 'Explicit exterior-ablation review flag required; this is not proven invisible interior cleanup')
    inputs = [args.original.resolve(), args.base_candidate.resolve(), args.cleanup_proof.resolve(), args.selection.resolve()] + ([args.front_selection.resolve()] if args.front_selection else [])
    output = args.out.resolve()
    proof_path = args.proof.resolve() if args.proof else output.with_suffix('.ablation-proof.json')
    remap_path = output.with_suffix('.front-selection-remap.json') if args.front_selection else None
    outputs = [output, proof_path] + ([remap_path] if remap_path else [])
    require(len(set(outputs)) == len(outputs), 'Output paths must differ')
    for path in outputs:
        require(path not in inputs, 'Output must not overwrite input')
        if path.exists():
            require(not any(path.samefile(source) for source in inputs), 'Output aliases source input')
            require(args.overwrite, 'Output already exists; explicit overwrite required')
    for index, path in enumerate(outputs):
        for other in outputs[index + 1:]:
            if path.exists() and other.exists():
                require(not path.samefile(other), 'Output files must not alias one another')
    source_doc, source_bin, base_doc, base_bin, indices, parts, interior, base_source_ids, base_indices = validate_inputs(args.original, args.base_candidate, args.cleanup_proof)
    selection_raw = args.selection.read_bytes()
    require(digest(selection_raw) == args.selection_sha256, 'Reviewed frozen selection SHA mismatch')
    require(json.loads(selection_raw) == frozen_selection(parts), 'Frozen selection is not exactly source components 2/3/4')
    removed = sorted(face for component in COMPONENTS for face in parts[component]); removed_set = set(removed)
    require(len(removed) == ABLATION_FACES and not set(interior).intersection(removed_set), 'Ablation/interior selections overlap or count changed')
    ablated_base_ids = [index for index, source_face in enumerate(base_source_ids) if source_face in removed_set]
    kept_source_ids = [face for face in base_source_ids if face not in removed_set]
    require(kept_source_ids == sorted(parts[1] + parts[9]), 'Variant would change main component or tiny component9')
    retained = b''.join(indices[face * 12:face * 12 + 12] for face in kept_source_ids)
    require(len(retained) == (BASE_FACES - ABLATION_FACES) * 12, 'Retained face count mismatch')
    candidate = copy.deepcopy(base_doc); binary = bytearray(base_bin); binary.extend(b'\0' * (-len(binary) % 4))
    candidate['bufferViews'].append({'buffer': 0, 'byteOffset': len(binary), 'byteLength': len(retained), 'target': 34963}); binary.extend(retained)
    candidate['accessors'].append({'bufferView': len(candidate['bufferViews']) - 1, 'componentType': 5125, 'count': len(kept_source_ids) * 3, 'type': 'SCALAR'})
    active_accessor = len(candidate['accessors']) - 1; candidate['meshes'][0]['primitives'][0]['indices'] = active_accessor
    candidate['asset']['generator'] = 'CRWT V11 exterior component ablation; visual review only; unapproved'
    extras = candidate.setdefault('extras', {})
    if 'interiorCleanupCandidate' in extras:
        extras['parentInteriorCleanupCandidate'] = extras.pop('interiorCleanupCandidate')
    extras['exteriorAblationReview'] = {'originalSourceMeshSha256': SOURCE_SHA, 'baseInteriorCandidateSha256': BASE_SHA,
                                      'selectionSha256': args.selection_sha256, 'sourceComponentIdsRemoved': [2, 3, 4],
                                      'additionalFacesRemoved': ABLATION_FACES, 'retainedFaceCount': len(kept_source_ids),
                                      'retainedSourceComponentIds': [1, 9], 'vertexPositionsEdited': False,
                                      'accepted': False, 'productionReady': False, 'hairDesignFixed': False, 'gameAssetsChanged': False}
    candidate['buffers'][0]['byteLength'] = len(binary); binary.extend(b'\0' * (-len(binary) % 4))
    encoded = json.dumps(candidate, separators=(',', ':')).encode('utf-8'); encoded += b' ' * (-len(encoded) % 4)
    result = struct.pack('<4sII', b'glTF', 2, 28 + len(encoded) + len(binary)) + struct.pack('<II', len(encoded), 0x4e4f534a) + encoded + struct.pack('<II', len(binary), 0x004e4942) + binary
    check_doc, check_bin = read_glb(result)
    require(check_bin[:len(base_bin)] == base_bin and check_bin[:len(source_bin)] == source_bin, 'Base/source binary prefix changed')
    require(check_doc['nodes'] == base_doc['nodes'] and check_doc['scenes'] == base_doc['scenes'], 'Source transforms changed')
    require(check_doc['accessors'][:-1] == base_doc['accessors'] and check_doc['bufferViews'][:-1] == base_doc['bufferViews'], 'Base accessors/views changed')
    require(accessor_bytes(check_doc, check_bin, 1) == accessor_bytes(source_doc, source_bin, 1) and accessor_bytes(check_doc, check_bin, active_accessor) == retained, 'Retained position/triangle bytes changed')
    output_sha = digest(result)
    if args.expected_output_sha256:
        require(output_sha == args.expected_output_sha256, 'Output differs from pinned variant; refusing to write')
    all_removed = sorted(interior + removed)
    proof = {'schema': 'crwt.exterior.ablation.proof.v1', 'status': 'visual-comparison-ablation-candidate-unapproved',
             'sourceMeshSha256': SOURCE_SHA, 'baseInteriorCandidateSha256': BASE_SHA, 'cleanupProofSha256': CLEANUP_PROOF_SHA,
             'selectionSha256': args.selection_sha256, 'candidateMeshSha256': output_sha, 'candidateBytes': len(result),
             'sourceFaces': SOURCE_FACES, 'baseFaces': BASE_FACES, 'additionalFacesRemoved': ABLATION_FACES,
             'totalOriginalSourceFacesOmitted': len(all_removed), 'retainedFaces': len(kept_source_ids),
             'sourceComponentIdsRemovedByAblation': [2, 3, 4], 'retainedSourceComponentIds': [1, 9],
             'removedOriginalSourceFaceIds': removed, 'removedBaseCandidateFaceIds': ablated_base_ids,
             'allOmittedOriginalSourceFaceIds': all_removed, 'retainedActiveIndexBytesSha256': digest(retained),
             'sourcePositionAccessorSha256': POSITION_SHA, 'sourceOriginalIndexAccessorSha256': INDICES_SHA,
             'baseBinPrefixByteIdentical': True, 'sourceBinPrefixByteIdentical': True, 'storedVerticesRetained': VERTICES,
             'mainAndComponent9TriangleBytesAndOrderPreserved': True, 'sourceNodesAndScenesPreserved': True,
             'originalAccessorsAndBufferViewsPreserved': True, 'vertexPositionsEdited': False, 'normalsAdded': False,
             'uvAdded': False, 'textureAdded': False, 'geometryRemeshed': False, 'accepted': False,
             'productionReady': False, 'hairDesignFixed': False, 'gameAssetsChanged': False,
             'limitations': ['External islands are visible and may be intentional hair details; deletion is only a comparison variant.',
                             'Main hair loops/root, eye relief, hands/fingers/cuffs and self-intersections are unchanged.',
                             'Tiny eye/poni-adjacent source component9 is retained.',
                             'No render/visual approval is established by this exporter; compare actual meshes from all sides.',
                             'Inactive source/base indices and unused positions are preserved, so the file grows.']}
    remap = front_remap(args.front_selection, all_removed, output_sha) if args.front_selection else None
    for path in outputs:
        path.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(result)
    proof_path.write_text(json.dumps(proof, indent=2) + '\n', encoding='utf-8', newline='\n')
    if remap:
        remap_path.write_text(json.dumps(remap, separators=(',', ':')) + '\n', encoding='utf-8', newline='\n')
    require(digest(args.original.read_bytes()) == SOURCE_SHA and digest(args.base_candidate.read_bytes()) == BASE_SHA, 'Source unexpectedly changed')
    print(json.dumps({'output': str(output), 'sha256': output_sha, 'bytes': len(result), 'removed_faces': ABLATION_FACES,
                      'retained_faces': len(kept_source_ids), 'retained_components': [1, 9], 'proof': str(proof_path),
                      'front_projected_faces_removed': remap['projectedFacesRemovedByAblation'] if remap else None}))


if __name__ == '__main__':
    main()

"""Build a separate V11 candidate by removing only five certified interior shells.

The original BIN/accessors/POSITION/indices/nodes/scenes remain byte-identical.
One appended index accessor activates retained triangles in their original order.
This is a candidate, not character approval, rigging, or game asset integration.
Execution requires the exact containment proof hash and a deliberate CLI flag.
Python 3.10+ standard library only. No welding, reindexing, or vertex editing.
"""

import argparse
import bisect
import copy
import hashlib
import json
import pathlib
import struct
import sys


SOURCE_SHA = 'd0a0fea651079aa98d026a1610ef0a9e7f4c14c0c466cb1d949886df45c24a66'
POSITION_SHA = '416825b530ca4cdae092800cb917a2ffdbc5f30202f6621b58d5ce80219218e6'
INDICES_SHA = 'e5a321d62cdacca1924f83c966dbba454cba7edcafa444d2fc320cfe1ba1c941'
FRONT_SELECTION_SHA = 'e40c2db62e6089c289ac58b7a6252205ddb239d22ba797b16590b24223970f94'
VERTICES, FACES, REMOVED_FACES = 224713, 449582, 418
COMPONENTS = {
    5: (188, '3027a48c92307ef3ab8b0ee4e5533826b42bb78b4e8e2c3faaed939ddda21994'),
    6: (124, '18a9f92b2bbd84615085daf33621f1edb9f31c41f59786e625e4af5a85c68abd'),
    7: (82, 'ddedf1febaec49bf5789292dd5182e75197914244ea38b400ea85345528c0b95'),
    8: (16, 'bb38102c5190e84046a2883d2886d4efc57ae852321d7852bcfbbad5cd55c34e'),
    10: (8, 'bbff14efc9344801b7e017f2a805f80cf50f133f200ebc89545ff4917e5d9cf4')}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def face_membership_sha(ids):
    return digest(b''.join(struct.pack('<Q', i) for i in ids))


def read_glb(raw):
    require(len(raw) >= 28 and struct.unpack_from('<4sII', raw) == (b'glTF', 2, len(raw)),
            'Expected complete GLB 2.0.')
    doc, binary, offset = None, None, 12
    while offset < len(raw):
        require(offset + 8 <= len(raw), 'Truncated chunk header.')
        size, kind = struct.unpack_from('<II', raw, offset)
        offset += 8
        data = raw[offset:offset + size]
        require(len(data) == size, 'Truncated chunk.')
        if kind == 0x4E4F534A:
            require(doc is None, 'Duplicate JSON chunk.')
            doc = json.loads(data.rstrip(b' \0'))
        elif kind == 0x004E4942:
            require(binary is None, 'Duplicate BIN chunk.')
            binary = data
        else:
            raise ValueError('Unknown GLB chunk.')
        offset += size
    require(doc is not None and binary is not None, 'Missing embedded JSON/BIN.')
    require(len(doc.get('buffers', [])) == 1 and 'uri' not in doc['buffers'][0],
            'Expected one embedded source buffer.')
    return doc, binary


def accessor_bytes(doc, binary, index):
    accessor = doc['accessors'][index]
    require('sparse' not in accessor and not accessor.get('normalized'), 'Unsupported accessor.')
    width = {'SCALAR': 1, 'VEC3': 3}[accessor['type']]
    require(accessor['componentType'] in (5125, 5126), 'Expected packed u32/f32 accessor.')
    view = doc['bufferViews'][accessor['bufferView']]
    require(view.get('buffer', 0) == 0 and view.get('byteStride', width * 4) == width * 4,
            'Interleaved/external accessor unsupported.')
    start = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
    size = accessor['count'] * width * 4
    data = binary[start:start + size]
    require(len(data) == size, 'Accessor exceeds BIN.')
    return data


def independent_component_faces(source_indices):
    """Mirror the audited indexed connectivity numbering without using the report.

    Union by rank in original triangle order, then sort by descending face count
    and union root ID. Hash-pinned membership makes numbering ambiguity fail.
    """
    parents, ranks = list(range(VERTICES)), bytearray(VERTICES)

    def find(i):
        while parents[i] != i:
            parents[i] = parents[parents[i]]
            i = parents[i]
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

    triangles = list(struct.iter_unpack('<3I', source_indices))
    for a, b, c in triangles:
        require(a < VERTICES and b < VERTICES and c < VERTICES, 'Index exceeds POSITION.')
        union(a, b)
        union(a, c)
    roots = {}
    for i, triangle in enumerate(triangles):
        roots.setdefault(find(triangle[0]), []).append(i)
    ordered = sorted(roots, key=lambda root: (-len(roots[root]), root))
    require(len(ordered) == 10, 'Original source component count changed.')
    return {rank + 1: roots[root] for rank, root in enumerate(ordered)}, triangles


def validate_containment(proof, component_faces):
    require(proof.get('source_sha256') == SOURCE_SHA
            and proof.get('source_position_accessor_sha256') == POSITION_SHA
            and proof.get('source_indices_accessor_sha256') == INDICES_SHA,
            'Containment proof refers to a different source.')
    require(proof.get('safe_for_candidate_removal') is True,
            'Full containment proof has not authorized a separate candidate.')
    expected_ids = sorted(COMPONENTS)
    require(proof.get('proven_interior_component_ids') == expected_ids
            and proof.get('proven_interior_face_count') == REMOVED_FACES,
            'This exporter only accepts all five pre-audited interior components.')
    remove_ids = sorted(face for component in expected_ids for face in component_faces[component])
    for component, (count, expected_hash) in COMPONENTS.items():
        ids = component_faces[component]
        require(len(ids) == count and face_membership_sha(ids) == expected_hash,
                'Independent component membership mismatch: ' + str(component))
    require(proof.get('proven_interior_source_face_ids') == remove_ids,
            'Proof removal face IDs do not match independently computed components.')
    require(len(remove_ids) == REMOVED_FACES and len(set(remove_ids)) == REMOVED_FACES,
            'Removal face IDs are duplicated or incomplete.')
    certificates = proof.get('component_certificates')
    require(isinstance(certificates, list), 'Missing full component certificates.')
    by_id = {entry.get('component_id'): entry for entry in certificates}
    for component in expected_ids:
        entry = by_id.get(component, {})
        require(entry.get('source_face_ids') == component_faces[component],
                'Certificate face membership mismatch: ' + str(component))
        require(entry.get('all_vertices_strictly_inside') is True
                and entry.get('all_triangle_pairs_separated') is True
                and entry.get('ambiguous_pair_count') == 0,
                'Incomplete/uncertain full-surface certificate: ' + str(component))
    return remove_ids


def rle(ids):
    runs = []
    for face in ids:
        if runs and runs[-1][0] + runs[-1][1] == face:
            runs[-1][1] += 1
        else:
            runs.append([face, 1])
    return runs


def transport_front_selection(raw, removed, triangles, candidate_sha):
    require(digest(raw) == FRONT_SELECTION_SHA, 'Frozen front selection hash mismatch.')
    source = json.loads(raw)
    require(source.get('sourceMeshSha256') == SOURCE_SHA
            and source.get('sourceFaceCount') == FACES
            and source.get('selectedFaceCount') == 103443, 'Frozen front selection source mismatch.')
    original_ids, end = [], 0
    for start, count in source['projectedFaceRle']:
        require(type(start) is int and type(count) is int and start >= end
                and count > 0 and start + count <= FACES, 'Invalid frozen front face run.')
        original_ids.extend(range(start, start + count))
        end = start + count
    require(len(original_ids) == 103443, 'Frozen selected face count mismatch.')
    removed_set = set(removed)
    require(not removed_set.intersection(original_ids),
            'An interior removal unexpectedly affects a previously projected visible triangle.')
    remapped = [face - bisect.bisect_left(removed, face) for face in original_ids]
    retained_triangles = [triangle for i, triangle in enumerate(triangles) if i not in removed_set]
    require(all(retained_triangles[new] == triangles[old] for old, new in zip(original_ids, remapped)),
            'Transported projection face geometry differs.')
    return {'schemaVersion': 1, 'purpose': 'Transport only; original diagnostic front texture remains unapproved.',
            'originalSourceMeshSha256': SOURCE_SHA, 'candidateMeshSha256': candidate_sha,
            'originalFrontSelectionSha256': FRONT_SELECTION_SHA,
            'sourceOriginalFaceCount': FACES, 'candidateFaceCount': FACES - REMOVED_FACES,
            'projectedFaceCount': len(remapped), 'originalProjectedFacesRemoved': 0,
            'projectedFaceGeometryExactlyPreserved': True,
            'uvProjectionUnchanged': True, 'visibilityRecalculated': False,
            'candidateProjectedFaceRle': rle(remapped),
            'mappingRule': 'candidate_face_id = original_face_id minus count(removed IDs less than original ID)',
            'removedOriginalSourceFaceIds': removed, 'accepted': False, 'productionReady': False}


def check_outputs(outputs, inputs, overwrite):
    require(len(set(outputs)) == len(outputs), 'Output paths must differ.')
    for target in outputs:
        require(target not in inputs, 'Output must not overwrite an input.')
        if target.exists():
            require(not any(target.samefile(source) for source in inputs), 'Output aliases an input.')
            require(overwrite, 'Output exists; --overwrite is required: ' + str(target))
    for i, target in enumerate(outputs):
        for other in outputs[i + 1:]:
            if target.exists() and other.exists():
                require(not target.samefile(other), 'Output files must not alias one another.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mesh', type=pathlib.Path)
    parser.add_argument('--containment-proof', type=pathlib.Path, required=True)
    parser.add_argument('--containment-proof-sha256', required=True)
    parser.add_argument('--expected-output-sha256',
                        help='Optional pinned candidate SHA256 for exact reproduction after the first reviewed export.')
    parser.add_argument('--confirm-proven-interior-candidate', action='store_true')
    parser.add_argument('--out', type=pathlib.Path, required=True)
    parser.add_argument('--proof', type=pathlib.Path)
    parser.add_argument('--transport-front-selection', type=pathlib.Path)
    parser.add_argument('--texture-remap-out', type=pathlib.Path)
    parser.add_argument('--overwrite', action='store_true')
    args = parser.parse_args()
    require(args.confirm_proven_interior_candidate,
            'Candidate generation is gated until the final containment proof is reviewed.')
    require(len(args.containment_proof_sha256) == 64
            and all(c in '0123456789abcdef' for c in args.containment_proof_sha256),
            'Provide the explicit lowercase SHA256 of the reviewed containment proof.')
    output = args.out.resolve()
    proof_path = args.proof.resolve() if args.proof else output.with_suffix('.cleanup-proof.json')
    remap_path = None
    if args.transport_front_selection:
        remap_path = (args.texture_remap_out.resolve() if args.texture_remap_out
                      else output.with_suffix('.front-selection-remap.json'))
    require(not args.texture_remap_out or remap_path, 'A remap output requires frozen front selection input.')
    inputs = [args.mesh.resolve(), args.containment_proof.resolve()]
    if args.transport_front_selection:
        inputs.append(args.transport_front_selection.resolve())
    outputs = [output, proof_path] + ([remap_path] if remap_path else [])
    check_outputs(outputs, inputs, args.overwrite)
    source_raw = args.mesh.read_bytes()
    containment_raw = args.containment_proof.read_bytes()
    require(digest(source_raw) == SOURCE_SHA, 'Actual V11 source mesh SHA mismatch.')
    require(digest(containment_raw) == args.containment_proof_sha256, 'Containment proof SHA mismatch.')
    containment = json.loads(containment_raw)
    doc, binary = read_glb(source_raw)
    require(len(doc.get('meshes', [])) == 1 and len(doc['meshes'][0]['primitives']) == 1,
            'Source primitive structure changed.')
    primitive = doc['meshes'][0]['primitives'][0]
    require(primitive['attributes'] == {'POSITION': 1} and primitive['indices'] == 0
            and primitive.get('mode', 4) == 4, 'Expected the original V11 indexed POSITION-only primitive.')
    positions, indices = accessor_bytes(doc, binary, 1), accessor_bytes(doc, binary, 0)
    require(len(positions) == VERTICES * 12 and digest(positions) == POSITION_SHA,
            'Original POSITION accessor mismatch.')
    require(len(indices) == FACES * 12 and digest(indices) == INDICES_SHA,
            'Original index accessor mismatch.')
    component_faces, triangles = independent_component_faces(indices)
    removed = validate_containment(containment, component_faces)
    removed_set = set(removed)
    retained = b''.join(indices[i * 12:(i + 1) * 12] for i in range(FACES) if i not in removed_set)
    require(len(retained) == (FACES - REMOVED_FACES) * 12, 'Retained triangle count mismatch.')
    candidate = copy.deepcopy(doc)
    candidate_binary = bytearray(binary)
    candidate_binary.extend(b'\0' * (-len(candidate_binary) % 4))
    candidate['bufferViews'].append({'buffer': 0, 'byteOffset': len(candidate_binary),
                                      'byteLength': len(retained), 'target': 34963})
    candidate_binary.extend(retained)
    candidate['accessors'].append({'bufferView': len(candidate['bufferViews']) - 1,
                                    'componentType': 5125, 'count': (FACES - REMOVED_FACES) * 3,
                                    'type': 'SCALAR'})
    new_index = len(candidate['accessors']) - 1
    candidate['meshes'][0]['primitives'][0]['indices'] = new_index
    candidate['asset']['generator'] = 'CRWT V11 certified-interior cleanup candidate; unapproved'
    candidate.setdefault('extras', {})['interiorCleanupCandidate'] = {
        'accepted': False, 'productionReady': False, 'sourceMeshSha256': SOURCE_SHA,
        'containmentProofSha256': args.containment_proof_sha256,
        'removedSourceComponentIds': sorted(COMPONENTS), 'removedFaceCount': REMOVED_FACES,
        'retainedFaceCount': FACES - REMOVED_FACES, 'vertexPositionsEdited': False,
        'externalComponentIdsRetained': [1, 2, 3, 4, 9], 'gameAssetsChanged': False}
    candidate['buffers'][0]['byteLength'] = len(candidate_binary)
    candidate_binary.extend(b'\0' * (-len(candidate_binary) % 4))
    encoded = json.dumps(candidate, separators=(',', ':')).encode('utf-8')
    encoded += b' ' * (-len(encoded) % 4)
    result = struct.pack('<4sII', b'glTF', 2, 28 + len(encoded) + len(candidate_binary))
    result += struct.pack('<II', len(encoded), 0x4E4F534A) + encoded
    result += struct.pack('<II', len(candidate_binary), 0x004E4942) + candidate_binary
    check_doc, check_bin = read_glb(result)
    require(check_bin[:len(binary)] == binary, 'Original BIN prefix changed.')
    require(check_doc['nodes'] == doc['nodes'] and check_doc['scenes'] == doc['scenes'],
            'Original nodes/scenes changed.')
    require(check_doc['accessors'][:len(doc['accessors'])] == doc['accessors']
            and check_doc['bufferViews'][:len(doc['bufferViews'])] == doc['bufferViews'],
            'Original accessors/buffer views changed.')
    require(accessor_bytes(check_doc, check_bin, 1) == positions
            and accessor_bytes(check_doc, check_bin, 0) == indices
            and accessor_bytes(check_doc, check_bin, new_index) == retained,
            'Original or retained triangle bytes changed.')
    candidate_sha = digest(result)
    if args.expected_output_sha256:
        require(candidate_sha == args.expected_output_sha256,
                'Candidate differs from the pinned reviewed output; refusing to write.')
    remap = None
    frozen_raw = None
    if args.transport_front_selection:
        frozen_raw = args.transport_front_selection.read_bytes()
        remap = transport_front_selection(frozen_raw, removed, triangles, candidate_sha)
    proof = {'status': 'certified-interior-cleanup-candidate-unapproved',
             'pythonVersion': sys.version.split()[0], 'sourceMeshSha256': SOURCE_SHA,
             'containmentProofSha256': args.containment_proof_sha256,
             'candidateMeshSha256': candidate_sha, 'candidateBytes': len(result),
             'sourceFaces': FACES, 'removedFaces': REMOVED_FACES, 'retainedFaces': FACES - REMOVED_FACES,
             'sourceStoredVertices': VERTICES, 'storedVerticesRetained': VERTICES,
             'removedOriginalSourceFaceIds': removed,
             'removedSourceComponentIds': sorted(COMPONENTS), 'retainedSourceComponentIds': [1, 2, 3, 4, 9],
             'removedSourceFaceMembershipSha256': face_membership_sha(removed),
             'retainedActiveIndexBytesSha256': digest(retained),
             'sourcePositionAccessorSha256': POSITION_SHA, 'sourceOriginalIndexAccessorSha256': INDICES_SHA,
             'sourceBinPrefixByteIdentical': True, 'originalAccessorsAndBufferViewsPreserved': True,
             'sourcePositionAndOriginalIndexBytesPreserved': True, 'sourceNodesAndScenesPreserved': True,
             'retainedTriangleIndicesAndOrderByteIdentical': True, 'entireExternalComponentsRetained': True,
             'unusedInteriorVerticesRetainedInSourcePositionBuffer': True,
             'normalsAdded': False, 'uvAdded': False, 'textureAdded': False,
             'geometryRemeshed': False, 'vertexPositionsEdited': False, 'gameAssetsChanged': False,
             'accepted': False, 'productionReady': False,
             'silhouetteVerification': 'Pending root rendered depth/silhouette comparisons; not certified by this exporter.',
             'limitations': ['Only five strictly interior components are omitted from the active triangle array.',
                             'Hair loops, eye relief, fused fingers/cuffs, external islands and self-intersections are unchanged.',
                             'Original BIN including inactive indices/unused vertices remains for preservation, so file size grows.',
                             'Original Hunyuan mesh extras remain source generation provenance; active accessor count defines candidate triangles.',
                             'This candidate does not approve anatomy, UVs, rigging, deformation or game integration.']}
    if remap:
        proof['frozenFrontSelectionSha256'] = FRONT_SELECTION_SHA
        proof['projectedOriginalSourceFacesRemoved'] = 0
        proof['projectedFrontFaceGeometryExactlyPreserved'] = True
    mode = 'wb' if args.overwrite else 'xb'
    for target in outputs:
        target.parent.mkdir(parents=True, exist_ok=True)
    with output.open(mode) as handle:
        handle.write(result)
    require(digest(output.read_bytes()) == candidate_sha, 'Written candidate hash mismatch.')
    proof['sourceFilesPreservedSha256Match'] = (digest(args.mesh.read_bytes()) == SOURCE_SHA
        and digest(args.containment_proof.read_bytes()) == args.containment_proof_sha256
        and (not frozen_raw or args.transport_front_selection.read_bytes() == frozen_raw))
    require(proof['sourceFilesPreservedSha256Match'], 'An input changed during export.')
    with proof_path.open(mode) as handle:
        handle.write((json.dumps(proof, indent=2) + '\n').encode('utf-8'))
    if remap:
        with remap_path.open(mode) as handle:
            handle.write((json.dumps(remap, separators=(',', ':')) + '\n').encode('utf-8'))
    print(json.dumps({key: proof[key] for key in ('status', 'candidateMeshSha256', 'candidateBytes',
                     'removedFaces', 'retainedFaces', 'sourceFilesPreservedSha256Match')}
                    | {'output': str(output), 'proof': str(proof_path),
                       'textureRemap': str(remap_path) if remap_path else None}), flush=True)


if __name__ == '__main__':
    main()

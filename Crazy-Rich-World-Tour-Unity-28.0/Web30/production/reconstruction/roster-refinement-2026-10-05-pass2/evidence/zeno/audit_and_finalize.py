"""Read frozen Zeno V2, audit original channels/new trim, then create handoff.

No model, image, Blender workspace or existing proof is rewritten. The packed
native reopen is done by a separate Blender process before --finalize.
"""
import argparse, collections, hashlib, importlib.util, json, math, pathlib, struct

HERE = pathlib.Path(__file__).resolve().parent
WORKSPACE = HERE.parents[2]
FOLDER = HERE / 'trial-v2'
SOURCE = WORKSPACE / 'outputs/model-review-2026-10-05/viewer/models/zeno.glb'
REFERENCE = WORKSPACE / 'outputs/model-review-2026-10-05/viewer/references/zeno.png'
CANDIDATE = FOLDER / 'zeno-fitted-rim-beads-candidate.glb'
BLEND = CANDIDATE.with_suffix('.blend')
SOURCE_SHA = 'b79dd20f263f29cf6c9f368d2094cd997567c7ae359339511af0875becbeb7e9'
CANDIDATE_SHA = '7670b51db86958a7e956df8053de4fcff959046a0853920cfbf0e3e859f52c88'
REFERENCE_SHA = '4f3409d6e7dde581ceb022af100d4ce221bf44437148cd8dedc0375153852bcb'

def require(condition, message):
    if not condition:
        raise ValueError(message)

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def fresh_json(path, value):
    with path.open('x', encoding='utf-8', newline='\n') as stream:
        stream.write(json.dumps(value, indent=2) + '\n')

def parse(raw):
    require(struct.unpack_from('<4sII', raw) == (b'glTF', 2, len(raw)), 'Invalid GLB header')
    chunks = []; offset = 12
    while offset < len(raw):
        size, kind = struct.unpack_from('<II', raw, offset)
        require(size % 4 == 0 and offset + 8 + size <= len(raw), 'Chunk bounds')
        chunks.append((kind, raw[offset + 8:offset + 8 + size])); offset += 8 + size
    require(offset == len(raw) and [kind for kind, _ in chunks] == [0x4e4f534a, 0x004e4942], 'JSON/BIN chunks required')
    return json.loads(chunks[0][1]), chunks[1][1]

def accessor(doc, binary, number):
    acc = doc['accessors'][number]; view = doc['bufferViews'][acc['bufferView']]
    require('sparse' not in acc, 'Sparse accessor unsupported in this narrow audit')
    code = {5126:'f', 5125:'I', 5123:'H', 5121:'B'}[acc['componentType']]
    width = {'SCALAR':1, 'VEC2':2, 'VEC3':3, 'VEC4':4}[acc['type']]
    fmt = struct.Struct('<' + code * width)
    start = view.get('byteOffset', 0) + acc.get('byteOffset', 0)
    return [fmt.unpack_from(binary, start + row * view.get('byteStride', fmt.size)) for row in range(acc['count'])]

def sub(a, b): return tuple(x - y for x, y in zip(a, b))
def dot(a, b): return sum(x * y for x, y in zip(a, b))
def cross(a, b): return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])

def audit():
    require(sha(SOURCE) == SOURCE_SHA and sha(CANDIDATE) == CANDIDATE_SHA and sha(REFERENCE) == REFERENCE_SHA, 'Pinned input mismatch')
    original, oldbin = parse(SOURCE.read_bytes()); doc, binary = parse(CANDIDATE.read_bytes())
    require(binary[:len(oldbin)] == oldbin, 'Original BIN changed')
    tables = ('accessors','bufferViews','meshes','nodes','materials','textures','images','samplers','skins','animations')
    records = {key:doc.get(key, [])[:len(original.get(key, []))] == original.get(key, []) for key in tables}
    require(all(records.values()), 'Original record changed')
    require(doc.get('scene', 0) == original.get('scene', 0), 'Default scene changed')
    require(len(doc['scenes']) == len(original['scenes']), 'Scene count changed')
    for i, oldscene in enumerate(original['scenes']):
        actualscene = dict(doc['scenes'][i]); roots = actualscene.pop('nodes', [])
        previousscene = dict(oldscene); oldroots = previousscene.pop('nodes', [])
        require(actualscene == previousscene and roots[:len(oldroots)] == oldroots, 'Original scene roots/properties changed')
        if i != doc.get('scene', 0): require(roots == oldroots, 'Nondefault scene changed')
        else: require(roots[len(oldroots):] == list(range(len(original['nodes']), len(doc['nodes']))), 'Only new trim nodes may be added')
    for key in set(original) - set(tables) - {'buffers', 'scenes'}:
        require(doc.get(key) == original[key], 'Other top-level source record changed: ' + key)
    require(len(doc['meshes']) == len(original['meshes']) + 2 and len(doc['nodes']) == len(original['nodes']) + 2 and len(doc['materials']) == len(original['materials']) + 1, 'Trim-only additive contract')
    require(len(doc['images']) == len(original['images']) == 2, 'No new images permitted')
    new_parts = []
    for mesh in doc['meshes'][len(original['meshes']):]:
        require(len(mesh['primitives']) == 1, 'One primitive per new trim')
        p = mesh['primitives'][0]; positions = accessor(doc, binary, p['attributes']['POSITION'])
        ids = [item[0] for item in accessor(doc, binary, p['indices'])]
        edges = collections.Counter(); directions = collections.Counter(); minarea = math.inf; volume = 0
        require(len(positions) == 1536 and len(ids) // 3 == 3072, 'Unexpected trim size')
        for offset in range(0, len(ids), 3):
            f = ids[offset:offset+3]; a, b, c = (positions[j] for j in f)
            normal = cross(sub(b, a), sub(c, a)); minarea = min(minarea, math.sqrt(dot(normal, normal)) / 2)
            volume += dot(a, cross(b, c)) / 6
            for u, v in zip(f, f[1:] + f[:1]):
                edges[tuple(sorted((u, v)))] += 1; directions[(u, v)] += 1
        require(set(edges.values()) == {2} and all(directions[(u,v)] == directions[(v,u)] == 1 for u,v in edges) and minarea > 1e-12 and volume > 0, 'Invalid new trim topology')
        new_parts.append({'name':mesh['name'], 'vertices':len(positions), 'faces':len(ids)//3, 'edge_incidence_two':True, 'opposite_edge_winding':True, 'minimum_triangle_area':minarea, 'signed_volume':volume})
    spec = importlib.util.spec_from_file_location('frozen_validator', WORKSPACE / 'work/model-rebuild/tools/validate_roster_candidate.py')
    validator = importlib.util.module_from_spec(spec); spec.loader.exec_module(validator)
    actual = validator.validate_model(CANDIDATE.read_bytes())
    require(actual['faces'] == 33300 and actual['vertices'] == 24679 and actual['skins'] == actual['clips'] == 0 and actual['images'] == 2, 'Actual model counts mismatch')
    report = {'schema':'crwt.zeno-independent-additive-audit.v1', 'source_sha256':SOURCE_SHA, 'candidate_sha256':CANDIDATE_SHA, 'reference_sha256':REFERENCE_SHA, 'source_bin_prefix_byte_identical':True, 'source_json_records_preserved':records, 'source_vertex_deltas':0, 'source_faces_removed':0, 'source_faces_retained':27156, 'added_vertices':3072, 'added_faces':6144, 'new_parts':new_parts, 'actual':actual, 'limits':['Independent audit certifies preserved source channels and each new bead closure/winding/nonzero area. It does not certify source or bead contacts, global manifold union, self-intersections, aesthetics, or deformation.','Fitted-plane bead segment behind retained touching fingers is manual inferred, not an exact all-surface seat certificate.'], 'approved':False, 'gameIntegrated':False}
    fresh_json(FOLDER / 'independent-preservation-topology-audit.json', report)
    fresh_json(FOLDER / 'final-glb-validation.json', actual)
    return report

def finalize():
    auditpath = FOLDER / 'independent-preservation-topology-audit.json'; report = json.loads(auditpath.read_bytes())
    reopenpath = FOLDER / 'editable-readonly-reopen-proof.json'; reopen = json.loads(reopenpath.read_bytes())
    geometrypath = CANDIDATE.with_suffix('.preservation-proof.json'); geometry = json.loads(geometrypath.read_bytes())
    render = FOLDER / 'final-actual-mesh-renders'; evidencepath = render / 'render-evidence.json'; evidence = json.loads(evidencepath.read_bytes())
    require(sha(SOURCE) == SOURCE_SHA and sha(CANDIDATE) == CANDIDATE_SHA and sha(REFERENCE) == REFERENCE_SHA, 'Pinned input mismatch')
    require(report['candidate_sha256'] == geometry['candidate_sha256'] == reopen['candidate_sha256'] == evidence['input_sha256'] == CANDIDATE_SHA and sha(BLEND) == reopen['blend_sha256'], 'Evidence hash mismatch')
    require(reopen['saved_geometry_normal_uv_transform_material_image_fingerprints_identical'] and reopen['packed_images_byte_identical_to_glb'] and reopen['all_file_images_packed'] and reopen['no_source_or_blend_writes'], 'Native reopen not passed')
    views = ['front','three-quarter','left','right','back','top','bottom']
    images = [render/(name+'.png') for name in views] + [render/'orbit'/('frame-%03d.png'%angle) for angle in range(0,360,15)]
    require({p.name for p in (render/'orbit').iterdir()} == {'frame-%03d.png'%angle for angle in range(0,360,15)}, 'Unexpected orbit contents')
    require(evidence['orbit_frames'] == 24 and evidence['production_approved'] is False and {v[0] for v in evidence['views']} == set(views) and evidence['polygons'] == 33300, 'Incomplete actual renders')
    for image in images: require(image.read_bytes()[:8] == b'\x89PNG\r\n\x1a\n', 'Missing PNG')
    recipes = [HERE/name for name in ('build_fitted_rim_beads.py','rim-fit-v2.json','save_and_reopen_editable.py','render_review_blender.py','audit_and_finalize.py')]
    limits = list(geometry['limits']) + ['The touching-finger-occluded segment uses an inferred fitted plane: 85 retained anchors max residual 0.00384, 43 excluded occluded rays max depth difference 0.04593. All touching fingers remain original.','Static unrigged candidate; no final visual/perfection approval or game integration.','Packed native blend is portable for editing. The local source defaults/recipe dependencies are provenance, not a single-command portable rebuild claim.']
    handoff = {'id':'zeno', 'source_path':str(SOURCE), 'source_sha256':SOURCE_SHA, 'reference_path':str(REFERENCE), 'reference_sha256':REFERENCE_SHA, 'candidate_path':str(CANDIDATE), 'candidate_sha256':CANDIDATE_SHA, 'candidate_bytes':CANDIDATE.stat().st_size, 'blend_path':str(BLEND), 'blend_sha256':sha(BLEND), 'blend_bytes':BLEND.stat().st_size, 'render_directory':str(render), 'preservation_proof_path':str(auditpath), 'reopen_proof_path':str(reopenpath), 'geometry_recipe_proof_path':str(geometrypath), 'recipe_paths':[str(p) for p in recipes], 'recipe_hashes':[{'path':str(p), 'sha256':sha(p)} for p in recipes], 'render_evidence_sha256':sha(evidencepath), 'renders':[{'path':p.relative_to(render).as_posix(), 'sha256':sha(p), 'bytes':p.stat().st_size} for p in images], 'stats':report['actual'], 'scope':{'operation':'Only thin volumetric warm-gold trim on two existing goggle rims; original lens/frame/fingers/scarf/hair retained.', 'source_faces_retained':27156, 'source_faces_removed':0, 'source_vertex_deltas':0, 'added_vertices':3072, 'added_faces':6144, 'original_bin_prefix_primitive_attributes_images_materials_nodes_exact':True, 'new_closed_components':2, 'new_topology_boundary_nonmanifold_inconsistent_winding_zeroarea':0, 'packed_original_images_byte_identical':True, 'root_visual_review':'Root inspected V2 reference-facing front/left/right and selected scoped unapproved trim; no geometry edits during finalization.'}, 'limits':limits, 'approved':False, 'gameIntegrated':False}
    frozen = json.dumps(handoff, indent=2) + '\n'
    for path in (FOLDER/'HANDOFF.json', HERE/'HANDOFF.json'):
        with path.open('x', encoding='utf-8', newline='\n') as stream: stream.write(frozen)
    note = '''# Zeno — trim kacamata lokal, pass2 05 Oktober 2026

Kandidat V2 menambahkan trim emas tipis ber-volume pada dua rim kacamata yang sudah ada. Semua 27.156 face sumber, posisi, normal, UV, tekstur, material dan transform tetap identik; BIN sumber menjadi prefix yang tidak berubah. Tambahan 3.072 vertex/6.144 face menghasilkan 33.300 face/24.679 vertex. Tidak ada lensa baru, tangan/scarf dipindah, atau geometri V2 diubah saat finalisasi.

Root telah meninjau depan/profil dan memilih V2 sebagai kandidat belum disetujui. Segmen yang tertutup jari memakai plane fit dari 85 anchor terlihat, dengan 43 anchor ray yang menyentuh jari dikecualikan. Kedalaman di balik jari bersifat inferensi. Kedua bead tertutup dan berorientasi konsisten secara individual; tidak ada klaim union welded, kontak global bebas intersection, deformasi atau kesempurnaan visual. Rambut, anatomi, lensa, scarf, warna dan belakang tetap sumber lama.

Native .blend dengan kedua image asli packed berhasil dibuka ulang read-only di Blender 5.2.2; fingerprint geometri/topologi/normal/UV/transform/material/gambar tetap sama. Review terdiri dari 7 view dan 24 orbit GLB aktual. HANDOFF.json memuat hash sumber/kandidat/native/proof/recipe/render. Model statis tanpa rig, approved=false dan gameIntegrated=false. Mulai edit dari salinan .blend; resep lokal disimpan sebagai provenance dan masih perlu penyesuaian path/dependensi untuk rebuild di mesin lain.
'''
    with (FOLDER/'MULAI-DI-SINI-ZENO.md').open('x', encoding='utf-8', newline='\n') as stream: stream.write(note)
    print(json.dumps({'handoff':str(HERE/'HANDOFF.json'), 'handoff_sha256':sha(HERE/'HANDOFF.json'), 'candidate_sha256':CANDIDATE_SHA, 'blend_sha256':sha(BLEND), 'renders':len(images), 'source_preserved':True}))

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__); parser.add_argument('--finalize', action='store_true'); args = parser.parse_args()
    if args.finalize: finalize()
    else: print(json.dumps(audit()))

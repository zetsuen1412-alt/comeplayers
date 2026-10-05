"""One pinned COLOR_0-only variant for the two existing Alexia rear locks.

Reads the unchanged approved atlas. Appends a new float color accessor; all
mild-candidate geometry and its entire original BIN remain untouched.
"""
import copy, hashlib, importlib.util, io, json, math, pathlib, struct, sys
from PIL import Image

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SOURCE = HERE / 'two-mild/alexia.glb'
BASELINE = ROOT / 'outputs/model-review-2026-10-05-profile-pass/viewer/models/alexia.glb'
REFERENCE = ROOT / 'outputs/model-review-2026-10-05-profile-pass/references/alexia-blue-v2-turnaround.png'
BUILDER = HERE / 'build_hair_locks.py'
OUTDIR = HERE / 'two-mild-smooth'
SOURCE_PIN = '9f0dcfb88e10fab3859602d4d197de45444e3fbb2acf53d9a4fec023e3f2153f'
BASELINE_PIN = '7ad88d0117c667e01877763e301b5cde8cca27985151cbb21be7b076b37b5cf3'
REF_PIN = '935b1f8f7d2be4a6a453a089041844f2cd4470eb64be17d9d72568efb3708933'
BUILDER_PIN = '7eaa77132d31da94112b67beb86bbe21ae3de29d5c55ad4a3cc1e8bc13b3b6f6'
sha = lambda b: hashlib.sha256(b).hexdigest()

def require(ok, message):
    if not ok: raise ValueError(message)

def float_accessor(d, binary, index, width):
    a = d['accessors'][index]; v = d['bufferViews'][a['bufferView']]
    require(a['componentType'] == 5126 and a['type'] == 'VEC'+str(width)
            and not a.get('sparse') and v['buffer'] == 0, 'Float accessor contract')
    start = v.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = v.get('byteStride', width*4)
    require(stride >= width*4 and start+(a['count']-1)*stride+width*4 <= v.get('byteOffset', 0)+v['byteLength'], 'Accessor range')
    values = [struct.unpack_from('<'+'f'*width, binary, start+i*stride) for i in range(a['count'])]
    require(all(math.isfinite(x) for row in values for x in row), 'Nonfinite accessor')
    return values

def main():
    require(not OUTDIR.exists(), 'Fresh owned output directory required')
    inputs = [(SOURCE, SOURCE_PIN), (BASELINE, BASELINE_PIN), (REFERENCE, REF_PIN), (BUILDER, BUILDER_PIN)]
    raw = {}
    for path, pin in inputs:
        raw[path] = path.read_bytes(); require(sha(raw[path]) == pin, 'Pinned input mismatch: '+str(path))
    sys.dont_write_bytecode = True
    spec = importlib.util.spec_from_file_location('frozen_hair_lock_helpers', BUILDER)
    frozen = importlib.util.module_from_spec(spec); spec.loader.exec_module(frozen)
    original, oldbin = frozen.read_glb(raw[SOURCE])
    baseline, baseline_bin = frozen.read_glb(raw[BASELINE])
    require(oldbin[:len(baseline_bin)] == baseline_bin, 'Original 7ad BIN prefix')
    primitive = original['meshes'][2]['primitives'][0]
    require(len(original['meshes']) == 3 and len(original['meshes'][2]['primitives']) == 1, 'Pinned mesh contract')
    attrs = primitive['attributes']
    positions = float_accessor(original, oldbin, attrs['POSITION'], 3)
    normals = float_accessor(original, oldbin, attrs['NORMAL'], 3)
    oldcolors = float_accessor(original, oldbin, attrs['COLOR_0'], 4)
    require(len(positions) == len(normals) == len(oldcolors) == 2596, 'Pinned 2-lock vertex count')
    im = Image.open(io.BytesIO(raw[REFERENCE])).convert('RGB')
    worldp = [frozen.local(p) for p in positions]; worldn = [frozen.local(n) for n in normals]
    reproduced = [frozen.color(im, p, n) for p, n in zip(worldp, worldn)]
    packed = lambda rows: b''.join(struct.pack('<4f', *row) for row in rows)
    require(packed(reproduced) == packed(oldcolors), 'Frozen atlas mapping does not reproduce existing COLOR_0')
    fallback = (212/255, 195/255, 239/255)
    kernel = [(dx, dy, math.exp(-(dx*dx+dy*dy)/(2*1.1**2))) for dy in range(-2, 3) for dx in range(-2, 3)]
    total = sum(w for _, _, w in kernel)
    def validity(c):
        return frozen.smooth(.012, .09, c[2]-c[1])*frozen.smooth(.004, .05, c[2]-c[0])*frozen.smooth(.25, .44, min(c))
    def soft_sample(x, y):
        # Each bilinear source sample blends softly with the original fallback.
        # Kernel integration has no hard purple/background classification edge.
        result = [0., 0., 0.]
        for dx, dy, weight in kernel:
            c = frozen.sample_rgb(im, x+dx, y+dy); v = validity(c)
            for k in range(3): result[k] += weight*((1-v)*fallback[k]+v*c[k])/total
        return tuple(result)
    colors = []
    for p, n in zip(worldp, worldn):
        x, y, z = p; nx, ny, nz = n
        back = soft_sample(1287+(-.006-x)*494.4, 503+(.479059-y)*494.4)
        side = soft_sample(1268-(z-.092)*484.69, 18+(.479059-y)*484.69) if nx >= 0 else soft_sample(236+(z-.062)*491.19, 507+(.479059-y)*491.19)
        w = frozen.smooth(.35, .92, abs(nx))*.16
        base = tuple((1-w)*a+w*b for a, b in zip(back, side))
        shade = .95+.05*max(0, -nz)
        colors.append(frozen.f32((*frozen.linear(tuple(c*shade for c in base)), 1.)))
    colorbytes = packed(colors)
    require(all(0 <= c <= 1 for row in colors for c in row) and colorbytes != packed(oldcolors), 'Expected finite bounded changed colors')
    d = copy.deepcopy(original); binary = bytearray(oldbin)
    binary.extend(b'\0'*((-len(binary))%4)); offset = len(binary); binary.extend(colorbytes)
    vi = len(d['bufferViews']); ai = len(d['accessors'])
    d['bufferViews'].append({'buffer':0, 'byteOffset':offset, 'byteLength':len(colorbytes), 'target':34962})
    d['accessors'].append({'bufferView':vi, 'componentType':5126, 'count':2596, 'type':'VEC4'})
    d['meshes'][2]['primitives'][0]['attributes']['COLOR_0'] = ai
    d['buffers'][0]['byteLength'] = len(binary)
    expected = copy.deepcopy(d); expected['bufferViews'].pop(); expected['accessors'].pop()
    expected['meshes'][2]['primitives'][0]['attributes']['COLOR_0'] = attrs['COLOR_0']
    expected['buffers'][0]['byteLength'] = original['buffers'][0]['byteLength']
    require(expected == original and binary[:len(oldbin)] == oldbin, 'Unexpected source JSON/BIN mutation')
    js = json.dumps(d, separators=(',', ':')).encode(); js += b' '*((-len(js))%4)
    binary.extend(b'\0'*((-len(binary))%4))
    result = struct.pack('<4sII', b'glTF', 2, 28+len(js)+len(binary))+struct.pack('<II', len(js), 0x4e4f534a)+js+struct.pack('<II', len(binary), 0x004e4942)+binary
    checkdoc, checkbin = frozen.read_glb(result)
    require(checkdoc == d and checkbin[:len(oldbin)] == oldbin and packed(float_accessor(checkdoc, checkbin, ai, 4)) == colorbytes, 'Roundtrip preservation')
    for path, pin in inputs: require(sha(path.read_bytes()) == pin, 'Input changed during operation')
    output = OUTDIR/'alexia.glb'; proof = OUTDIR/'alexia.color-proof.json'
    report = {'schema':'crwt.alexia.hair_locks_smooth_colors.v1', 'approved':False, 'gameIntegrated':False,
      'source_path':str(SOURCE.resolve()), 'source_sha256':SOURCE_PIN, 'original_source_sha256':BASELINE_PIN,
      'reference_sha256':REF_PIN, 'frozen_geometry_recipe_sha256':BUILDER_PIN, 'recipe_sha256':sha(pathlib.Path(__file__).read_bytes()),
      'candidate_path':str(output.resolve()), 'candidate_sha256':sha(result), 'candidate_bytes':len(result),
      'source_BIN_byte_prefix_identical':True, 'original_7ad_BIN_byte_prefix_identical':True,
      'all_positions_normals_uv_indices_images_materials_nodes_skins_animations_identical':True,
      'all_original_accessors_bufferViews_and_existing_color_bytes_identical':True,
      'only_existing_JSON_change':'mesh[2].primitives[0].attributes.COLOR_0 points to one appended accessor; buffers[0].byteLength updated.',
      'mesh_index':2, 'existing_closed_locks':2, 'color_vertex_count':2596, 'changed_color_vertices':sum(a != b for a,b in zip(oldcolors, colors)),
      'added_geometry_vertices':0, 'changed_geometry_vertices':0, 'added_triangles':0, 'changed_triangles':0,
      'source_color_accessor':attrs['COLOR_0'], 'new_color_accessor':ai, 'new_color_bufferView':vi,
      'source_color_sha256':sha(packed(oldcolors)), 'new_color_sha256':sha(colorbytes), 'reference_pixels_unchanged':True, 'raster_images_edited':False,
      'sampler':{'gaussian_radius_pixels':2, 'gaussian_sigma_pixels':1.1, 'bilinear_samples_per_vertex_per_view':25,
        'purple_validity':'smooth(.012,.09,B-G) * smooth(.004,.05,B-R) * smooth(.25,.44,min(R,G,B))',
        'fallback_srgb':list(fallback), 'side_normal_blend_maximum':.16, 'previous_side_blend_maximum':.55,
        'cross_section_shade':'0.95 + 0.05 * max(0,-world_normal_z)', 'mapping_reproduces_frozen_old_COLOR_0_exactly':True},
      'scope':'Only smooth reference-sampled vertex color of the two existing appended rear locks. Existing atlas, source colors and all geometry unchanged.',
      'limits':['Actual before/after mesh renders still require root review; no appearance approval.', 'Small Gaussian sampling suppresses abrupt color variation and may soften reference microdetail.', 'Manual atlas mapping, inherited merged hair volume, profile anatomy and detached-volume attachment limits remain.', 'No new rig, game integration, production or perfect-match claim.']}
    OUTDIR.mkdir()
    with output.open('xb') as f: f.write(result)
    with proof.open('x', encoding='utf-8', newline='\n') as f: f.write(json.dumps(report, indent=2)+'\n')
    print(json.dumps({'candidate_path':str(output.resolve()), 'candidate_sha256':sha(result), 'candidate_bytes':len(result), 'proof_path':str(proof.resolve()), 'proof_sha256':sha(proof.read_bytes()), 'recipe_sha256':report['recipe_sha256'], 'color_vertex_count':2596}))

if __name__ == '__main__': main()

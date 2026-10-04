"""Append a conservative, front-only projection diagnostic to the actual V11 GLB.

No generation, remeshing, smoothing, welding, rigging, or source image editing.
The original BIN chunk is an unchanged prefix of the output. Active indices are
split into two appended subsets sharing the original POSITION/NORMAL accessors.
Visible coverage is evaluated at 2048 pixels, not a mathematical guarantee at
every subpixel. All unselected triangles use a plain gray diagnostic material.
"""

import argparse
import copy
import hashlib
import io
import json
import pathlib
import struct
import sys


ROOT = pathlib.Path(__file__).resolve().parent
WORK = ROOT.parent
for candidate in (WORK / 'pydeps', ROOT / 'pydeps'):
    if candidate.is_dir():
        sys.path.insert(0, str(candidate))

EXPECTED_MESH_SHA = 'd0a0fea651079aa98d026a1610ef0a9e7f4c14c0c466cb1d949886df45c24a66'
EXPECTED_IMAGE_SHA = '1202424fc57571aaad7b7e1389d4de1ae7ba155c1ec113bd4425b5f05ab02928'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def read_glb(path):
    raw = path.read_bytes()
    if struct.unpack_from('<4sII', raw) != (b'glTF', 2, len(raw)):
        raise ValueError('Expected complete GLB 2.0.')
    doc, binary, offset = None, None, 12
    while offset < len(raw):
        size, kind = struct.unpack_from('<II', raw, offset)
        offset += 8
        data = raw[offset:offset + size]
        if len(data) != size:
            raise ValueError('Truncated chunk.')
        if kind == 0x4E4F534A:
            doc = json.loads(data.rstrip(b' \x00'))
        elif kind == 0x004E4942:
            binary = data
        offset += size
    if doc is None or binary is None or len(doc.get('buffers', [])) != 1:
        raise ValueError('This diagnostic requires a single embedded buffer.')
    return raw, doc, binary


def accessor(doc, binary, index, np):
    a = doc['accessors'][index]
    if 'sparse' in a or a.get('normalized'):
        raise ValueError('Sparse or normalized accessors are unsupported.')
    dtypes = {5121: '<u1', 5123: '<u2', 5125: '<u4', 5126: '<f4'}
    lengths = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}
    dtype = np.dtype(dtypes[a['componentType']])
    n = lengths[a['type']]
    view = doc['bufferViews'][a['bufferView']]
    if view.get('buffer', 0) != 0 or view.get('byteStride', n * dtype.itemsize) != n * dtype.itemsize:
        raise ValueError('Interleaved/external accessors are unsupported for this V11 diagnostic.')
    start = view.get('byteOffset', 0) + a.get('byteOffset', 0)
    data = binary[start:start + a['count'] * n * dtype.itemsize]
    return np.frombuffer(data, dtype=dtype).reshape(a['count'], n), data


def conservative_visible_faces(faces, pixel_xy, rendered_ids, normal_z, np):
    """Reject any sampled interior pixel whose winning triangle is different.

    GPU face IDs first reject all nonvisible and subpixel-only triangles. The
    CPU pass checks every interior pixel center within selected triangle bounds.
    Shared edges are excluded using a 1e-4 barycentric margin. This conservative
    choice deliberately leaves some valid visible boundary triangles gray.
    """
    h, w = rendered_ids.shape
    counts = np.bincount(rendered_ids.ravel(), minlength=len(faces) + 1)[1:]
    candidates = np.flatnonzero((counts > 0) & (normal_z > .15))
    safe = np.zeros(len(faces), dtype=bool)
    safe[candidates] = True
    tri = pixel_xy[faces[candidates]]
    lower = np.maximum(np.ceil(tri.min(axis=1) - .5).astype(np.int32), 0)
    upper = np.minimum(np.floor(tri.max(axis=1) - .5).astype(np.int32), [w - 1, h - 1])
    dims = upper - lower + 1
    unique_dims = np.unique(dims, axis=0)
    tested_samples = 0
    for width, height in unique_dims:
        if width < 1 or height < 1:
            continue
        selected = np.flatnonzero((dims[:, 0] == width) & (dims[:, 1] == height))
        dy, dx = np.mgrid[0:height, 0:width]
        dx, dy = dx.ravel(), dy.ravel()
        batch_size = max(1, 1000000 // (int(width) * int(height)))
        for start in range(0, len(selected), batch_size):
            rows = selected[start:start + batch_size]
            ids = candidates[rows]
            points = tri[rows].astype(np.float64)
            x = lower[rows, 0, None] + dx[None, :]
            y = lower[rows, 1, None] + dy[None, :]
            ax, ay = points[:, 0, 0, None], points[:, 0, 1, None]
            bx, by = points[:, 1, 0, None], points[:, 1, 1, None]
            cx, cy = points[:, 2, 0, None], points[:, 2, 1, None]
            denom = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
            denom = np.where(np.abs(denom) > 1e-15, denom, np.nan)
            p = ((by - cy) * (x + .5 - cx) + (cx - bx) * (y + .5 - cy)) / denom
            q = ((cy - ay) * (x + .5 - cx) + (ax - cx) * (y + .5 - cy)) / denom
            interior = (p > 1e-4) & (q > 1e-4) & ((1 - p - q) > 1e-4)
            tested_samples += int(interior.sum())
            mismatches = interior & (rendered_ids[y, x] != (ids[:, None] + 1))
            safe[ids[np.any(mismatches, axis=1)]] = False
    return safe, {'frontFacingNormalZThreshold': .15,
                  'candidateTriangles': int(len(candidates)),
                  'gpuVisibleTriangles': int((counts > 0).sum()),
                  'interiorPixelSamplesTested': tested_samples,
                  'barycentricEdgeExclusion': .0001}


def main():
    import numpy as np
    import moderngl
    from PIL import Image, ImageDraw

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mesh', type=pathlib.Path)
    parser.add_argument('reference', type=pathlib.Path)
    parser.add_argument('--out', type=pathlib.Path, default=ROOT / 'front-projection-diagnostic')
    parser.add_argument('--reference-bounds', nargs=4, type=float, default=[106, 18, 478, 567])
    parser.add_argument('--visibility-resolution', type=int, default=2048)
    parser.add_argument('--overwrite', action='store_true')
    args = parser.parse_args()
    output = args.out.resolve()
    if WORK.resolve() not in output.parents:
        raise ValueError('Output must remain inside work/.')
    model_out = output / 'alexia-v11-front-projection-diagnostic.glb'
    if model_out.exists() and not args.overwrite:
        raise ValueError('Diagnostic already exists; use --overwrite intentionally.')
    raw, source_doc, source_bin = read_glb(args.mesh)
    image_bytes = args.reference.read_bytes()
    if digest(raw) != EXPECTED_MESH_SHA or digest(image_bytes) != EXPECTED_IMAGE_SHA:
        raise ValueError('Actual V11 mesh/reference hashes do not match the audited source pair.')
    if len(source_doc.get('meshes', [])) != 1 or len(source_doc['meshes'][0]['primitives']) != 1:
        raise ValueError('Expected the actual single-primitive V11 source.')
    for node in source_doc.get('nodes', []):
        if any(key in node for key in ('matrix', 'translation', 'rotation', 'scale')):
            raise ValueError('Unexpected source transform; inspect it before projecting.')
    primitive = source_doc['meshes'][0]['primitives'][0]
    if primitive.get('mode', 4) != 4:
        raise ValueError('Expected indexed triangles.')
    positions, pos_bytes = accessor(source_doc, source_bin, primitive['attributes']['POSITION'], np)
    indices, index_bytes = accessor(source_doc, source_bin, primitive['indices'], np)
    faces = indices.reshape(-1, 3)
    if not np.isfinite(positions).all() or indices.max() >= len(positions):
        raise ValueError('Invalid geometry.')
    normal_bytes = None
    if 'NORMAL' in primitive['attributes']:
        _, normal_bytes = accessor(source_doc, source_bin, primitive['attributes']['NORMAL'], np)
    image = Image.open(io.BytesIO(image_bytes)).convert('RGB')
    iw, ih = image.size
    xmin, ymin, xmax, ymax = args.reference_bounds
    bounds = np.array([positions.min(axis=0), positions.max(axis=0)], dtype=np.float64)
    center = bounds.mean(axis=0)
    scale = (ymax - ymin) / (bounds[1, 1] - bounds[0, 1])
    reference_center = np.array([(xmin + xmax) / 2, (ymin + ymax) / 2])
    pixel_xy = np.column_stack([reference_center[0] + (positions[:, 0] - center[0]) * scale,
                               reference_center[1] - (positions[:, 1] - center[1]) * scale])
    uv = (pixel_xy / [iw, ih]).astype('<f4')
    cross = np.cross(positions[faces[:, 1]] - positions[faces[:, 0]],
                     positions[faces[:, 2]] - positions[faces[:, 0]])
    lengths = np.linalg.norm(cross, axis=1)
    normal_z = np.divide(cross[:, 2], lengths, out=np.zeros_like(lengths), where=lengths > 0)
    mvp = np.zeros((4, 4), dtype='f4')
    mvp[0, 0] = 2 * scale / iw
    mvp[1, 1] = 2 * scale / ih
    mvp[0, 3] = 2 * (reference_center[0] - scale * center[0]) / iw - 1
    mvp[1, 3] = 1 - 2 * (reference_center[1] + scale * center[1]) / ih
    mvp[2, 2] = -2 / ((bounds[1, 2] - bounds[0, 2]) * 1.1)
    mvp[2, 3] = -mvp[2, 2] * center[2]
    mvp[3, 3] = 1

    ctx = moderngl.create_standalone_context()
    vertex = ctx.buffer(positions.astype('f4').tobytes())
    index = ctx.buffer(faces.astype('u4').tobytes())
    id_program = ctx.program(vertex_shader='''#version 330
in vec3 pos; uniform mat4 mvp;
void main(){gl_Position=mvp*vec4(pos,1.0);}
''', fragment_shader='''#version 330
out float winner;
void main(){winner=float(gl_PrimitiveID+1);}
''')
    id_program['mvp'].write(mvp.T.tobytes())
    n = args.visibility_resolution
    id_texture = ctx.texture((n, n), 1, dtype='f4')
    depth = ctx.depth_renderbuffer((n, n))
    id_fbo = ctx.framebuffer([id_texture], depth)
    id_vao = ctx.vertex_array(id_program, [(vertex, '3f', 'pos')], index, index_element_size=4)
    id_fbo.use()
    ctx.enable(moderngl.DEPTH_TEST)
    ctx.disable(moderngl.CULL_FACE | moderngl.BLEND)
    id_fbo.clear(0, depth=1)
    id_vao.render(moderngl.TRIANGLES)
    rendered_ids = np.frombuffer(id_fbo.read(components=1, dtype='f4'), dtype='f4').reshape(n, n)[::-1].astype('i4')
    selected, coverage = conservative_visible_faces(faces, pixel_xy * [n / iw, n / ih],
                                                   rendered_ids, normal_z, np)
    all_corners_in_image = ((pixel_xy[:, 0] >= .5) & (pixel_xy[:, 0] < iw - .5)
                            & (pixel_xy[:, 1] >= .5) & (pixel_xy[:, 1] < ih - .5))
    selected &= all_corners_in_image[faces].all(axis=1)
    if not selected.any():
        raise ValueError('No conservative visible triangles; inspect orientation before continuing.')
    front_faces, gray_faces = faces[selected], faces[~selected]
    # These assertions prove the partition, independently of texture appearance.
    restored = np.empty_like(faces)
    restored[selected], restored[~selected] = front_faces, gray_faces
    assert np.array_equal(restored, faces)
    assert len(front_faces) + len(gray_faces) == len(faces)
    assert digest(restored.tobytes()) == digest(faces.tobytes())

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

    def append_accessor(array, component, kind, target):
        view = append_view(array.tobytes(), target)
        doc['accessors'].append({'bufferView': view, 'componentType': component,
                                  'count': int(len(array)), 'type': kind})
        return len(doc['accessors']) - 1

    uv_index = append_accessor(uv, 5126, 'VEC2', 34962)
    front_index = append_accessor(front_faces.reshape(-1, 1).astype(indices.dtype),
                                  source_doc['accessors'][primitive['indices']]['componentType'], 'SCALAR', 34963)
    gray_index = append_accessor(gray_faces.reshape(-1, 1).astype(indices.dtype),
                                 source_doc['accessors'][primitive['indices']]['componentType'], 'SCALAR', 34963)
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
    output.mkdir(parents=True, exist_ok=True)
    model_out.write_bytes(result)
    check_raw, check_doc, check_bin = read_glb(model_out)
    assert check_bin[:len(source_bin)] == source_bin
    assert check_doc['nodes'] == source_doc['nodes']
    assert check_doc['scenes'] == source_doc['scenes']
    assert check_doc['accessors'][:len(source_doc['accessors'])] == source_doc['accessors']
    assert check_doc['bufferViews'][:len(source_doc['bufferViews'])] == source_doc['bufferViews']
    _, check_pos = accessor(check_doc, check_bin, primitive['attributes']['POSITION'], np)
    _, check_indices = accessor(check_doc, check_bin, primitive['indices'], np)
    assert check_pos == pos_bytes and check_indices == index_bytes
    if normal_bytes is not None:
        _, check_normal = accessor(check_doc, check_bin, primitive['attributes']['NORMAL'], np)
        assert check_normal == normal_bytes

    # Preview renders the exact same source triangles, with source-aligned camera.
    preview_program = ctx.program(vertex_shader='''#version 330
in vec3 pos; uniform mat4 mvp; out vec2 uv; out vec3 p;
void main(){vec4 clip=mvp*vec4(pos,1.0);gl_Position=clip;uv=vec2((clip.x+1.)*.5,(1.-clip.y)*.5);p=pos;}
''', fragment_shader='''#version 330
in vec2 uv; in vec3 p; uniform sampler2D tex; uniform int textured; out vec4 color;
void main(){vec3 n=normalize(cross(dFdx(p),dFdy(p)));float light=.6+.4*abs(n.z);
vec3 c=textured==1?texture(tex,uv).rgb:vec3(.55);color=vec4(c*light,1.);}
''')
    preview_program['mvp'].write(mvp.T.tobytes())
    texture = ctx.texture(image.size, 3, image.tobytes(), alignment=1)
    texture.filter = moderngl.LINEAR, moderngl.LINEAR
    texture.repeat_x = texture.repeat_y = False
    texture.use(0)
    preview_program['tex'].value = 0
    preview_fbo = ctx.simple_framebuffer((iw, ih), components=4)

    def preview(textured):
        preview_fbo.use()
        preview_fbo.clear(.17, .17, .17, 1, depth=1)
        for group, use in ((gray_faces, 0), (front_faces, int(textured))):
            ib = ctx.buffer(group.astype('u4').tobytes())
            vao = ctx.vertex_array(preview_program, [(vertex, '3f', 'pos')], ib, index_element_size=4)
            preview_program['textured'].value = use
            vao.render(moderngl.TRIANGLES)
            vao.release()
            ib.release()
        return Image.frombytes('RGBA', image.size, preview_fbo.read(components=4)).transpose(Image.Transpose.FLIP_TOP_BOTTOM).convert('RGB')

    gray_preview, projected_preview = preview(False), preview(True)
    gray_preview.save(output / 'actual-v11-front-aligned-gray.png')
    projected_preview.save(output / 'actual-v11-front-projection.png')
    sheet = Image.new('RGB', (iw * 3, ih + 70), (24, 24, 24))
    drawing = ImageDraw.Draw(sheet)
    for i, (panel, label) in enumerate(((image, 'Original conditioning JPEG (unchanged)'),
                                       (gray_preview, 'Actual V11 geometry; uniform Y alignment'),
                                       (projected_preview, 'Front projection diagnostic; unknown triangles gray'))):
        sheet.paste(panel, (iw * i, 0))
        drawing.text((iw * i + 12, ih + 15), label, fill='white')
    drawing.text((12, ih + 43), 'NOT ACCEPTED / NOT FULL TEXTURE / NO RIG / SOURCE GEOMETRY PRESERVED', fill=(255, 210, 80))
    sheet.save(output / 'front-alignment-review.png')
    mapped_bounds = [pixel_xy.min(axis=0).tolist(), pixel_xy.max(axis=0).tolist()]
    report = {
        'status': 'front-only-projection-diagnostic-unapproved',
        'sourceMeshSha256': EXPECTED_MESH_SHA, 'referenceImageSha256': EXPECTED_IMAGE_SHA,
        'outputGlbSha256': digest(check_raw), 'sourceMeshBytes': len(raw), 'outputGlbBytes': len(check_raw),
        'sourceVertexCount': len(positions), 'sourceFaceCount': len(faces),
        'projectedTriangles': int(selected.sum()), 'unknownGrayTriangles': int((~selected).sum()),
        'projectedSurfaceAreaFraction': float(lengths[selected].sum() / lengths.sum()),
        'sourceHadNormals': normal_bytes is not None, 'normalsAdded': False,
        'sourcePositionAccessorSha256': digest(pos_bytes), 'sourceIndexAccessorSha256': digest(index_bytes),
        'sourceNormalAccessorSha256': digest(normal_bytes) if normal_bytes else None,
        'sourceBinSha256': digest(source_bin), 'sourceBinPrefixByteIdentical': True,
        'sourcePositionAndIndexBytesPreserved': True, 'sourceNodesAndScenesPreserved': True,
        'originalAccessorsAndBufferViewsPreserved': True, 'activeIndexAccessors': 'appended visible/gray partition',
        'facePartitionRestoredToOriginalOrderSha256': digest(restored.tobytes()),
        'faceUnionExactlyOriginalNoDuplicatesOrLoss': True, 'geometryRemeshed': False,
        'embeddedImageBytesUnchanged': True, 'referencePixelEditing': False,
        'projection': {'camera': '+Z orthographic, +Y up', 'mapping': 'uniform scale from full mesh Y bounds to manual source Y bounds',
                       'referenceBoundsManual': args.reference_bounds, 'sourceModelBounds': bounds.tolist(),
                       'pixelScalePerModelUnit': float(scale), 'mappedGeometryPixelBounds': mapped_bounds,
                       'mappedWidthMinusReferenceWidthPixels': float(mapped_bounds[1][0] - mapped_bounds[0][0] - (xmax - xmin)),
                       'referenceHasSmallWhiteSparkleLowerRight': True, 'sourceOriginalPngAvailable': False},
        'visibility': {'resolution': [n, n], 'renderer': ctx.info.get('GL_RENDERER'), **coverage,
                       'method': 'GPU depth winner triangle IDs; conservative CPU check of all interior pixel centers',
                       'finiteResolutionLimit': 'Some subpixel occlusion is not provable; subpixel-only triangles remain gray.'},
        'productionReady': False, 'acceptedModelsProduced': 0, 'fullTexture': False,
        'animationOrRigVerified': False, 'gameAssetsChanged': False,
        'limitations': ['Only the supplied front conditioning JPEG is projected.',
                        'JPEG includes baked lighting and its gray background; silhouette mismatch may sample background.',
                        'Eye relief, hair loops, fused digits/cuffs and small islands are unchanged.',
                        'No texture is invented for back/side/occluded triangles; these use gray material.',
                        'UVs are a camera projection, not a complete production UV unwrap.',
                        'Finite-resolution conservative visibility can leave visible boundary triangles gray.',
                        'Source POSITION accessor is shared across two primitives; importers may count shared vertices twice.'],
        'outputFiles': [model_out.name, 'actual-v11-front-aligned-gray.png', 'actual-v11-front-projection.png',
                        'front-alignment-review.png', 'projection-evidence.json']}
    report['sourceFilesPreservedSha256Match'] = (digest(args.mesh.read_bytes()) == EXPECTED_MESH_SHA
                                               and digest(args.reference.read_bytes()) == EXPECTED_IMAGE_SHA)
    (output / 'projection-evidence.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps({key: report[key] for key in ('status', 'sourceFaceCount', 'projectedTriangles',
                     'unknownGrayTriangles', 'projectedSurfaceAreaFraction', 'sourceFilesPreservedSha256Match')}
                    | {'output': str(output), 'mappedGeometryPixelBounds': mapped_bounds}), flush=True)
    ctx.release()


if __name__ == '__main__':
    main()

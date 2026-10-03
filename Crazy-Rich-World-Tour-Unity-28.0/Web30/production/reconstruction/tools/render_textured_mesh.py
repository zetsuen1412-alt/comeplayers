"""Inspect embedded GLB albedo with simple lighting; never edit the input mesh.

Uses Trimesh's loaded UV convention, checked at runtime with uv_to_color.
This is deliberately not a complete glTF/PBR renderer or an approval gate.
Example: python work/render_textured_mesh.py outputs/model.glb
Fixture: python work/render_textured_mesh.py --make-fixture work/texture-fixture.glb
         python work/render_textured_mesh.py work/texture-fixture.glb --self-test
"""

import argparse
import hashlib
import io
import json
import math
import pathlib
import struct
import sys
import zlib

ROOT = pathlib.Path(__file__).resolve().parent
WORK_ROOT = ROOT if ROOT.name == 'work' else ROOT.parent / 'work'
# Optional local dependencies take precedence; installed packages are the fallback.
# Covers work/script.py, extracted tools/script.py, and outputs/tools/ in this workspace.
DEPENDENCY_PATHS = [ROOT / 'pydeps', ROOT.parent / 'work' / 'pydeps',
                    ROOT.parent.parent / 'work' / 'pydeps']
VIEWS = [('front', 0, 0), ('three-quarter', 45, 10), ('left', 90, 0),
         ('right', -90, 0), ('back', 180, 0), ('top', 0, 89.9),
         ('bottom', 0, -89.9)]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def read_glb(path):
    data = path.read_bytes()
    if len(data) < 20 or struct.unpack_from('<4sII', data) != (b'glTF', 2, len(data)):
        raise ValueError('Expected a complete glTF 2.0 binary GLB.')
    doc, binary = None, None
    offset = 12
    while offset < len(data):
        length, kind = struct.unpack_from('<II', data, offset)
        offset += 8
        if offset + length > len(data):
            raise ValueError('GLB chunk extends beyond the input file.')
        chunk = data[offset:offset + length]
        if kind == 0x4E4F534A:
            doc = json.loads(chunk.decode('utf-8').rstrip(' \x00'))
        elif kind == 0x004E4942:
            binary = chunk
        offset += length
    if doc is None:
        raise ValueError('GLB has no JSON document.')
    # Avoid loading external image or geometry resources through an importer.
    for item in doc.get('buffers', []) + doc.get('images', []):
        uri = item.get('uri')
        if uri is not None and not uri.startswith('data:'):
            raise ValueError('External GLB resources are unsupported; embed them first.')
    return data, doc, binary


def embedded_image_bytes(image, doc, binary):
    if 'bufferView' in image:
        view = doc['bufferViews'][image['bufferView']]
        if view.get('buffer', 0) != 0 or binary is None:
            raise ValueError('Image does not reference the embedded GLB BIN buffer.')
        start = view.get('byteOffset', 0)
        return binary[start:start + view['byteLength']]
    uri = image.get('uri', '')
    if uri.startswith('data:'):
        import base64
        import urllib.parse
        header, payload = uri.split(',', 1)
        return base64.b64decode(payload) if ';base64' in header else urllib.parse.unquote_to_bytes(payload)
    raise ValueError('Image has no supported embedded byte source.')


def make_fixture(path):
    """Standard-library-only GLB: top red/green, bottom blue/yellow quad.

    The raw glTF UV origin is at the top left. The importer must establish
    its loaded convention before those UVs are passed to the shader.
    """
    def png_chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)
    rgba = bytes([255, 0, 0, 255, 0, 255, 0, 255,
                  0, 0, 255, 255, 255, 255, 0, 255])
    scanlines = b'\x00' + rgba[:8] + b'\x00' + rgba[8:]
    png = b'\x89PNG\r\n\x1a\n' + png_chunk(b'IHDR', struct.pack('>IIBBBBB', 2, 2, 8, 6, 0, 0, 0))
    png += png_chunk(b'IDAT', zlib.compress(scanlines)) + png_chunk(b'IEND', b'')
    chunks = [struct.pack('<12f', -.5, -.5, 0, .5, -.5, 0, .5, .5, 0, -.5, .5, 0),
              struct.pack('<12f', 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1),
              struct.pack('<8f', 0, 1, 1, 1, 1, 0, 0, 0),
              struct.pack('<6H', 0, 1, 2, 0, 2, 3), png]
    binary = b''
    views = []
    for chunk in chunks:
        binary += b'\x00' * ((-len(binary)) % 4)
        views.append({'buffer': 0, 'byteOffset': len(binary), 'byteLength': len(chunk)})
        binary += chunk
    doc = {'asset': {'version': '2.0', 'generator': 'local UV quadrant validation fixture'},
           'buffers': [{'byteLength': len(binary)}], 'bufferViews': views,
           'accessors': [
               {'bufferView': 0, 'componentType': 5126, 'count': 4, 'type': 'VEC3', 'min': [-.5, -.5, 0], 'max': [.5, .5, 0]},
               {'bufferView': 1, 'componentType': 5126, 'count': 4, 'type': 'VEC3'},
               {'bufferView': 2, 'componentType': 5126, 'count': 4, 'type': 'VEC2'},
               {'bufferView': 3, 'componentType': 5123, 'count': 6, 'type': 'SCALAR'}],
           'images': [{'name': 'quadrant-albedo.png', 'bufferView': 4, 'mimeType': 'image/png'}],
           'samplers': [{'magFilter': 9729, 'minFilter': 9729, 'wrapS': 10497, 'wrapT': 10497}],
           'textures': [{'name': 'quadrant-albedo', 'source': 0, 'sampler': 0}],
           'materials': [{'name': 'UV-quadrant-test', 'doubleSided': True,
                          'pbrMetallicRoughness': {'baseColorFactor': [1, 1, 1, 1],
                                                   'baseColorTexture': {'index': 0}, 'metallicFactor': 0, 'roughnessFactor': 1}}],
           'meshes': [{'name': 'quad', 'primitives': [{'attributes': {'POSITION': 0, 'NORMAL': 1, 'TEXCOORD_0': 2}, 'indices': 3, 'material': 0}]}],
           'nodes': [{'mesh': 0}], 'scenes': [{'nodes': [0]}], 'scene': 0}
    encoded = json.dumps(doc, separators=(',', ':')).encode('utf-8')
    encoded += b' ' * ((-len(encoded)) % 4)
    binary += b'\x00' * ((-len(binary)) % 4)
    result = struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(encoded) + 8 + len(binary))
    result += struct.pack('<II', len(encoded), 0x4E4F534A) + encoded
    result += struct.pack('<II', len(binary), 0x004E4942) + binary
    path = path.resolve()
    # Fixture creation stays inside work/ regardless of the command argument.
    if WORK_ROOT.resolve() not in path.parents:
        raise ValueError('The synthetic validation fixture must be saved inside work/.')
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(result)
    print(json.dumps({'fixture': str(path), 'sha256': sha(result), 'syntheticOnly': True,
                      'expectedFrontQuadrants': ['red', 'green', 'blue', 'yellow']}), flush=True)


def render_model(model, self_test=False):
    for dependency_path in reversed(DEPENDENCY_PATHS):
        if dependency_path.is_dir():
            sys.path.insert(0, str(dependency_path))
    import numpy as np
    import trimesh
    import moderngl
    from PIL import Image, ImageDraw
    from trimesh.visual.color import uv_to_color

    model = model.resolve()
    out = model.parent / (model.stem + '-textured-review')
    out.mkdir(exist_ok=True)
    stats = {'modelPath': str(model), 'previewType': 'embedded baseColor/albedo plus simple lighting',
             'fullPbrFaithful': False, 'gameReadyApproval': False, 'albedoLoaded': False,
             'geometryMutated': False, 'animationOrRigVerified': False,
             'limitations': [
                 'Normal, metallic/roughness, occlusion and emissive maps are not rendered.',
                 'Lighting uses a simple diffuse/fill formula, without environment or specular PBR.',
                 'Textures may already contain baked lighting; this preview does not remove it.',
                 'Bilinear sampling with repeat wrapping is used; source sampler choices are recorded but not reproduced.',
                 'BLEND alpha is shown as a near-zero-alpha cutout, without transparent sorting or blending.',
                 'Both sides are visible for inspection; source culling and full material extensions are not reproduced.',
                 'Loaded rest geometry is inspected; skin deformation and animation are not evaluated.',
                 'Vertex colors are multiplied only for explicit ColorVisuals; extra TextureVisuals vertex attributes are not evaluated.']}
    resources = []
    try:
        raw, doc, binary = read_glb(model)
        stats.update({'glbSha256': sha(raw), 'bytes': len(raw),
                      'sourceTextureCount': len(doc.get('textures', [])),
                      'sourceTextures': [{'index': index, 'name': texture.get('name'),
                                          'sourceImageIndex': texture.get('source'),
                                          'samplerIndex': texture.get('sampler'),
                                          'extensions': texture.get('extensions', {})}
                                         for index, texture in enumerate(doc.get('textures', []))],
                      'sourceImageCount': len(doc.get('images', [])),
                      'sourceSkinCount': len(doc.get('skins', [])),
                      'sourceAnimationCount': len(doc.get('animations', [])),
                      'sourceSamplers': doc.get('samplers', []),
                      'sourceExtensionsUsed': doc.get('extensionsUsed', [])})
        declared = []
        for index, material in enumerate(doc.get('materials', [])):
            pbr = material.get('pbrMetallicRoughness', {})
            info = pbr.get('baseColorTexture')
            declared.append({'index': index, 'name': material.get('name'),
                             'baseColorFactor': pbr.get('baseColorFactor', [1, 1, 1, 1]),
                             'baseColorTexture': info, 'alphaMode': material.get('alphaMode', 'OPAQUE'),
                             'otherTextureSlots': [key for key in ('normalTexture', 'occlusionTexture', 'emissiveTexture') if key in material]
                             + (['metallicRoughnessTexture'] if 'metallicRoughnessTexture' in pbr else [])})
            if info and (info.get('texCoord', 0) != 0 or 'KHR_texture_transform' in info.get('extensions', {})):
                raise ValueError('Nonzero baseColor texCoord or KHR_texture_transform requires a fuller renderer; refusing an uncertain UV preview.')
        stats['sourceMaterials'] = declared

        source_images = []
        for index, source in enumerate(doc.get('images', [])):
            data = embedded_image_bytes(source, doc, binary)
            try:
                with Image.open(io.BytesIO(data)) as image:
                    rgba = image.convert('RGBA')
                    source_images.append({'index': index, 'name': source.get('name'),
                                          'embedded': True, 'encodedSha256': sha(data),
                                          'decodedRgbaSha256': sha(rgba.tobytes()), 'size': list(rgba.size)})
            except Exception as exc:
                source_images.append({'index': index, 'name': source.get('name'),
                                      'embedded': True, 'encodedSha256': sha(data), 'decoded': False,
                                      'decodeError': type(exc).__name__})
        stats['embeddedImages'] = source_images

        # Probe the installed library rather than assuming a raw glTF V flip.
        probe = Image.new('RGBA', (2, 2))
        probe.putdata([(255, 0, 0, 255), (0, 255, 0, 255), (0, 0, 255, 255), (255, 255, 0, 255)])
        probe_uv = np.array([[0, 0], [1, 0], [0, 1], [1, 1]], dtype=float)
        probe_colors = np.asarray(uv_to_color(probe_uv, probe)).tolist()
        bottom_origin = [[0, 0, 255, 255], [255, 255, 0, 255], [255, 0, 0, 255], [0, 255, 0, 255]]
        top_origin = [[255, 0, 0, 255], [0, 255, 0, 255], [0, 0, 255, 255], [255, 255, 0, 255]]
        if probe_colors not in (bottom_origin, top_origin):
            raise ValueError('Unsupported installed Trimesh UV-to-image convention.')
        flip_upload = probe_colors == bottom_origin
        stats['uvOrientation'] = {'probeFunction': 'trimesh.visual.color.uv_to_color',
                                  'probeUvs': probe_uv.tolist(), 'probeRgba': probe_colors,
                                  'loadedUvValuesModified': False, 'textureUploadVerticalFlip': flip_upload,
                                  'convention': 'loaded Trimesh UVs; image upload agrees with installed sampler',
                                  'loaderSourceConfirmation': 'Root inspected installed trimesh/exchange/gltf/__init__.py lines 1724-1728: raw glTF V is flipped to lower-left origin. This renderer does not apply another UV flip.'}

        loaded = trimesh.load(model, force='scene', process=False)
        parts = list(loaded.dump()) if isinstance(loaded, trimesh.Scene) else [loaded]
        parts = [part for part in parts if isinstance(part, trimesh.Trimesh) and len(part.faces)]
        if not parts:
            raise ValueError('No loaded triangle geometry to render.')
        bounds = np.array([np.min([part.bounds[0] for part in parts], axis=0),
                           np.max([part.bounds[1] for part in parts], axis=0)])
        center = bounds.mean(axis=0)
        extent = float(np.max(bounds[1] - bounds[0]))
        if not math.isfinite(extent) or extent <= 0:
            raise ValueError('Geometry bounds are invalid.')
        stats.update({'faces': sum(len(part.faces) for part in parts),
                      'vertices': sum(len(part.vertices) for part in parts),
                      'loadedGeometryInstances': len(parts),
                      'vertexCountMeaning': 'sum of vertices in transformed loaded instances; shared source accessors may be counted per primitive or instance',
                      'sourceBounds': bounds.tolist(), 'displayScale': 1.7 / extent,
                      'displayTranslationCenter': center.tolist(),
                      'displayTransformOnly': True, 'loadedNormals': 'Trimesh vertex_normals, computed by Trimesh when absent'})

        def rgba_factor(value):
            if value is None:
                return np.ones(4, dtype='f4')
            raw_color = np.asarray(value)
            color = raw_color.astype('f4').reshape(-1)
            if len(color) == 3:
                color = np.append(color, 255 if raw_color.dtype.kind in 'ui' else 1)
            if len(color) != 4 or not np.isfinite(color).all():
                raise ValueError('Invalid material RGBA factor.')
            if raw_color.dtype.kind in 'ui' or np.max(color) > 1:
                color = color / 255.0
            return np.clip(color, 0, 1).astype('f4')

        batches = []
        texture_inventory = {}
        for part_index, part in enumerate(parts):
            visual = part.visual
            material = getattr(visual, 'material', None)
            submaterials = getattr(material, 'materials', None)
            if submaterials is not None:
                face_materials = np.asarray(getattr(visual, 'face_materials', None))
                if face_materials.shape != (len(part.faces),):
                    raise ValueError('MultiMaterial lacks a complete face-material mapping.')
                groups = [(int(index), submaterials[int(index)], np.flatnonzero(face_materials == index))
                          for index in np.unique(face_materials)]
            else:
                groups = [(0, material, np.arange(len(part.faces)))]
            positions = (np.asarray(part.vertices, dtype='f4') - center) * (1.7 / extent)
            normals = np.asarray(part.vertex_normals, dtype='f4')
            if normals.shape != positions.shape or not np.isfinite(normals).all():
                raise ValueError('Invalid loaded vertex normals.')
            for material_index, mat, selection in groups:
                faces = np.asarray(part.faces[selection], dtype=np.int64)
                image = getattr(mat, 'baseColorTexture', None)
                image_slot = 'baseColorTexture'
                if image is None:
                    image = getattr(mat, 'image', None)
                    image_slot = 'SimpleMaterial.image' if image is not None else None
                factor_value = getattr(mat, 'baseColorFactor', None)
                factor_kind = 'PBR baseColorFactor or glTF default white'
                if factor_value is None and mat is not None and hasattr(mat, 'diffuse'):
                    factor_value = mat.diffuse
                    factor_kind = 'loaded SimpleMaterial.diffuse'
                factor = rgba_factor(factor_value)
                uv = np.zeros((len(part.vertices), 2), dtype='f4')
                texture_key = None
                matched_sources = []
                if image is not None:
                    if not isinstance(image, Image.Image):
                        raise ValueError('Loaded albedo is not a supported PIL image.')
                    loaded_uv = getattr(visual, 'uv', None)
                    if loaded_uv is None:
                        raise ValueError('An albedo image exists but its mesh has no loaded UVs.')
                    uv = np.asarray(loaded_uv, dtype='f4')
                    if uv.shape != (len(part.vertices), 2) or not np.isfinite(uv).all():
                        raise ValueError('Loaded UVs do not match the mesh vertex count.')
                    rgba = image.convert('RGBA')
                    texture_key = sha(rgba.tobytes()) + ':' + str(rgba.size)
                    matched_sources = [source['index'] for source in source_images
                                       if source.get('decodedRgbaSha256') == sha(rgba.tobytes())
                                       and source.get('size') == list(rgba.size)]
                    if not matched_sources:
                        raise ValueError('Loaded albedo pixels could not be verified against an embedded GLB image.')
                    texture_inventory.setdefault(texture_key, {'image': rgba, 'size': list(rgba.size),
                                                               'decodedRgbaSha256': sha(rgba.tobytes()),
                                                               'sourceImageIndices': matched_sources,
                                                               'sourceImageNames': [source_images[i].get('name') for i in matched_sources],
                                                               'sourceTextureIndices': [index for index, texture in enumerate(doc.get('textures', []))
                                                                                        if texture.get('source') in matched_sources],
                                                               'sourceTextureNames': [texture.get('name') for texture in doc.get('textures', [])
                                                                                      if texture.get('source') in matched_sources]})
                vertex_colors = np.ones((len(faces), 3, 4), dtype='f4')
                if getattr(visual, 'kind', None) == 'vertex':
                    vertex_colors = np.asarray(visual.vertex_colors, dtype='f4')[faces] / 255.0
                elif getattr(visual, 'kind', None) == 'face':
                    vertex_colors = np.repeat(np.asarray(visual.face_colors, dtype='f4')[selection, None, :] / 255.0, 3, axis=1)
                alpha_mode = str(getattr(mat, 'alphaMode', None) or 'OPAQUE').upper()
                cutoff_value = getattr(mat, 'alphaCutoff', None)
                cutoff = .5 if cutoff_value is None else float(cutoff_value)
                array = np.concatenate([positions[faces], normals[faces], uv[faces], vertex_colors], axis=2).astype('f4')
                batches.append({'array': array, 'textureKey': texture_key, 'factor': factor,
                                'alphaMode': alpha_mode, 'cutoff': cutoff,
                                'evidence': {'partIndex': part_index, 'geometryName': part.metadata.get('name'),
                                             'materialGroupIndex': material_index, 'materialName': getattr(mat, 'name', None),
                                             'materialType': type(mat).__name__ if mat is not None else None,
                                             'faces': len(faces), 'visualKind': getattr(visual, 'kind', None),
                                             'baseColorFactorLoaded': factor.tolist(), 'factorInterpretation': factor_kind,
                                             'albedoSlot': image_slot, 'albedoLoaded': texture_key is not None,
                                             'embeddedImageIndices': matched_sources, 'alphaMode': alpha_mode}})

        stats['batches'] = [batch['evidence'] for batch in batches]
        stats['loadedAlbedoTextureCount'] = len(texture_inventory)
        stats['textureCount'] = len(texture_inventory)
        stats['textures'] = [{key: value for key, value in entry.items() if key != 'image'}
                             for entry in texture_inventory.values()]
        if not texture_inventory:
            raise ValueError('No actual embedded albedo texture was loaded; use the untextured renderer for this file.')

        ctx = moderngl.create_standalone_context()
        resources.append(ctx)
        program = ctx.program(vertex_shader='''#version 330
in vec3 pos; in vec3 normal; in vec2 uv; in vec4 vertex_color;
uniform mat4 mvp; out vec3 n; out vec2 tex_uv; out vec4 vc;
void main(){gl_Position=mvp*vec4(pos,1.0);n=normal;tex_uv=uv;vc=vertex_color;}
''', fragment_shader='''#version 330
in vec3 n; in vec2 tex_uv; in vec4 vc; out vec4 color;
uniform sampler2D albedo_tex; uniform int use_texture; uniform vec4 base_factor;
uniform int alpha_mode; uniform float alpha_cutoff;
vec3 to_linear(vec3 c){return mix(c/12.92,pow((c+0.055)/1.055,vec3(2.4)),step(vec3(0.04045),c));}
vec3 to_srgb(vec3 c){c=max(c,vec3(0.0));return mix(c*12.92,1.055*pow(c,vec3(1.0/2.4))-0.055,step(vec3(0.0031308),c));}
void main(){
 vec4 texel=use_texture==1?texture(albedo_tex,tex_uv):vec4(1.0);
 vec4 base=vec4(use_texture==1?to_linear(texel.rgb):texel.rgb,texel.a)*base_factor*vc;
 if(alpha_mode==1 && base.a<alpha_cutoff)discard;
 if(alpha_mode==2 && base.a<0.01)discard;
 vec3 nn=normalize(n);if(!gl_FrontFacing)nn=-nn;
 float diffuse=max(dot(nn,normalize(vec3(-0.6,0.9,1.3))),0.0);
 float fill=max(dot(nn,normalize(vec3(1.0,0.4,-1.0))),0.0);
 color=vec4(to_srgb(base.rgb*(0.4+0.55*diffuse+0.2*fill)),1.0);
}
''')
        resources.append(program)
        program['albedo_tex'].value = 0
        for entry in texture_inventory.values():
            image = entry['image'].transpose(Image.Transpose.FLIP_TOP_BOTTOM) if flip_upload else entry['image']
            texture = ctx.texture(image.size, 4, image.tobytes(), alignment=1)
            texture.filter = (moderngl.LINEAR, moderngl.LINEAR)
            texture.repeat_x = texture.repeat_y = True
            entry['gpu'] = texture
            resources.append(texture)
        # An actual white one-pixel sampler is used only for a batch without a texture.
        white = ctx.texture((1, 1), 4, bytes([255, 255, 255, 255]), alignment=1)
        resources.append(white)
        for batch in batches:
            buffer = ctx.buffer(batch.pop('array').tobytes())
            vao = ctx.vertex_array(program, [(buffer, '3f 3f 2f 4f', 'pos', 'normal', 'uv', 'vertex_color')])
            batch['vao'] = vao
            resources.extend([buffer, vao])
        size = 640
        fbo = ctx.simple_framebuffer((size, size), components=4)
        resources.append(fbo)

        def render(azimuth, elevation):
            az, el = math.radians(azimuth), math.radians(elevation)
            eye = np.array([math.sin(az) * math.cos(el), math.sin(el), math.cos(az) * math.cos(el)], dtype='f4') * 3
            forward = -eye / np.linalg.norm(eye)
            up = np.array([0, 0, -1] if abs(el) > 1.5 else [0, 1, 0], dtype='f4')
            right = np.cross(forward, up)
            right /= np.linalg.norm(right)
            view_up = np.cross(right, forward)
            view = np.eye(4, dtype='f4')
            view[0, :3], view[1, :3], view[2, :3] = right, view_up, -forward
            view[:3, 3] = -view[:3, :3] @ eye
            projection = np.diag([1 / 1.06, 1 / 1.06, -2 / 9.9, 1]).astype('f4')
            projection[2, 3] = -(10 + .1) / (10 - .1)
            program['mvp'].write((projection @ view).T.astype('f4').tobytes())
            fbo.use()
            ctx.enable(moderngl.DEPTH_TEST)
            ctx.disable(moderngl.BLEND | moderngl.CULL_FACE)
            fbo.clear(.06, .075, .11, 1, depth=1)
            for batch in batches:
                texture = texture_inventory[batch['textureKey']]['gpu'] if batch['textureKey'] else white
                texture.use(location=0)
                program['use_texture'].value = int(batch['textureKey'] is not None)
                program['base_factor'].value = tuple(float(value) for value in batch['factor'])
                program['alpha_mode'].value = {'MASK': 1, 'BLEND': 2}.get(batch['alphaMode'], 0)
                program['alpha_cutoff'].value = batch['cutoff']
                batch['vao'].render(moderngl.TRIANGLES)
            return Image.frombytes('RGBA', (size, size), fbo.read(components=4)).transpose(Image.Transpose.FLIP_TOP_BOTTOM).convert('RGB')

        sheet = Image.new('RGB', (size * 4, (size + 40) * 2), (15, 19, 28))
        draw = ImageDraw.Draw(sheet)
        front = None
        for index, (name, az, el) in enumerate(VIEWS):
            image = render(az, el)
            image.save(out / (name + '.png'))
            if name == 'front':
                front = image
            x, y = (index % 4) * size, (index // 4) * (size + 40)
            sheet.paste(image, (x, y))
            draw.text((x + 20, y + size + 12), name, fill='white')
        sheet.save(out / 'albedo-contact-sheet.png')
        frames = [render(angle, 8).resize((400, 400)) for angle in range(0, 360, 10)]
        frames[0].save(out / 'actual-textured-mesh-turntable.gif', save_all=True,
                       append_images=frames[1:], duration=110, loop=0)
        stats.update({'status': 'rendered-for-limited-albedo-inspection', 'albedoLoaded': True,
                      'renderedViews': [view[0] for view in VIEWS], 'renderer': ctx.info.get('GL_RENDERER'),
                      'trimeshVersion': trimesh.__version__, 'turntableFrames': len(frames),
                      'cameraProjection': 'orthographic', 'textureColorSpace': 'sRGB texture decoded to linear, multiplied by factor and simple lighting, encoded to sRGB',
                      'outputFiles': [view[0] + '.png' for view in VIEWS]
                      + ['albedo-contact-sheet.png', 'actual-textured-mesh-turntable.gif', 'render-evidence.json']})
        if self_test:
            if doc.get('asset', {}).get('generator') != 'local UV quadrant validation fixture':
                raise ValueError('--self-test is restricted to this script\'s synthetic fixture.')
            points = [(192, 192), (448, 192), (192, 448), (448, 448)]
            colors = [front.getpixel(point) for point in points]
            passed = (colors[0][0] > 180 and colors[0][1] < 120 and colors[0][2] < 120
                      and colors[1][1] > 180 and colors[1][0] < 120 and colors[1][2] < 120
                      and colors[2][2] > 180 and colors[2][0] < 120 and colors[2][1] < 120
                      and min(colors[3][:2]) > 180 and colors[3][2] < 120)
            stats['syntheticUvShaderTest'] = {'syntheticOnly': True, 'samplePoints': points,
                                             'actualFrontRgb': colors,
                                             'expectedQuadrants': ['red', 'green', 'blue', 'yellow'],
                                             'passed': bool(passed)}
            if not passed:
                raise ValueError('Synthetic UV/importer/shader quadrant orientation test failed.')
        # Hash again so the evidence also verifies the source file was preserved.
        stats['inputPreservedSha256Match'] = sha(model.read_bytes()) == stats['glbSha256']
        (out / 'render-evidence.json').write_text(json.dumps(stats, indent=2), encoding='utf-8')
        print(json.dumps({key: stats[key] for key in ('status', 'glbSha256', 'faces', 'vertices', 'textureCount', 'albedoLoaded', 'inputPreservedSha256Match')}
                         | {'out': str(out), 'syntheticUvShaderTest': stats.get('syntheticUvShaderTest')}), flush=True)
    except Exception as exc:
        stats.update({'status': 'failed-unapproved', 'albedoLoaded': False,
                      'errorType': type(exc).__name__, 'error': str(exc)})
        (out / 'render-evidence.json').write_text(json.dumps(stats, indent=2), encoding='utf-8')
        print(json.dumps({'status': stats['status'], 'out': str(out), 'error': str(exc)}), flush=True)
        raise
    finally:
        for resource in reversed(resources):
            try:
                resource.release()
            except Exception:
                pass


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('model', nargs='?', type=pathlib.Path)
    parser.add_argument('--make-fixture', type=pathlib.Path)
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    if args.make_fixture:
        if args.model or args.self_test:
            parser.error('--make-fixture cannot be combined with rendering arguments.')
        make_fixture(args.make_fixture)
    elif args.model:
        render_model(args.model, self_test=args.self_test)
    else:
        parser.error('Pass a GLB model, or --make-fixture with a path inside work/.')

"""Compare actual original/candidate geometry with independently computed normals.

Seven orthographic presets plus a 36-angle orbit. This finite render comparison
checks visible regression only; it does not approve anatomy, UVs, rig or gameplay.
No input is modified and no synthetic character imagery is used.
"""
import argparse
import hashlib
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent
import numpy as np
from PIL import Image, ImageDraw
from render_glb_islands import read_geometry, Renderer, rotation_y, rotation_x

SOURCE_SHA = 'd0a0fea651079aa98d026a1610ef0a9e7f4c14c0c466cb1d949886df45c24a66'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('original', type=pathlib.Path)
    parser.add_argument('candidate', type=pathlib.Path)
    parser.add_argument('--out', type=pathlib.Path, required=True)
    args = parser.parse_args()
    source_raw, points, source_faces, source_normals, _, source_groups = read_geometry(args.original)
    candidate_raw, other_points, candidate_faces, candidate_normals, _, candidate_groups = read_geometry(args.candidate)
    assert hashlib.sha256(source_raw).hexdigest() == SOURCE_SHA
    assert np.array_equal(points, other_points), 'Stored positions changed'
    retained_vertices = np.unique(candidate_faces)
    assert np.array_equal(source_normals[retained_vertices], candidate_normals[retained_vertices]), 'Retained normals changed'
    source_active_bounds = np.array([points[source_faces].min(axis=(0, 1)), points[source_faces].max(axis=(0, 1))])
    retained_active_bounds = np.array([points[candidate_faces].min(axis=(0, 1)), points[candidate_faces].max(axis=(0, 1))])
    assert np.array_equal(source_active_bounds, retained_active_bounds), 'Active geometry bounds changed'
    color = np.tile(np.array([.60, .63, .68]), (len(points), 1))
    renderer = Renderer()
    views = [('front', np.eye(3)), ('three-quarter', rotation_x(10) @ rotation_y(45)),
             ('left', rotation_y(90)), ('right', rotation_y(-90)), ('back', rotation_y(180)),
             ('top', rotation_x(90)), ('bottom', rotation_x(-90))]
    views += [(f'orbit-{az:03d}', rotation_x(8) @ rotation_y(az)) for az in range(0, 360, 10)]
    args.out.mkdir(parents=True, exist_ok=True)
    evidence = []
    size = (512, 640)
    sheet = Image.new('RGB', (size[0] * 4, (size[1] + 50) * 2), '#f8f9fb')
    draw = ImageDraw.Draw(sheet)
    for i, (name, rotation) in enumerate(views):
        original, _ = renderer.render(points, source_faces, source_normals, color, size, rotation, bounds_points=points)
        candidate, _ = renderer.render(other_points, candidate_faces, candidate_normals, color, size, rotation, bounds_points=points)
        a, b = np.asarray(original), np.asarray(candidate)
        different = int(np.any(a != b, axis=2).sum())
        evidence.append({'view': name, 'different_pixels': different,
                         'max_channel_delta': int(np.abs(a.astype('i2') - b.astype('i2')).max()),
                         'original_rgb_sha256': hashlib.sha256(a.tobytes()).hexdigest(),
                         'candidate_rgb_sha256': hashlib.sha256(b.tobytes()).hexdigest()})
        if i < 7:
            original.save(args.out / (name + '-original.png'))
            candidate.save(args.out / (name + '-candidate.png'))
            x, y = (i % 4) * size[0], (i // 4) * (size[1] + 50)
            sheet.paste(candidate, (x, y))
            draw.text((x + 12, y + size[1] + 12), f'{name}: {different} changed pixels', fill='#1d2433')
    sheet.save(args.out / 'cleanup-candidate-seven-views.png')
    preserved = hashlib.sha256(args.original.read_bytes()).hexdigest() == SOURCE_SHA and hashlib.sha256(args.candidate.read_bytes()).hexdigest() == hashlib.sha256(candidate_raw).hexdigest()
    report = {'status': 'finite-render-regression-check-only',
              'source_sha256': SOURCE_SHA, 'candidate_sha256': hashlib.sha256(candidate_raw).hexdigest(),
              'original_faces': len(source_faces), 'candidate_faces': len(candidate_faces),
              'source_components': len(source_groups), 'candidate_components': len(candidate_groups),
              'position_pool_byte_equivalent': True, 'retained_computed_normals_identical': True,
              'active_bounds_identical': True, 'input_files_preserved': preserved,
              'renderer': renderer.ctx.info.get('GL_RENDERER'), 'size': list(size),
              'all_43_tested_views_pixel_identical': all(v['different_pixels'] == 0 for v in evidence),
              'views': evidence, 'production_geometry_approved': False,
              'limits': '43 finite camera samples and simple gray lighting; no universal silhouette, self-intersection, source-fidelity, material, rig or game approval.'}
    (args.out / 'render-comparison-evidence.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8', newline='\n')
    renderer.ctx.release()
    print(json.dumps({k: report[k] for k in ('candidate_sha256', 'original_faces', 'candidate_faces', 'all_43_tested_views_pixel_identical', 'input_files_preserved', 'renderer')}))
    if not preserved or not report['all_43_tested_views_pixel_identical']:
        raise SystemExit('Input changed or a tested render differed; inspect before accepting the cleanup candidate.')


if __name__ == '__main__':
    main()

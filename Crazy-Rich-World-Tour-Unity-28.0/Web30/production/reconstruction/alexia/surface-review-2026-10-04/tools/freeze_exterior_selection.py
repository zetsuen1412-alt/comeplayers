#!/usr/bin/env python3
"""Freeze the exact original-source face IDs for exterior ablation review.

This writes only selection metadata, never a mesh. Standard library only.
"""
import argparse
import json
import pathlib
from build_exterior_ablation_candidate import digest, frozen_selection, require, validate_inputs


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--original', type=pathlib.Path, required=True)
    parser.add_argument('--base-candidate', type=pathlib.Path, required=True)
    parser.add_argument('--cleanup-proof', type=pathlib.Path, required=True)
    parser.add_argument('--out', type=pathlib.Path, required=True)
    args = parser.parse_args()
    inputs = [args.original.resolve(), args.base_candidate.resolve(), args.cleanup_proof.resolve()]
    output = args.out.resolve()
    require(output not in inputs and not output.exists(), 'Selection output must be new and must not overwrite an input')
    data = validate_inputs(args.original, args.base_candidate, args.cleanup_proof)
    selection = frozen_selection(data[5])
    raw = (json.dumps(selection, separators=(',', ':')) + '\n').encode('utf-8')
    output.parent.mkdir(parents=True, exist_ok=True); output.write_bytes(raw)
    print(json.dumps({'selection': str(output), 'sha256': digest(raw), 'bytes': len(raw),
                      'source_components': [2, 3, 4], 'selected_faces': selection['removedFaceCount'], 'mesh_exported': False}))


if __name__ == '__main__':
    main()

The selected side-quality candidate is reproduced in two standalone steps with
Python and NumPy. The recipes use explicit paths and pinned bytes; neither
imports historical recipes. Output stays outside the unpacked review root, so
rebuilding does not add files to its verified inventory.

From the unpacked review root:

```text
python evidence/selected-alexia/recipes/build_layered_side_hair_integrated.py --source evidence/selected-alexia/source/alexia-baseline.glb --semantic-mask evidence/selected-alexia/source/semantic-masks.npz --reference references/alexia-blue-v2-turnaround.png --output-parent ../Alexia-side-quality-rebuilt --variant integrated-shallow
python evidence/selected-alexia/recipes/polish_side_garment.py --source ../Alexia-side-quality-rebuilt/integrated-shallow/alexia.glb --source-sha256 ebf49c841d763282bd331f8737859c39518df54d5cb51cef54a7d84a517b3027 --garment-mask evidence/selected-alexia/source/garment-mask-diagnostic.npz --output ../Alexia-side-quality-rebuilt/alexia.glb
```

Expected first-step GLB SHA256:
`ebf49c841d763282bd331f8737859c39518df54d5cb51cef54a7d84a517b3027`.

Expected final GLB SHA256:
`e18cc26d9662d5ec615fa636150b5f4eddaab9c8ca4c2b3b1ea702bf1d50efca`,
55,286,388 bytes.

Use a fresh output directory. Existing outputs are rejected. The first step
adds six shallow closed Head-rigid hair crescents and bounded hair RGB. The
second step cleans only the independently reviewed 5,174 upper-jacket RGB rows.
Original positions, normals, UVs, images, weights, skeleton and clips remain
exact. There is no dependency on the rejected first hair trials or optional
headphone bridge.

An actual fresh copied-relative-input two-step reproduction already produced
the final GLB byte for byte, preserving all frozen and copied input SHA256,
byte lengths and modification timestamps. The proof records that execution.
Visual and motion review remain independently bound. The inherited merged
hair core, mottled headphone band, lower garment/shoe/case texture and in-place
gait limitations remain.

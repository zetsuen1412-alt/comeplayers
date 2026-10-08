# Read-only GLB geometry audit

Input: `../v11-hunyuan21-diagnostic/alexia-v11-hunyuan21-untextured-diagnostic.glb`

SHA-256: `d0a0fea651079aa98d026a1610ef0a9e7f4c14c0c466cb1d949886df45c24a66`

449,582 triangles; 224,713 indexed vertices; 1 mesh primitives.

Indexed vertex connectivity: **10**. Exact-coordinate vertex connectivity: **10**. Indexed edge connectivity: **10**. Exact-coordinate edge connectivity: **10**.

Vertex connectivity permits point-only contacts; edge connectivity requires an entire shared edge. Indexed pools stay separate for each mesh primitive/instance. Exact-coordinate pools analytically coalesce equal world-space coordinates across primitive pools; no tolerance, mesh edits, or output welding. Edge-connected exact-coordinate components are the primary surface-island inventory.

No source geometry was edited. Small isolated components are candidates for inspection, not approved deletions.

Primary inventory: exact-coordinate edge-connected surface islands.

| Island | Faces | Area fraction | Bounds min XYZ | Bounds max XYZ | Center within main bounds XYZ | Closed |
|---|---:|---:|---|---|---|---|
| 1 | 448,244 | 99.731994% | -0.709931, -0.99771, -0.452686 | 0.703589, 0.988237, 0.467625 | 0.5, 0.5, 0.5 | True |
| 2 | 500 | 0.106687% | 0.239248, -0.315077, -0.283503 | 0.302385, -0.237448, -0.225444 | 0.693834, 0.363276, 0.215375 | True |
| 3 | 212 | 0.046510% | -0.234688, 0.44996, -0.327177 | -0.177043, 0.483149, -0.291658 | 0.356603, 0.737313, 0.155674 | True |
| 4 | 200 | 0.041824% | 0.351311, 0.101968, -0.446562 | 0.408045, 0.121326, -0.375937 | 0.770848, 0.558603, 0.0450245 | True |
| 5 | 188 | 0.033703% | 0.238616, -0.226045, 0.0495674 | 0.264335, -0.189787, 0.0930429 | 0.680151, 0.397691, 0.569363 | True |
| 6 | 124 | 0.024151% | -0.0575513, 0.24486, 0.0641389 | 0.000649197, 0.266281, 0.0798499 | 0.482116, 0.631074, 0.570112 | True |
| 7 | 82 | 0.012481% | 0.176155, -0.216679, 0.000776206 | 0.19715, -0.185183, 0.0146291 | 0.634291, 0.401209, 0.500253 | True |
| 8 | 16 | 0.002305% | -0.189338, 0.2366, 0.085055 | -0.180011, 0.242136, 0.100766 | 0.371595, 0.622916, 0.592839 | True |
| 9 | 8 | 0.000250% | -0.0701672, 0.513261, 0.395912 | -0.065842, 0.517784, 0.397794 | 0.454133, 0.76197, 0.9231 | True |
| 10 | 8 | 0.000095% | -0.0600339, 0.254923, 0.0800197 | -0.0580711, 0.25652, 0.083141 | 0.460467, 0.631151, 0.580528 | True |

Bounds and connectivity locate isolated parts but cannot establish hair/eye/finger anatomy or decide deletion. Requires visual inspection of the actual mesh and reference.

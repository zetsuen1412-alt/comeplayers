# CRWT24 — City & Landmark Pipeline

- Renderer 3D membaca nama kota, map, level properti, dan owner langsung dari snapshot server.
- Level visual: House → Tower → Hotel → Grand Hotel → Landmark.
- Landmark signature ditentukan oleh `manifest.json`; semua signature saat ini mempunyai procedural WebGL fallback.
- `external_model_ready: true` berarti profile sudah mempunyai slot stabil untuk diganti model GLB final tanpa mengubah aturan gameplay.
- Server tetap authoritative; asset 3D tidak menentukan sewa, harga, upgrade, takeover, atau kemenangan.

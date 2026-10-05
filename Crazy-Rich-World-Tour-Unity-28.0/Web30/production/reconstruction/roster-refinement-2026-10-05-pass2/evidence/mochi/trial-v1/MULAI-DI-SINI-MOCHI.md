# Mochi — kandidat hardware tas

Gesper diagonal pada shoulder strap dan pengunci gold–teal tas kini berupa lima volume 3D baru yang tertutup. Seluruh 23.260 triangle sumber, UV, normal, material, image, node, kedua appendage asli dan connector Oct04 tetap utuh; tidak ada face dihapus atau vertex dipindahkan.

Buka `comparison.png` untuk referensi 2D dan render mesh sebelum–sesudah. `final-actual-mesh-renders/` memuat tujuh view640px dan24 orbit320px. `.blend` packed pada `actual-mesh-review/` dibuka ulang dalam proses Blender terpisah dengan dua tekstur2048² tersimpan internal dan fingerprint mesh sumber identik.

GLB memiliki24.404 triangle,18.334 accessor vertices,2 meshes,2 embedded images,0 skins/animations. Blender mengimpor14.896 vertices sumber yang terpakai plus3.432 vertices hardware; enam vertex sumber yang tidak terpakai tetap disimpan pada accessor GLB aslinya.

Sumber belum sempurna: wajah, paws, body, hat, tas/back dan creamy tip masih lembut. Referensi depan mendukung posisi serta warna gesper; ketebalan, detail kedalaman dan stud tengah sederhana merupakan interpretasi manual. Lima volume tambahan masing-masing tertutup dan memiliki winding konsisten, tetapi tidak ada sertifikasi global bebas-intersection. Tidak ada perubahan tekstur bitmap, AI/cloud call, rig, approval visual pengguna atau integrasi game.

`HANDOFF.json` mengikat hash GLB/blend/proofs/renders dan mencatat recipe_paths. Jalankan recipe builder dengan `--out` path BARU untuk reproduksi; output existing ditolak.

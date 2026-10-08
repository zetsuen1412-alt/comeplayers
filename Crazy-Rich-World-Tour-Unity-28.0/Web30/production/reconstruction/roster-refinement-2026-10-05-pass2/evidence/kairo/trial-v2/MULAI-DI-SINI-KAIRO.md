# Kairo V2 — trim tipis goggles

Dua bead emas asli 3D ditambahkan pada tepi goggles yang sudah ada. Lensa, frame dasar, strap, seluruh body/UV/material/textures dan nodes sumber tetap identik. V1 kink disimpan sebagai prototipe lama; pilih kandidat V2 saja.

Buka `kairo-fitted-rim-beads-candidate.blend`: packed scene dibuka ulang dalam proses Blender terpisah, dan geometri/topologi/corner normals/UV/world transforms/material graph serta image bytes identik dengan scene native yang disimpan. Dua image1024² tersimpan internal, tanpa skin atau animation.

`final-actual-mesh-renders/` berisi tujuh view640px dan24 orbit320px dari mesh GLB sebenarnya. GLB tervalidasi27.820 triangles,20.492 vertices,3 meshes,2 images. Source21.676triangles tetap; dua bead menambah6.144triangles/3.072vertices.

Batas utama: fitted plane pada rim kanan-bawah mengecualikan12sampel kedalaman yang mengenai rambut; segmen tersebut dapat menyimpang0,02028908096unit dari hit sumber. Bukan bukti seating sempurna. Dua bead baru tertutup/winding konsisten, namun tidak ada klaim global bebas intersection. Source wajah, rambut, tangan, pakaian dan rear masih lembut. Kandidat belum disetujui pengguna atau terintegrasi game.

`HANDOFF.json` pada folder karakter menyimpan path/hash/cakupan; recipe membutuhkan path input sumber yang benar. Packedblend adalah awal edit portable setelah dipaketkan. Jangan overwrite source, V1, V2 atau proof frozen.

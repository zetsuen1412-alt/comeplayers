# Luna — kepala tongkat, kandidat inspeksi 5 Oktober 2026

Kandidat ini memperbaiki **kepala tongkat saja** dengan bola sapphire, tiga cincin armillary, collar, penyangga, finial, dan rivet berupa geometri 3D. Source dan GLB kandidat yang sudah ditinjau tetap byte-identik. `approved=false`, `gameIntegrated=false`; model masih statis, tanpa rig dan animasi.

| Aset di folder ini | Ukuran | SHA256 |
|---|---:|---|
| `luna-staff-head-refined-candidate.glb` | 3.076.744 byte | `2dea095cc34c52bcda460633b0062e9036adfd004e2cc9a519a8ef33d21a6381` |
| `luna-staff-head-refined-candidate.blend` | 2.456.174 byte | `cb88358bcc3ddeb4cd21ac2578bdb7430ff9666253426e1994d4e73246045c23` |

Buka `.blend` di Blender untuk melanjutkan pengeditan. Scene aktif bernama **Luna Staff Head Review Candidate**; seluruh model tampak dalam 13 objek mesh, termasuk 12 bagian aksesori baru. Kedua tekstur 2048×2048 sudah packed, dan byte JPEG-nya sama dengan gambar embedded di GLB. File dapat dibuka di komputer lain tanpa folder gambar lama. `.blend` merupakan impor penuh geometri yang dirujuk GLB, bukan file lama yang hanya memuat addon kepala tongkat.

GLB berisi 55.274 triangle dan 40.535 vertex accessor. Impor Blender berisi 39.343 vertex dan tetap 55.274 triangle; representasi impor tidak menyimpan seluruh vertex source yang tidak lagi dirujuk. Source GLB serta BIN/atribut aslinya tetap tersedia dan tidak ditulis ulang. Buka ulang `.blend` secara read-only membuktikan fingerprint posisi, topology, corner normal, UV, transform, material node, dan gambar sama dengan saat file dibuat. Tidak ada penyederhanaan geometri, perubahan material, bitmap editing, rig, atau clip baru dalam proses pembuatan `.blend`.

Source GLB sebelum pass memiliki SHA256 `33f8426e3a4d13957c854f6da62d0105ed98555134154ab96d8b38e7c5a58fcc`, 2.198.364 byte dan 33.620 triangle. Seleksi beku mengganti 1.101 face kepala tongkat; 32.519 face source lain tetap dalam urutan asli. Sebelas triangle menutup loop neck, lalu 22.744 triangle aksesori ditambahkan. Delta total: +21.654 triangle dan +878.380 byte GLB. Posisi, normal, UV, material, dan kedua gambar source dipertahankan; BIN source menjadi prefix byte-identik pada kandidat.

`neck-cap-exact-audit.json` lulus dengan nol improper contact untuk cap baru terhadap seluruh face source yang dipertahankan dan antar-cap. Cakupan ini tidak menyatakan bahwa seluruh volume aksesori, atau semua pasangan face source lama, bebas intersection.

Render baru berada di `actual-mesh-renders-complete/`: tujuh tampilan 640px dan 24 frame orbit 320px, seluruhnya dari GLB asli menggunakan Blender 5.2.2/Cycles CPU/32 samples. Mulai dari `front.png`, `three-quarter.png`, `left.png`, `back.png`, dan `orbit/frame-015.png`. Folder `actual-mesh-renders/` yang lebih lama tetap berisi tiga tampilan awal dan tidak ditimpa.

Dibanding source, bola dan cincin tongkat kini lebih jelas sebagai volume terpisah pada front, quarter, profile, serta back. Model tidak memakai billboard referensi. Rambut, topi, wajah, tangan, pakaian, dan ornament bulan bawah masih mengikuti rekonstruksi source yang kasar; bagian belakang rambut/cloak tampak menggumpal dan sebagian permukaannya faceted. Motif emas pada globe dan siluet bintang kecil di finial belum mengikuti acuan secara lengkap. Kedalaman tersembunyi kepala tongkat merupakan interpretasi dari satu referensi depan. Perbaikan ini belum membuktikan kecocokan sempurna atau kesiapan untuk gameplay.

Bukti lokal:

- `luna-staff-head-refined-candidate.source-preservation.json`: seleksi face, preservasi source, topology neck dan validasi GLB.
- `neck-cap-exact-audit.json`: audit perpotongan cap dalam cakupan yang disebutkan di atas.
- `editable-build-proof.json`: impor kandidat, packed image bytes, dan fingerprint native sebelum save.
- `editable-readonly-reopen-proof.json`: buka ulang aktual `.blend`, seluruh fingerprint cocok, 13 mesh/55.274 triangle/dua gambar packed, nol armature/action.
- `actual-mesh-renders-complete/render-evidence.json`: hash GLB, bounds dan setelan render aktual.
- `LUNA-HANDOFF.json`: identitas file dan bukti preservasi dengan path relatif.

Helper `../save_editable_candidate.py` dapat membuat `.blend` baru dari source/kandidat yang dipulihkan, atau memverifikasi file yang sudah dibuat. Ia memeriksa hash beku, menyimpan output hanya di folder pass ini, menolak overwrite, dan tidak mengubah GLB. Untuk membuat file baru, gunakan `--mode create --source PATH-SOURCE.glb --candidate PATH-KANDIDAT.glb --blend PATH-BARU.blend --proof PATH-BARU.json` melalui Blender dengan `--background --factory-startup --disable-autoexec --python-exit-code 3 --python ... --`. Untuk memverifikasi, gunakan `--mode verify` dengan `--build-proof` dari saat create dan nama proof baru. Hash `.blend` mencakup metadata save Blender; pin di atas mengidentifikasi file yang sudah dibuka ulang dan ditinjau.

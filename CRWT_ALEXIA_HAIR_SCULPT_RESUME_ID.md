# Crazy Rich World Tour — Alexia core hair sculpt

Lanjutkan dari `checkpoint/crazy-rich-world-tour-2026-10-05-alexia-hair-sculpt-portable`.
Folder review: `Crazy-Rich-World-Tour-Unity-28.0/Web30/production/reconstruction/roster-hair-sculpt-2026-10-05`. Baseline sebelumnya tetap pada `checkpoint/crazy-rich-world-tour-2026-10-05-alexia-hair-strands-portable`.

Ekstrak `OFFLINE-GALLERY.zip`, lalu buka `BUKA-REVIEW-MODEL.html`. Dari folder review, ekstraksi dengan CRC/SHA tanpa menimpa file:
```sh
python tools/restore_offline_gallery.py --archive OFFLINE-GALLERY.zip --pins source-pins.json --out BUKA-REVIEW-MODEL.html
```
HTML SHA256 `c42768fabdfd53106a145b679d6e6f4c8a2a9e4f1f40d536c93394f6b33b9a29`. Paket lokal menyertakan HTML langsung.

Hanya rambut inti Alexia berubah. Seluruh tiga mesh, vertex dan face tetap berjumlah sama dengan baseline aktual. Dua stream POSITION/NORMAL pengganti ditambahkan setelah seluruh BIN lama; hanya dua rujukan atribut mesh0 berubah. Mask rambut belakang dihitung dari posisi, normal dan warna sumber. UV, COLOR, indeks, material, seluruh atribut mesh1/2, node, gambar, rig dan klip tetap persis. Sembilan GLB lain, seluruh referensi dan 45 render lama tetap identik. Alexia memiliki lima render aktual baru. Pip mempertahankan 13 joint dan enam klip.

Untuk edit, buka `editable/Alexia-hair-sculpt-review.blend`, berisi Alexia saja. Fingerprint setiap mesh, normal, UV, material dan COLOR diverifikasi saat save/reopen lokal. CI membaca sertifikat dan fingerprint dinamis tanpa menjalankan Blender/GPU. Representasi warna native mengikuti importer Blender; COLOR GLB tetap persis. Native penuh roster tetap pada checkpoint reference-fidelity terdahulu.

Recipe portabel, kedua helper dan baseline19f tersedia di paket ini. Dari root folder review atau hasil ekstrak ZIP, jalankan Python3 dengan NumPy:
```sh
python evidence/selected-alexia/recipes/portable_reproduce_hair_sculpt.py --source evidence/selected-alexia/source/alexia-baseline.glb --reference references/alexia-blue-v2-turnaround.png --output-parent ../alexia-rebuilt --variant moderate
```
Output parent harus baru dan berada di luar folder review yang diperiksa inventori. Reproduksi aktual dari copy recipe/baseline/reference telah menghasilkan SHA kandidat `a605eedeaf86740d14f92d04553b25c016a1c0bf362a2265036fadb5aa60acd4` persis. Perintah memakai path eksplisit dan tidak membaca kandidat yang ditolak atau output historis. Panduan tambahan ada di `evidence/selected-alexia/recipes/portable-reproduction-usage.txt` dan proof di `evidence/selected-alexia/portable-reproduction-proof.json`.

```sh
git -c core.autocrlf=false clone --branch checkpoint/crazy-rich-world-tour-2026-10-05-alexia-hair-sculpt-portable https://github.com/zetsuen1412-alt/comeplayers.git
```
Inventori ASCII merekam SHA256, ukuran dan identitas Git blob setiap sumber baru kecuali dirinya sendiri dan receipt publikasi lokal. Empat helper runtime membaca raw HEAD, memverifikasi sculpt terhadap GLB baseline aktual dan membangun ulang gallery ke folder baru. Publisher mempertahankan 4.221 blob repository baseline; ZIP model lokal berisi payload review, sementara source game dan Git history tetap pada branch yang direkam.

Model tetap kandidat belum disetujui dan belum terintegrasi game. Mask sumber dan pemeriksaan geometri melindungi atribut di luar rambut; hasil tetap membutuhkan review visual. Tidak ada klaim sempurna 360 derajat atau sertifikasi seluruh interseksi. Batas rinci terdapat pada manifest dan proof terpilih.

Catatan parameter aktif v3: `evidence/selected-alexia/parameter-interpretation.txt`. Recipe continuous memakai hard mask tanpa erosi, Euclidean boundary-distance fade dan nol iterasi confidence/final inset smoothing. Narasi helper lama tentang erosi/geodesic/shared confidence di proof diwarisi dan tidak aktif. Frozen proof dan recipe tetap persis.

# Alexia — proyeksi kandidat bersih dan pembanding fragmen luar

Tahap 2026-10-04 ini melanjutkan checkpoint 28a0bc33 tanpa mengubah sumber
atau kandidat sebelumnya. Seluruh 10 karakter dan source Blender roster
revision10 dipertahankan. Accepted production models = 0.

## Hasil aktual

1. Kandidat interior yang sebelumnya abu-abu sekarang mempunyai proyeksi
   depan terverifikasi: 449.164 triangle aktif, 103.443 berwarna dan
   345.721 tetap abu-abu. POSITION, colored indices/UV/JPEG/material sama
   persis dengan diagnostik asli. Union kedua primitive memulihkan urutan
   triangle kandidat secara bijektif. Render albedo dari 43 sudut uji
   mempunyai hash RGB identik dengan baseline proyeksi sebelum cleanup.
2. Varian terpisah menghilangkan tiga island luar 2/3/4: 912 triangle
   tambahan. Tersisa 448.252 triangle, seluruh komponen utama 448.244 dan
   shard mata/poni 9 dengan delapan triangle. Posisi dan urutan triangle
   tersisa tetap byte-identical. Pada 43 render abu-abu, tampak depan
   identik dan semua perubahan berada di proyeksi ketiga island tersebut.
   Profile/silhouette samping mempunyai perubahan lokal; jangan mengklaim
   silhouette universal tidak berubah.
3. Viewer baru membandingkan V11 asli, kandidat interior berwarna dan
   varian luar abu-abu. Tombol Lihat referensi V2 membuka enam pandangan
   gambar sumber mata biru. GLB terkompresi di dalam HTML, dibaca kembali
   secara lossless dan hash sumber diperiksa sebelum GLTFLoader membuka.
   Browser modern dengan WebGL2 dan DecompressionStream diperlukan.

Varian luar adalah perbandingan desain, bukan persetujuan menghapus rambut
permanen. Referensi V2 dan capture belakang menunjukkan ujung curl bertingkat,
tetapi pose/skala/akar rambut multiview belum terkalibrasi. Komponen2 paling
berisiko mengurangi kesan tip rambut dekat hem. Komponen9 sengaja dipertahankan.
Loop besar, root/flyaway pada komponen utama, relief mata, jari/cuff menyatu
tetap belum diperbaiki. Sisi tersembunyi belum tekstur penuh, belum rig/game.
Tidak ada generation cloud atau penggantian asset gameplay pada tahap ini.

## Gunakan di komputer lain

Ekstrak CRWT-Web30-revisi-2026-10-04.zip dan jalankan
python verify_portable_workspace.py dari root ekstraksi. Buka
viewer/BUKA-REVISI-ALEXIA.html dalam folder ini. Semua GLB/vendor/reference
disertakan; tidak perlu CDN, internet atau API key. Di browser Codex,
verifikasi UI dilakukan melalui localhost karena protokol file dibatasi.
Model/referensi/dropdown diuji aktual; console errors=0.

Paket mencakup Web30. Clone repo penuh untuk Unity di luar Web30 dan website
mirrors, lalu jalankan Web30/tools/verify_checkpoint.py untuk baseline978file.
Snapshot terbaru: checkpoint/crazy-rich-world-tour-2026-10-04-surface-review.
Snapshot awal7624167, proyeksi4fa2f97 dan interior28a0bc33 tetap frozen.

## Reproduksi

Git menyimpan frozen selections, builder stdlib, bukti, template dan vendor
bundle tahap interior. Workflow CRWT Portable Character Workspace membangun
ulang kandidat dan viewer dengan expected SHA-256; private artifact mempunyai
retention tujuh hari, source di Git tetap dapat dipakai membangun ulang.
Keluaran GPU PNG/GIF ada di ZIP lokal; render membutuhkan numpy, Pillow,
trimesh, moderngl/glcontext dan OpenGL3.3. Builder GLB/viewer hanya stdlib.

Urutan workflow: baseline978 -> proyeksi asli -> interior cleanup -> viewer
lama -> transport proyeksi ke kandidat -> ablation2/3/4 -> viewer baru -> ZIP.
Exporter ablation membaca cleanup proof Windows yang frozen pada Git, bukan
proof CI hasil rebuild yang mencatat versi Python berbeda. Output proof CI
dipisahkan dari receipt tracked; model lama tidak ditimpa.

| Keluaran | SHA-256 |
|---|---|
| Interior dengan proyeksi | 4fd3724ec128557e089dea2e78a48873f9ba1140cd80eadbbee38c00df43c599 |
| Varian luar abu-abu | 6ae8b914b7c3a573d1335a54bc2875ab05df0e82d1442054b4820e28602d2cac |
| Viewer baru | 1f72bd921c907920a47134bc083de69f8991e1d877fb5343ffe3f474e0061158 |
| Selection luar | 953b5fefef44c75bc28195c5606ec6f65aeb9844b2f9ea084c4b8d3d2a90d85e |

Langkah berikut: nilai varian luar bersama referensi, pilih desain rambut
utama dan bentuk mata/tangan. Tindak lanjut harus berupa edit geometri
terarah dengan review, sebelum tekstur penuh/rig. Source Jutsu revision6
masih eksternal; source.blend roster lama tidak boleh disebut source V11.

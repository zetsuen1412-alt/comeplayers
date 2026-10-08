# Alexia V11 — kandidat pembersihan interior, 2026-10-04

Salinan kandidat menghapus hanya komponen interior 5/6/7/8/10: 418 segitiga,
217 vertex terpakai. Tersisa 449.164 segitiga dan lima komponen permukaan.
Seluruh posisi, BIN sumber, indeks lama, nodes dan scenes dipertahankan;
indeks aktif baru ditambahkan. File kandidat lebih besar karena preservasi
buffer, bukan hasil optimasi ukuran. Model asli dan seluruh 10 roster tetap utuh.

Certificate final memeriksa semua 217 vertex dengan exact binary rational
ray parity dan seluruh 187.365.992 pasangan triangle dengan pemisahan ketat.
Empat island luar 2/3/4/9 tidak dihapus. Rambut, mata, jari dan cuff belum
diperbaiki; tekstur lengkap, rig dan integrasi game masih belum selesai.
Roster sculpt-v1 masih backup_only/rejected_by_user. Accepted models = 0.

Render model aktual dari tujuh preset dan 36 sudut orbit menghasilkan piksel
identik pada 43 sudut yang diuji. Ini pemeriksaan regresi terbatas, bukan
persetujuan anatomi atau bukti universal untuk semua sudut/pencahayaan.
Self-intersection global komponen utama belum diuji.

## Buka hasil

Dalam paket portabel, buka viewer/BUKA-INSPEKSI-ALEXIA.html di browser desktop.
HTML menyertakan model asli, proyeksi depan sebelumnya, kandidat cleanup,
Three.js r180 dan lisensi MIT. Tidak perlu server, CDN atau internet.
Pilih model, putar/zoom, gunakan preset sisi, wireframe atau override abu-abu.
Proyeksi depan tetap diagnostik satu gambar pada geometri asli: 24,72% area
berwarna, sisanya abu-abu. Kandidat cleanup sendiri belum bertekstur.

## Reproduksi dari Git

Source, certificate, template dan vendor bundle disimpan permanen di Git.
Binary kandidat dan HTML besar dibangun ulang oleh workflow
CRWT Portable Character Workspace, kemudian disertakan private artifact.
Artifact kedaluwarsa setelah tujuh hari; source Git dapat membangunnya lagi.
Paket lokal menyertakan binary dan hasil render aktual.

Jalankan dari folder ini setelah checkout snapshot repo penuh:

```sh
python tools/build_interior_cleanup_candidate.py ../v11-hunyuan21-diagnostic/alexia-v11-hunyuan21-untextured-diagnostic.glb --containment-proof containment-proof-exact.json --containment-proof-sha256 1c28f04907e44fd9b0a0f2169854e19a06bd4a26ca495074a19219c6be599935 --confirm-proven-interior-candidate --expected-output-sha256 dae2b0784b190649e5ae69ef2854aa06798468d2244eb5982d61a759c0c54af0 --out candidate/alexia-v11-interior-cleanup-candidate.glb --proof candidate/ci-cleanup-proof.json
```

Python 3.10+ stdlib cukup untuk exporter dan viewer. Untuk viewer gunakan
viewer/build_offline_viewer.py --vendor-bundle viewer/viewer-vendor-bundle.json,
GLB asli, proyeksi dari folder continuation-2026-10-04, kandidat di atas,
dan --cleanup-note yang persis sama dengan viewer/cleanup-note.txt.
Workflow menyimpan HTML SHA-256 expected untuk mencegah drift.

Mengulang proof membutuhkan numpy. Render perbandingan membutuhkan numpy,
Pillow, moderngl/glcontext dan OpenGL 3.3. Helper berada bersama di tools/.
Raw proof menyimpan metadata path dan waktu asal; proof baru dapat mempunyai
hash berbeda. Exporter menggunakan certificate frozen yang tercatat berikut.

| Berkas | SHA-256 |
|---|---|
| V11 asli | d0a0fea651079aa98d026a1610ef0a9e7f4c14c0c466cb1d949886df45c24a66 |
| Certificate exact | 1c28f04907e44fd9b0a0f2169854e19a06bd4a26ca495074a19219c6be599935 |
| Kandidat cleanup | dae2b0784b190649e5ae69ef2854aa06798468d2244eb5982d61a759c0c54af0 |
| Viewer offline | 257e2d0ffa08fb43574310e9ec871b7730bfdcf5143de0ebfa133a65f3fade8c |
| Vendor bundle | 43bf931cfb7d735f0d69923f4d6dd9352113b6e506f8de38f012f8d2c78cfad2 |

Snapshot tahap ini: checkpoint/crazy-rich-world-tour-2026-10-04-interior-review.
Snapshot awal 7624167 dan lanjutan 4fa2f97 tetap dipertahankan.

Langkah berikut: tinjau model dalam viewer bersama referensi V2 mata biru;
revisi bentuk rambut/mata/tangan dan konsistensi multiview sebelum UV/tekstur
lengkap atau rig. Pemulihan kandidat 3D Jutsu revision6 masih eksternal.

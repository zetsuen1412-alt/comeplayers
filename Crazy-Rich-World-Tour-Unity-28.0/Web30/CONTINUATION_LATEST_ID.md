# Crazy Rich: World Tour — titik lanjut terbaru 2026-10-04

Tahap terbaru: **kandidat interior dengan proyeksi warna dan pembanding
tiga fragmen rambut luar**. Mulai dari [README tahap ini](production/reconstruction/alexia/surface-review-2026-10-04/README_ID.md).
Snapshot: checkpoint/crazy-rich-world-tour-2026-10-04-surface-review.
Branch kerja: codex/crazy-rich-web-v30.

Kandidat interior 449.164 triangle kini memuat proyeksi depan, 103.443 triangle
berwarna; 43 render albedo identik dengan baseline. Varian luar menghilangkan
912 triangle komponen 2/3/4, menyisakan 448.252 triangle (main dan shard9).
Tampak depan sama; profile/back berubah lokal. V11, seluruh 10 roster dan kandidat
lama dipertahankan. Loop/root rambut utama, mata, jari/cuff masih perlu edit.
Belum tekstur penuh, rig atau game approval. **Accepted models = 0.**

## Pindah komputer

Ekstrak CRWT-Web30-revisi-2026-10-04.zip, jalankan
python verify_portable_workspace.py dari root ekstraksi, lalu buka
viewer/BUKA-REVISI-ALEXIA.html di folder tahap surface-review ini.
Pilih model dan Lihat referensi V2. Viewer memuat GLB/vendor/reference
secara mandiri; GLB dibaca lossless dan hash diperiksa. Browser modern
dengan WebGL2 dan DecompressionStream dibutuhkan.

Paket mencakup Web30 saja. Clone repo penuh untuk Unity di luar Web30 dan
website mirrors; jalankan python Crazy-Rich-World-Tour-Unity-28.0/Web30/tools/verify_checkpoint.py
untuk baseline 978 file. Source/selection/certificate/template tetap di Git;
workflow membangun ulang GLB/viewer dengan expected hash. Artifact disimpan 7 hari.

Snapshot sebelumnya tetap: awal 7624167dc3d38ba8cb4bf3cb866b8e0e48a3b3b7,
proyeksi 4fa2f97cfe5ba931395a71a7c58a265ffbe1156e, dan
interior 28a0bc33bf96782dc3b5cf87ae95ae0628803a45.
[Tahap interior sebelumnya](production/reconstruction/alexia/interior-cleanup-2026-10-04/README_ID.md).
Source Blender roster revision10 bukan source Hunyuan V11. Jutsu revision6
masih eksternal. Roster sculpt-v1 tetap backup_only/rejected_by_user.

> Lanjutkan dari README tahap surface. Verifikasi paket, tinjau varian luar
> bersama referensi V2 dan pilih edit geometri rambut utama/mata/tangan.
> Pertahankan semua 10 karakter dan mata biru Alexia. Jangan anggap proyeksi
> atau ablation sebagai persetujuan final, sebelum UV/tekstur/rig/game.

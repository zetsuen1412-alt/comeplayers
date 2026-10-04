# Crazy Rich: World Tour — titik lanjut terbaru 2026-10-04

Tahap terbaru: **kandidat pembersihan interior Alexia V11 dan viewer offline**.
Mulai dari [README tahap ini](production/reconstruction/alexia/interior-cleanup-2026-10-04/README_ID.md).
Snapshot: `checkpoint/crazy-rich-world-tour-2026-10-04-interior-review`.
Branch kerja: `codex/crazy-rich-web-v30`.

Hanya 418 segitiga pada lima komponen interior terbukti yang dihapus dari
salinan kandidat; 449.164 segitiga tersisa. Model asli, empat island luar,
rambut/mata/tangan/cuff dipertahankan. Hasil render identik pada 43 sudut uji.
Viewer membandingkan V11 asli, diagnostik proyeksi depan, dan kandidat cleanup.
Belum tekstur lengkap, rig, persetujuan visual atau integrasi game.
Roster sculpt-v1 tetap backup_only/rejected_by_user. **Accepted models = 0.**

Seluruh 10 GLB (Alexia, Rindi, Kairo, Luna, Nox, Atlas, Zeno, Yuna, Mochi,
Pip), roster gabungan dan source.blend roster revision10 sudah dipulihkan
dan diverifikasi. Bukti ada pada [pemulihan aset](production/reconstruction/alexia/continuation-2026-10-04/asset-recovery.json).

## Pindah komputer

Ekstrak `CRWT-Web30-inspeksi-2026-10-04.zip`, jalankan
`python verify_portable_workspace.py` dari root ekstraksi, lalu buka
`BUKA-INSPEKSI-ALEXIA.html` di folder viewer tahap interior. HTML berdiri
sendiri, tidak memerlukan internet atau instalasi paket.

Paket mencakup Web30 saja. Clone snapshot GitHub untuk seluruh Unity project
dan website mirrors; jalankan `python Crazy-Rich-World-Tour-Unity-28.0/Web30/tools/verify_checkpoint.py`
di repo penuh untuk baseline978file. Source dan certificate tahap ini tersimpan
di Git; workflow membangun ulang GLB kandidat dan viewer byte-identik memakai
Python stdlib. Artifact workflow private disimpan tujuh hari.

Snapshot awal `7624167dc3d38ba8cb4bf3cb866b8e0e48a3b3b7` dan snapshot
lanjutan `4fa2f97cfe5ba931395a71a7c58a265ffbe1156e` tetap utuh.
[Tahap proyeksi sebelumnya](production/reconstruction/alexia/continuation-2026-10-04/README_ID.md)
menyimpan diagnostik warna depan 24,72% area pada geometri asli.
Source Blender roster lama bukan source Hunyuan V11; ekspor 3D Jutsu revision6
masih perlu dipulihkan dari sumber eksternal.

> Lanjutkan dari README tahap interior. Verifikasi paket, buka viewer dan
> tinjau bentuk rambut, mata biru, tangan dan cuff terhadap referensi V2.
> Pertahankan seluruh model sumber; selesaikan geometri dan referensi
> multiview sebelum UV/tekstur/rig. Diagnostik belum persetujuan final.

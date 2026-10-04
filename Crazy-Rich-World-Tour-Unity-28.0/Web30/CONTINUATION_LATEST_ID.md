# Crazy Rich: World Tour — titik lanjut terbaru

Tahap terbaru: **kelanjutan pertandingan dan save yang bisa dipindahkan**.
Mulai dari [README checkpoint](checkpoints/2026-10-04-gameplay-continuity/README_ID.md)
dan [panduan komputer lain](checkpoints/2026-10-04-gameplay-continuity/PORTABLE_GUIDE_ID.txt).
Snapshot: `checkpoint/crazy-rich-world-tour-2026-10-04-gameplay-continuity`.
Branch kerja: `codex/crazy-rich-web-v30`.

Room online yang sedang bermain mempunyai tombol LANJUTKAN PERTANDINGAN untuk
host dan peserta. Match aktif dibaca dari server; resume tidak membuat match
baru. Pembaruan token sesi diteruskan ke iframe yang dipercaya. Save lokal
menyimpan engine, sisa kartu aksi dan bonus Double Roll dalam satu dokumen.
Import lama tetap didukung tanpa mengambil extras milik match sebelumnya.

Ekstrak CRWT-Web30-gameplay-checkpoint-2026-10-04.zip dan jalankan
`python verify_portable_workspace.py`. Ikuti MULAI-DI-SINI.txt untuk membuka
launcher lewat localhost dan memindahkan save JSON. ZIP memuat seluruh Web30;
clone repository penuh untuk Unity di luar Web30 serta mirror website.
Pada repo penuh, `tools/verify_checkpoint.py` memilih inventaris terbaru.

Checkpoint aset terakhir tetap tersedia pada snapshot surface-review
`e3418fb908eae53f3f499c412beba4b6b6d681d1`.
[Catatan Alexia](production/reconstruction/alexia/surface-review-2026-10-04/README_ID.md)
dan viewer offline tetap disertakan bersama seluruh 10 GLB roster, source
Blender lama, referensi V2 dan V11 asli. Belum ada kandidat model yang
 disetujui atau dipasang ke game: accepted models = 0.

Snapshot historis dipertahankan: awal `7624167dc3d38ba8cb4bf3cb866b8e0e48a3b3b7`,
proyeksi `4fa2f97cfe5ba931395a71a7c58a265ffbe1156e`, interior
`28a0bc33bf96782dc3b5cf87ae95ae0628803a45` dan surface-review di atas.

Pesan lanjut untuk Codex: verifikasi checkpoint, jalankan kedua tes kelanjutan
pertandingan dan cek source/mirror. Lanjutkan fitur gameplay dari source Web30
dengan aturan online server-authoritative. Pertahankan semua 10 karakter.
Untuk revisi karakter, ikuti status review permukaan dan jangan menganggap
GLB valid atau proyeksi depan sebagai persetujuan visual/final pengguna.

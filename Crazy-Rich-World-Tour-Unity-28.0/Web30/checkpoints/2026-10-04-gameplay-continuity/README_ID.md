# Crazy Rich: World Tour — kelanjutan pertandingan

Checkpoint ini memperbaiki perjalanan kembali dari game ke room dan pemindahan
save lokal ke browser lain. Tombol LANJUTKAN PERTANDINGAN membaca match aktif
dari server untuk host maupun peserta. Pembaruan access token dari launcher
diteruskan ke renderer yang dipercaya tanpa mengulang intro atau membuat poll
baru. Server tetap menentukan giliran, ekonomi, dadu dan hasil online.

Ekspor lokal sekarang menyimpan engine, sisa action cards dan bonus Double
Roll dalam satu dokumen. Import memvalidasi dokumen sebelum mengganti match.
Save engine-only lama tetap didukung dengan extras awal yang deterministik;
ia tidak mengambil kartu dari match yang sebelumnya dimainkan di browser.

Source Web30 dan mirror website disinkronkan. Cache PWA mempunyai nama baru
agar shell lama diganti setelah service worker terbaru terpasang.

## Melanjutkan di komputer lain

Ikuti [PORTABLE_GUIDE_ID.txt](PORTABLE_GUIDE_ID.txt). Paket ZIP Web30 membawa
source dan seluruh aset lokal, tetapi save permainan harus diekspor sendiri
melalui Pengaturan. Sesi login tidak dibundel. Untuk Unity dan website lengkap,
clone repo privat lalu checkout
`checkpoint/crazy-rich-world-tour-2026-10-04-gameplay-continuity`.

`tools/verify_checkpoint.py` memilih inventaris checkpoint ini jika tersedia.
Inventaris asli 978 berkas dan keempat snapshot sebelumnya tetap disimpan.
Inventaris baru menggunakan Git blob SHA-1 untuk source dan SHA-256 tambahan
untuk aset yang memiliki receipt. Inventaris tidak memuat hash dirinya sendiri.

## Verifikasi

- `node tools/test_offline_save.mjs`: roundtrip kartu/bonus, autosave lama,
  import format lama dan penolakan save tidak valid sebelum mutasi.
- `node tools/test_online_resume.mjs`: resume match yang sama, host/peserta,
  klik ganda, sesi diperbarui dan pesan dari sumber yang tidak dipercaya.
- `node tools/publish.mjs --check`: source dan mirror website sama.
- Browser localhost: lobby, permainan lokal, Settings dan Export Save.
- CI: tes Web30 yang ada, typecheck dan build website, inventaris source
  serta rebuild aset portabel dengan hash yang telah dibekukan.

Tes online otomatis memakai fixture RPC; belum menjadi bukti pertandingan
multiakun langsung melawan backend produksi. Tidak ada perubahan schema,
fungsi SQL, currency server atau aturan pertandingan.

## Status karakter

Semua aset Alexia, Rindi dan delapan karakter lainnya dipertahankan.
[Review permukaan Alexia](../../production/reconstruction/alexia/surface-review-2026-10-04/README_ID.md)
masih berlaku: proyeksi depan dan varian fragmen merupakan kandidat review,
belum full texture/rig atau persetujuan game. Accepted models = 0.

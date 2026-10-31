# Windows 2.4.0 — Pearl Blue

Pengguna memilih Pearl Blue dari sepuluh pratinjau warna. Pembaruan ini menerapkan
sidebar dan panel putih, latar abu kebiruan terang, teks gelap dan tombol/menu
aktif biru. Palet ditetapkan di `LuxuryControls.cs`; nama tema dan versi tampil di
Pengaturan. Susunan halaman dan workflow operasional dipertahankan.

Tema juga berlaku pada dialog anggota tim, login admin, konfirmasi arsip, bukti
foto, akun bersama dan notifikasi. Menu aktif kini memakai latar biru eksplisit,
agar tetap terbedakan ketika sidebar dan surface sama-sama putih.

Fitur 2.3.x tetap tersedia: satu order 1–4 karyawan dengan persentase admin,
penambahan anggota saat order berjalan, upah per penerima, dan tombol × yang
membatalkan pilihan karyawan/order/tugas secara terpisah.

Verifikasi pada source final 2.4.0:

- Release build: tidak ada warning atau error.
- 23 pemeriksaan validasi/transport tim lulus.
- 17 pemeriksaan pembatalan seleksi, 10 pemeriksaan UI tim, serta 3 pemeriksaan
  render/kontras Pearl Blue lulus.
- Lima halaman utama dirender ulang pada ukuran 1120 dan 1460 dan ditinjau;
  beberapa dialog serta popup juga dirender dengan data sintetis.
- Paket EXE diuji menggunakan `--verify-package` sebelum diserahkan.

Verifikasi API/database 99 tes berasal dari implementasi 2.3.x; tema 2.4.0 tidak
mengubah server atau migrasi SQL. Full suite sesi Windows masih membutuhkan profil
DPAPI mesin Windows normal. Jangan menafsirkan batas sandbox sebagai alasan untuk
menonaktifkan enkripsi. Status CI dan PR perlu diperiksa lagi sebelum rilis live.

Paket lanjutan ChatGPT menyertakan ringkasan, source Windows, patch server, gambar
pratinjau dan manifest/checksum. Baca `monitor-handoff-chatgpt.md` terlebih dahulu.

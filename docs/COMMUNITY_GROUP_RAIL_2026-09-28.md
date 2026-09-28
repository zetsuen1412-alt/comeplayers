# Navigasi grup dan komunitas — 28 September 2026

Sumber website: `f8c97acb`, cabang `codex/google-play-release`, PR #30.

## Hasil perubahan

- Lajur kiri menampilkan grup/komunitas yang diikuti, nama pendek yang tetap terlihat, penanda pilihan, dan jumlah pesan belum dibaca. Pintasan Pesan membuka `/chat`; tombol Buat membuka formulir komunitas yang sudah ada.
- Kolom berikutnya berisi ruang komunitas. Navigasi utama hanya Chat, Papan, dan Kegiatan. Chat menjadi tampilan awal desktop. Pada ponsel tanpa tautan percakapan tertentu, daftar ruang ditampilkan lebih dulu.
- Sidebar memakai dua baris kontrol: filter belum dibaca/pilihan dan pencarian. Kontrol admin serta deskripsi tambahan tersedia melalui Pilihan; ruang mendapat area utama.
- Papan komunitas menampilkan info komunitas dan kegiatan ComePlayers. Kegiatan adalah pengumuman ComePlayers yang sudah dipublikasikan, bukan acara khusus server yang baru dibuat.
- Identitas visual menggunakan navy, cyan, aksen kuning, nama grup, dan sudut kotak membulat. Tidak memakai logo atau aset Discord.
- Pemilihan grup membatalkan permintaan percakapan lama dan membersihkan konteks balasan/edit sebelum berpindah. Memilih grup yang sama mempertahankan ruang dan draf. Grup lama tanpa record server tetap memakai ID room yang benar.
- Find Tim, Matchmaking, dan publikasi squad tetap disembunyikan.

## Verifikasi

- TypeScript lulus. Lint tiga komponen terkait tidak memiliki error; peringatan lama pada halaman besar tetap ada.
- Delapan pengujian handler navigasi grup lulus (390, 1023, 1024, dan 1440 px, grup yang sama, grup lama, serta chat pesanan).
- Dua pengujian komponen sidebar lulus untuk pencarian/filter/pemilihan dan izin admin.
- Pemeriksaan interaksi/viewport lama dan dua pengujian race loader lulus.
- QA browser lokal memakai halaman/komponen/CSS asli dengan enam grup contoh dan transport lokal: perpindahan grup, ruang marketplace, Papan, akses ruang pada layar 320/390 px, dan susunan desktop 1280 px. Tidak ada horizontal overflow pada 320 px; target ruang setinggi 48 px.
- Fixture lokal memblokir akses produksi dan mutasi. Tidak ada pesan, panggilan, siaran, atau undangan nyata dikirim saat QA.

## Penerapan

Arsip rilis hanya berisi subtree website dari Git. Pemindaian arsip tidak menemukan dotenv, kunci privat, credential JSON, atau keystore. Proyek Vercel tetap `prj_J2lxF1Dv7PsmiWbyj9mea1hoYAl3`, root directory `website`.

Deployment `dpl_ERqC2GfybVocLwgLtdhtQS7fmA6A` berstatus READY. URL deployment: `https://evo-gaming-q3it0gecq-ilham-evogaming-s-projects.vercel.app`; alias `www.comeplayers.com` dan `comeplayers.com` aktif. Build Next.js 16.3.6, TypeScript, dan 242 halaman statis berhasil; total build Vercel 37 detik.

Pada 28 September 2026 pukul 13.01 WIB, `/api/app-version` domain utama mengembalikan ID deployment tersebut dan `/api/health/live` mengembalikan `ok: true`. Pemeriksaan runtime error 15 menit untuk route komunitas/room terkait tidak menemukan error.

QA pada domain utama dengan akun pemilik membuktikan empat grup tampil di kiri, perpindahan Seller → testing → Seller memuat ruang sesuai pilihan, dan marketplace dapat dipilih pada viewport CSS 390×844. Tidak ada horizontal overflow; target ruang 48 px. Browser kembali ke ukuran normal sesudah pemeriksaan.

Bukti tampilan desktop produksi: `tmp/community-group-rail-live.png`. Komunitas Seller dan kolom pesan siap terlihat bersama lajur empat grup.

## Batas cakupan

Tidak ada migrasi database, perubahan autentikasi/kriptografi, perubahan hak anggota, atau build Android baru. Daftar grup mengikuti hasil endpoint room yang ada (maksimum 60 room terbaru); patch ini tidak mengubah pagination keanggotaan. Navigasi memakai perilaku replaceState yang sudah ada, sehingga tombol Back browser bukan riwayat perpindahan grup.

PR tetap terbuka; tidak melewati pemeriksaan EAS yang memerlukan `EXPO_TOKEN`. Rilis Google Play internal 0.16.0 (24) sebelumnya tetap terpisah dari pembaruan website ini.

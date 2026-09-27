# Review dan peningkatan ComePlayers Community — 27 September 2026

Perubahan ini memperbaiki navigasi Community, sinkronisasi web/Android, dan beberapa kelemahan otorisasi yang ditemukan dalam kode. Status: perubahan source untuk ditinjau; belum merupakan rilis website, APK, atau installer Windows baru.

## Temuan yang diperbaiki

| Temuan sebelumnya | Perbaikan |
| --- | --- |
| Sidebar channel tidak mengikuti perubahan server secara otomatis. | Berlangganan event pesan dan pembaruan room yang sudah dipublikasikan melalui Supabase Realtime; perubahan kategori/channel/peran mengubah timestamp room untuk memicu pembacaan ulang. |
| Permintaan saat berpindah channel dapat selesai terlambat dan menimpa tampilan terbaru. | Batalkan request percakapan/sidebar lama dan abaikan respons setelah pembatalan. |
| Pembacaan berulang dapat bertumpuk pada koneksi lambat atau berjalan ketika tab tidak aktif. | Gabungkan event yang berdekatan, serialkan polling presence/typing, dan hentikan pembacaan berkala ketika tersembunyi/offline. Sinkronkan kembali ketika aktif/online. |
| Peran kosong atau yang dicabut memperoleh kembali izin bawaan berdasarkan peran lama. | Hapus fallback izin tersebut. Kegagalan pembacaan keanggotaan, larangan, atau peran menolak akses. |
| Bootstrap community memakai service role sebelum memastikan keanggotaan pemanggil. | Periksa akses room sebelum bootstrap menulis data. |
| Penerimaan anggota baru dapat memberi ulang peran yang dicabut dari anggota lama. | Untuk community yang sudah ada, bootstrap hanya memberi peran kepada anggota yang baru diterima dan mempertahankan metadata community. |
| API pengiriman pesan hanya memeriksa peran, sehingga dapat mengabaikan penolakan khusus channel. | Gunakan RPC kebijakan pengiriman database yang sudah ada, termasuk aturan allow/deny channel. |
| Pengelola peran dapat membuat peran dengan izin di atas izinnya sendiri. | Validasi nama izin dan batasi izin yang boleh diberikan ke izin yang dimiliki pengelola. |
| Mulai streaming belum memeriksa izin community `start_stream`. | Periksa izin sebelum memulai stream. |
| Presence dapat mengungkap ID channel privat; read states dapat mencakup channel di luar bundle. | Hilangkan lokasi channel dari respons presence, verifikasi akses channel saat heartbeat, dan saring read states sesuai channel yang terlihat. |
| Error presence/typing dapat mengekspos detail backend. | Gunakan pesan error API yang disanitasi. |
| Dependency website memiliki 1 critical, 4 high, dan 1 moderate pada audit produksi. | Perbarui Next.js dan konfigurasi lint ke 16.3.6 serta dependency transitif yang terkait; audit produksi menjadi 0 temuan pada pemeriksaan ini. |

## Fitur dan kenyamanan

Web Community mendapat pencarian nama/topik channel, filter channel belum dibaca, kategori yang dapat dilipat, pilihan menampilkan topik, indikator pesan belum dibaca, status koneksi, waktu sinkronisasi, dan tombol mencoba ulang. Jumlah peserta voice yang ditampilkan berasal dari koneksi voice aktif.

Pemilik/pengelola channel mendapat dialog untuk membuat kategori serta membuat/mengedit channel: nama, topik, kategori, tipe text/voice/announcement saat pembuatan, akses privat, dan mode baca saja. Dialog mendukung fokus keyboard, Escape, validasi, indikator penyimpanan, serta pencegahan submit ganda. Anggota tanpa izin tidak mendapat kontrol pengelolaan.

Android Community mendapat pencarian server, filter belum dibaca, pull-to-refresh, pemulihan saat aplikasi aktif kembali, indikator sinkronisasi dan retry, pembaruan daftar voice, serta teks dan target sentuh yang lebih mudah digunakan. Respons dari akun sebelumnya tidak boleh mengganti hasil akun yang baru masuk. Desktop Tauri memakai website sehingga perubahan web berlaku setelah website baru diterbitkan; tidak ada installer baru dalam perubahan ini.

Pengaturan tampilan sidebar bersifat lokal selama komponen terbuka. Preferensi notifikasi lintas perangkat, UI pengelolaan override per anggota/peran, arsip channel berisi pesan, dan alur moderasi lengkap belum ditambahkan dalam perubahan ini.

## Pemeriksaan dan bukti

| Pemeriksaan | Hasil |
| --- | --- |
| `website: npm run check` | Lulus: TypeScript aplikasi dan E2E, lint tanpa error, 711 tes. Masih ada 311 warning lint di repository. |
| `website: npm run build` | Lulus dengan Next.js 16.3.6. |
| `comeplayers-apps: npm run typecheck` | Lulus untuk workspace chat-core, mobile, desktop. |
| `node --test tests/recoveryBackup.test.mjs tests/recoveryStorage.test.mjs` | 22 tes lulus. |
| `node tests/community-navigation.browser.mjs` | 13 pemeriksaan Chromium lulus: pencarian, unread, kategori, edit/create, event realtime, offline/retry, layout 390 px, Escape, pembatasan kontrol anggota, tanpa page error. |
| `npm run test:e2e:smoke -- --workers=2 --reporter=line` | 4 tes lulus terhadap server lokal: halaman utama, health, pencarian publik, API admin menolak anonim. |
| `npm audit --omit=dev --json` | Website: 0 temuan. Workspace aplikasi: 0 critical/high, 14 laporan moderate. |

Tes akses baru menjalankan fungsi produksi dengan database double untuk kegagalan izin, larangan, peran kosong, aturan kirim channel, bootstrap, dan pemberian izin. Tes browser Community merender komponen produksi dengan API dan event realtime simulasi; ini tidak membuktikan pengiriman dua akun melalui server produksi. Screenshot memakai data sintetis, bukan pesan pengguna.

Pemeriksaan Supabase dilakukan hanya baca. Tabel `chat_rooms` dan `chat_messages` yang diperiksa sudah memiliki RLS dan publikasi realtime; tabel metadata community yang diperiksa belum dipublikasikan. Karena itu implementasi memakai event room yang sudah tersedia dan fallback pembacaan, tanpa meminta publikasi tabel privat baru. Undangan tetap memakai pembacaan berkala.

Pembaruan lint Next.js juga memerlukan perbaikan kecil: generasi kebijakan E2EE yang dipakai saat render disimpan dalam state; JSX tabel payroll disusun langsung; variabel lokal dua test harness tidak memakai nama `module`. Tidak ada perubahan protokol enkripsi, perhitungan payroll, atau aktivasi sesi satu perangkat.

- [Tampilan desktop](verification/2026-09-27/community-desktop.png)
- [Navigasi pada layar kecil](verification/2026-09-27/community-mobile.png)
- [Dialog pengaturan channel](verification/2026-09-27/community-channel-settings.png)
- [Ringkasan hasil terstruktur](verification/2026-09-27/community-review-results.json)

## Hal yang masih perlu ditangani

1. **Konfigurasi database.** Supabase Advisor melaporkan 5 fungsi dengan `search_path` mutable, 1 extension di schema publik, 64 peringatan fungsi security-definer yang dapat dipanggil anon, 69 yang dapat dipanggil authenticated, serta perlindungan password bocor yang belum aktif. Angka tersebut adalah peringatan konfigurasi, bukan bukti eksploitasi. Audit isi fungsi dan pemanggilnya sebelum mencabut grant; banyak endpoint bergantung pada RPC. Informasi 81 tabel RLS tanpa policy juga perlu diklasifikasi: tabel API/service-role memang dapat sengaja menolak akses klien langsung.
2. **Dependency aplikasi.** Sisa 14 laporan moderate berasal dari rantai Expo/Xcode yang menggunakan `uuid` lama. Advisory terkait optional buffer pada UUID v3/v5/v6; pemanggilan `xcode/lib/pbxProject.js` yang diperiksa menggunakan v4. Tetap perlu pembaruan upstream dan audit ulang. Solusi otomatis npm menyarankan penurunan Expo 57 ke 46, sehingga tidak diterapkan. Ini bukan jaminan seluruh pemakaian dependency bebas risiko.
3. **Validasi rilis.** Uji dua akun di staging untuk perubahan channel, peran, pengiriman pesan, reconnect, undangan, dan voice. Uji Android di perangkat nyata lalu bangun APK; uji aplikasi Windows terhadap deployment kandidat. Belum ada pengukuran p95 produksi atau uji beban sehingga tidak ada klaim angka percepatan.
4. **Cakupan keamanan.** Pemeriksaan ini terfokus pada Community dan jalur yang diubah. Ini bukan audit independen seluruh marketplace, pembayaran, enkripsi, atau infrastruktur. Rencana UI pengelolaan izin yang lebih lengkap harus didukung pengujian kebijakan database sebelum dirilis.

## Rilis dan pemulihan

Perubahan ini tidak membawa migrasi database dan tidak mengaktifkan `SINGLE_DEVICE_SESSIONS_ENABLED`. Setelah review, terbitkan website dari commit yang diuji, lakukan smoke test terautentikasi, kemudian buat rilis Android. Jika bermasalah, pulihkan deployment website sebelumnya dan tahan distribusi APK baru. Hindari mengaktifkan ulang versi dependency rentan tanpa mempertimbangkan patch keamanan pengganti.

Referensi: [rilis Next.js 16.3.6](https://github.com/vercel/next.js/releases/tag/v16.3.6), [advisory Next.js](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36), [advisory UUID](https://github.com/uuidjs/uuid/security/advisories/GHSA-w5hq-g745-h8pq), [Supabase database linter](https://supabase.com/docs/guides/database/database-linter), [perlindungan password bocor](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

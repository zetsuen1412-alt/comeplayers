# ComePlayers — Lowongan & Otomatisasi Facebook v1

Tanggal: 1 Oktober 2026. Implementasi untuk ditinjau dan diuji staging; bukan bukti deployment atau pengiriman Facebook nyata.

## Ruang lingkup

Menu `/admin/lowongan`: materi/banner, tujuan Facebook, nomor WhatsApp, jawaban FAQ, START/JEDA/STOP, dan riwayat pengiriman. Tautan WhatsApp ditambahkan pada publikasi dan balasan. Tidak ada formulir lamaran, database pelamar, karyawan, payroll, seleksi, atau pengiriman otomatis WhatsApp. Semua data konfigurasi awal kosong/nonaktif. Nomor WhatsApp tidak ditebak dari proyek lain.

V1 mengelola satu kampanye aktif dan satu Facebook Page. Dashboard dan ekstensi memakai sesi admin ComePlayers dan tab Facebook yang sudah login; token Facebook hanya berada di server. Token Supabase/cookie Facebook tidak dikirim ke ekstensi.

## Apa yang ditulis

- Dashboard Bahasa Indonesia, unggah PNG/JPG/WebP maksimal 2 MB, pratinjau, FAQ berbasis aturan, tautan WhatsApp, riwayat 60 tugas terakhir.
- API admin memeriksa `requireAdmin` pada setiap permintaan, termasuk banner dan tindakan browser. Migrasi menambahkan lima tabel `cp_loker_*` dengan RLS dan RPC terbatas service role. Revisi optimistis mencegah tab lama menimpa konfigurasi baru.
- Worker Page: publikasi teks/banner, balasan komentar pada postingan lowongan yang dibuat kampanye ini, balasan Messenger Page lewat webhook bertanda tangan. Tidak menyediakan bot Messenger akun pribadi.
- Penghubung grup: ekstensi Chrome/Edge MV3, antrean grup terpilih, posting, pemindaian terbatas postingan pencari kerja, komentar utama yang relevan, navigasi berikutnya. Ini integrasi DOM eksperimental, bukan Groups API resmi.
- Verifikasi browser memuat ulang halaman dan memeriksa teks muncul lagi sebelum status `sent`. `pending` digunakan saat Facebook menampilkan persetujuan admin. Hasil ambigu mengganti status menjadi `uncertain`, menjeda kampanye, dan tidak mencoba kirim ulang.

**Belum dibuktikan pada akun Facebook nyata.** Pengujian DOM sintetis tidak membuktikan bahwa selector cocok untuk semua bahasa/layout Facebook, lampiran benar-benar diterima Facebook, atau izin Meta telah diberikan. Kiriman dan komentar grup perlu uji terkontrol satu tujuan terlebih dahulu.

## Pemasangan pada proyek asli

1. Terapkan perubahan pada branch integrasi, bukan menimpa seluruh proyek dengan ZIP. Hanya satu baris menu ditambahkan pada `website/components/admin/adminNavigation.ts`; jika file itu berubah, gabungkan baris menu saja.
2. Di `website/`, pertahankan lockfile dan dependency proyek. Jalankan `npm ci`, baca panduan Next terpasang sesuai AGENTS.md, `npm run typecheck`, `npx tsx --test tests/loker-automation.test.ts`, dan `npm run build`. Build penuh belum dijalankan di lingkungan penulis karena dependency/internet tidak tersedia.
3. Uji SQL `supabase/migrations/20261001093000_loker_automation.sql` di database staging: anon/user biasa harus ditolak; START/JEDA/STOP, revisi konflik, dua worker bersamaan, lease kedaluwarsa, serta preflight yang dipanggil dua kali harus diuji. Pemeriksaan SQL yang sudah dijalankan baru pemeriksaan statis, bukan eksekusi PostgreSQL.
4. Terapkan hanya migrasi baru ini setelah persetujuan operator. Jangan menjalankan semua migrasi tertunda; migrasi single-device-session/E2EE tidak termasuk pekerjaan ini. Tidak ada migrasi produksi yang dijalankan dalam implementasi ini.
5. Konfigurasi environment dari `LOKER_FACEBOOK.env.example` di penyedia deployment secara privat. Jangan menempelkan token/secret ke chat, source, browser, atau parameter URL. Pertahankan `LOKER_AUTOMATION_ENABLED=false` selama pemasangan.
6. Untuk Page, daftarkan callback `/api/webhooks/loker-facebook`, verification token yang sama, Page subscriptions untuk `messages`, `message_echoes` dan `feed` sesuai izin aplikasi. Izin yang diperlukan umumnya `pages_manage_posts`, `pages_read_engagement`, `pages_manage_engagement`, `pages_manage_metadata`, `pages_messaging`; verifikasi kembali di dokumentasi/dashboard Meta untuk penggunaan aplikasi tersebut. Uji identitas Page di dashboard hanya membuktikan ID cocok, bukan semua izin telah disetujui. Versi Graph harus diisi dengan versi yang didukung aplikasi.
7. Jadwalkan GET `/api/cron/lowongan` setiap menit dengan header `Authorization: Bearer <LOKER_CRON_SECRET>` memakai penjadwal server yang sudah disetujui. Tidak ada penjadwal produksi yang dibuat di patch ini. `after()` juga menjalankan antrean setelah webhook/START dan dashboard melakukan tick selama terbuka. Cron dibutuhkan untuk pemulihan dan pembersihan payload ketika dashboard ditutup. Jika memakai Vercel Cron yang mengirim `CRON_SECRET`, samakan nilainya dengan `LOKER_CRON_SECRET`; jangan menganggap penjadwal sudah terpasang.
8. Muat ekstensi folder `tools/comeplayers-loker-extension` melalui Load unpacked pada Chrome/Edge. Buka tab grup Facebook yang sudah login, tekan ikon ekstensi → Hubungkan tab Facebook ini. Buka ulang `/admin/lowongan` setelah memasang ekstensi. Untuk pengujian lokal, origin yang disediakan hanya `http://localhost:3000`.
9. Isi materi/nomor WhatsApp dan satu grup uji yang mengizinkan lowongan. Pilih hanya aktivitas yang diuji, simpan, aktifkan switch server setelah konfigurasi selesai, lalu START secara sadar. Konfirmasi hasil langsung pada Facebook sebelum memperluas tujuan.

## Perilaku operasional

Setiap tujuan grup/Page diposting satu kali per versi konfigurasi, bukan berulang tanpa batas. Perubahan pengaturan membuat versi kampanye baru: START setelah perubahan dapat mempublikasikan ulang. START tanpa perubahan melanjutkan antrean dan mempertahankan deduplikasi. Interval 30–1440 menit mengatur pemeriksaan postingan pencari kerja, bukan interval seluruh aksi. Maksimal tiga kandidat per scan, 30 grup, dan batas 1–50 aksi kirim per hari UTC; batas ini bukan jaminan bebas pembatasan akun.

Jalur grup memerlukan PC aktif, browser, tab Facebook dan dashboard ComePlayers tetap terbuka. Jangan memakai tab Facebook yang dipilih untuk aktivitas lain selama bot berjalan. STOP pada dashboard menghentikan pengiriman berikutnya, bukan membatalkan kiriman yang sudah diterima Facebook. STOP pada popup hanya menghentikan browser; worker Page dihentikan dari dashboard/switch server. Tidak ada bypass login, CAPTCHA, pembatasan, atau mekanisme anti-deteksi.

Jalur Page dapat berjalan melalui server/webhook setelah koneksi benar. Messenger hanya membalas pesan masuk terkait lowongan atau kelanjutan percakapan rekrutmen, dengan batas konservatif 23 jam dari pesan masuk. Pesan STOP disimpan sebagai opt-out satu arah. Balasan manual admin menjeda bot 24 jam untuk percakapan itu; permintaan bicara dengan admin mendapat pengarah WhatsApp lalu dijeda. Bot tidak mengarang gaji atau menjanjikan diterima bekerja.

## Privasi dan penghentian

Tidak menyimpan nama/CV/KTP atau isi pesan masuk sebagai profil pelamar. Antrean operasional menyimpan ID tujuan, status, teks balasan keluar, dan waktu. ID penerima Messenger dienkripsi AES-256-GCM selama antrean berlangsung dan payload dihapus setelah terminal/expired; hash ID digunakan untuk deduplikasi dan STOP. Ini data teknis minimal, bukan klaim bahwa sistem tidak menyimpan data apa pun. Kunci privasi harus dipertahankan; jangan merotasinya tanpa strategi migrasi opt-out. Pembersihan kedaluwarsa memerlukan worker/cron tetap berjalan. Banner dan log tidak dipangkas otomatis di v1; operator perlu kebijakan retensi sebelum penggunaan besar.

Untuk pemulihan: STOP, periksa tugas `uncertain` di Facebook, jangan ubah menjadi berhasil tanpa bukti. Popup mempunyai kontrol hapus penanda tugas terputus setelah pemeriksaan. Tidak ada retry buta. Jika hasil DB setelah kirim tidak diketahui, stale lease menjeda sistem setelah worker berikutnya memeriksa.

## Verifikasi yang benar-benar dijalankan

- 30 unit/security/aturan/static-SQL tests lulus menggunakan Node 22 dan hook transpile TypeScript lokal. Graph fetch menggunakan mock; tidak mengirim pesan nyata.
- 7 pengujian DOM sintetis ekstensi lulus di Chromium lokal (about:blank, URL Facebook dimock di salinan skrip uji, tanpa navigasi/jaringan Facebook). Script uji ada di folder ekstensi `tests/`.
- TypeScript strict pada `model.ts` dan `security.ts` lulus; syntax transpile sumber TS/TSX dan `node --check` skrip ekstensi diperiksa. Ini bukan typecheck atau build keseluruhan Next.js.
- Belum: eksekusi migrasi PostgreSQL, build/typecheck penuh dengan dependency terkunci, uji UI aplikasi lengkap, autentikasi admin nyata, pemasangan MV3 di akun pengguna, API Meta nyata, attachment nyata, deployment produksi.

## Referensi implementasi

- Groups API dihentikan: https://developers.facebook.com/blog/post/2024/01/23/introducing-facebook-graph-and-marketing-api-v19/
- Messenger messaging window/RESPONSE: https://developers.facebook.com/documentation/business-messaging/messenger-platform/send-messages
- Webhook signatures: https://developers.facebook.com/documentation/business-messaging/messenger-platform/webhooks
- Next route handlers: https://nextjs.org/docs/app/getting-started/route-handlers
- Lifecycle extension worker: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle

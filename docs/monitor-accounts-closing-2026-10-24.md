# Monitor: akun, kendali order, dan Tutup Buku

## Alur penggunaan

Windows 2.0.0 dan Android 1.7.0 memakai username dan password ComePlayers.
Email akun lama tetap diterima. Admin menggunakan role admin yang sudah ada.
Admin menghubungkan setiap akun karyawan ke satu identitas FH3 pada menu
**Kelola Order → Akun Karyawan**. Akun baru membutuhkan username, email pemilik,
dan password minimal 12 karakter. Akun yang sudah ada cukup dihubungkan.
Email dapat dipakai untuk pemulihan password melalui website.

Karyawan mendapat roster dirinya, dapat mengambil order untuk dirinya, mengirim
TAKE/START/DONE dan melihat pekerjaan serta Data Tutup Buku miliknya. Admin dapat
mengoperasikan seluruh karyawan dan mengelola akun. Hak akses diperiksa kembali
oleh server pada setiap permintaan. Menonaktifkan binding akun mencabut akses
Monitor tanpa memberikan atau mengubah izin Payroll Website.

Admin dapat mengubah status menjadi **Refund**, **Bermasalah**, atau **Normal**,
memindahkan pekerja, menghapus order dari listing/pekerjaan selesai, memulihkan
arsip, dan mengisi upah. Perubahan memerlukan alasan dan versi order yang masih
sesuai. Refund, Bermasalah dan arsip memblokir TAKE/START/DONE berikutnya.
Pengiriman Telegram berstatus sending/unknown harus direkonsiliasi dahulu.

Hapus menyembunyikan order sebagai arsip yang dapat dipulihkan. Receipt asli,
riwayat dan Data Tutup Buku dipertahankan. Repost Telegram tidak menghapus
keputusan arsip admin. Pada pemindahan order aktif, laporan TAKE/START sebelumnya
disalin utuh ke audit sebelum siklus pengiriman aktif diganti. Pekerja baru
memulai TAKE/START kembali. Pada order yang sudah DONE, bukti asli tetap utuh;
penerima upah dapat diganti sebelum Tutup Buku.

## Upah bersih dan Tutup Buku

Upah adalah rupiah utuh untuk karyawan, 0–1.000.000.000 per order. Upah hanya
dapat diisi setelah DONE Monitor mendapat konfirmasi Telegram. Tidak ada
perhitungan dua minggu atau persentase bagi hasil dalam buku Monitor ini.

Admin meninjau daftar order dan jumlah upah, memberi judul, lalu **Tutup Buku**.
Hanya order DONE yang sudah dihargai, berstatus Normal, belum diarsipkan, dan
belum pernah ditutup yang masuk. Server memeriksa ulang referensi, versi dan
nilai persis seperti daftar konfirmasi. Daftar yang berubah harus ditinjau ulang.
ID permintaan dan referensi order unik mencegah penutupan ganda.

Data Tutup Buku menyimpan penerima, nama, order, upah, waktu DONE, game, Discord
dan TASK sebagai snapshot. Upah dan penerima order yang sudah ditutup dikunci.
Arsip atau perubahan status setelah Tutup Buku tidak menulis ulang penghasilan
yang sudah dibukukan. Data ini adalah catatan penghasilan; pembayaran tetap
merupakan proses terpisah.

Tabel buku Monitor terpisah dari Payroll Website. Migrasi dan kendali admin
baru tidak menulis ulang payload Payroll, gaji, karyawan atau Closing lama.
Penugasan order yang sudah tercatat di Payroll tetap memakai alur assignment
lama; penilaian/Tutup Buku Monitor tidak otomatis membuat penjualan Payroll.
Semua order tetap harus bersumber dari akun admin Telegram yang sudah dipin
di grup FH3. Sinkronisasi masuk dari Google Sheets tetap dinonaktifkan.

## Notifikasi order baru

Windows memeriksa antrean setiap sekitar 30 detik selama aplikasi berjalan,
termasuk saat diminimalkan. Notifikasi tray dan teks dalam aplikasi menampilkan
referensi order. Suara **SAYA AKAN LAWAN!!** dibacakan oleh SAPI perangkat;
suara Indonesia dipilih bila tersedia. Bunyi sistem menjadi cadangan bila
pembaca suara tidak tersedia. Suara dapat dimatikan dari Pengaturan.

Android menawarkan notifikasi setelah login. Android 13+ membutuhkan izin
notifikasi. Pengaturan dapat menyalakan/mematikan pemantauan dan suara.
Pemantauan latar belakang memakai foreground service dengan notifikasi tetap,
memeriksa antrean sekitar 30 detik, dan membacakan frasa dengan TextToSpeech.
Pemantauan berhenti saat logout atau dimatikan. Force stop, pembatasan baterai,
izin notifikasi dan koneksi perangkat dapat membatasi penerimaan notifikasi.

Kedua aplikasi menyimpan referensi yang pernah dilihat per akun. Pemakaian
pertama membentuk baseline diam; order baru berikutnya mengingatkan satu kali.
Mengambil/mengembalikan order yang sama atau restart tidak membunyikannya lagi.
TTS memakai suara perangkat. Pengujian otomatis mencakup deduplikasi; pengujian
audio, tray, izin dan latar belakang pada perangkat fisik tetap diperlukan.

## Paket Android dan penandatanganan

Pengguna menyetujui pemasangan berdampingan karena kunci APK lama tidak tersedia.
Application ID baru: `id.comeplayers.boostmonitor.fh3.accounts`. APK lama dan
SQLite/Keystore lamanya tetap berada di paket lama; data lokal tidak disalin atau
dihapus otomatis. Paket baru meminta login. Riwayat server tetap tersedia.

Rilis main memakai keystore tetap melalui `MONITOR_ANDROID_KEYSTORE_BASE64`
dan `MONITOR_ANDROID_STORE_PASSWORD` di GitHub Actions. Main menolak publikasi
bila kedua secret belum tersedia. Kunci disiapkan secara lokal di luar checkout,
dengan password dilindungi DPAPI; kunci/password tidak masuk Git atau dokumen ini.
CI PR memakai APK debug untuk pemeriksaan build. Paket publik main adalah release
bertanda tangan tetap. Pemeriksaan sertifikat menolak pergantian kunci pada
application ID yang sama.

Workflow Android dan Windows mengantri publikasi agar commit biner tidak
bertabrakan. Android juga mengambil main terbaru dan menolak sumber yang sudah
berubah sebelum menyalin APK. Tautan publik tetap satu Android, satu EXE dan satu
ZIP. Paket produksi tidak diganti oleh branch PR.

## Penerapan dan verifikasi

Penerapan memerlukan persetujuan pengguna untuk PR, secret penandatanganan dan
migrasi `20261024034347_fh3_monitor_accounts_closing.sql`. Sebelum migrasi,
ambil snapshot Payroll dan receipt/job/delivery untuk pembandingan. Migrasi
bersifat tambahan: enam tabel baru dengan RLS dan akses tabel yang dibatasi;
RPC service-only memeriksa aktor serta mengunci transaksi. Arsip Tutup Buku
tidak memberikan UPDATE/DELETE/TRUNCATE ke service_role.

Setelah persetujuan: konfigurasikan secret kunci rilis, terapkan migrasi, merge,
periksa deployment API, lalu verifikasi hash/sertifikat dan tautan paket hasil CI.
Jangan memakai order pelanggan atau mengirim laporan Telegram palsu untuk uji.

Tes lokal mencakup penolakan aktor/karyawan lain, pencabutan akses, transfer
laporan lama, status/arsip, stale version, nominal yang berubah, penutupan
idempotent, pembekuan snapshot, privilege/RLS dan kesamaan seluruh payload
Payroll sebelum/sesudah alur Telegram-only. Tes API memeriksa isolasi penghasilan,
login username, pembatasan percobaan, dan penolakan token sebelum otorisasi.
Pratinjau Windows memakai data contoh dan tidak terhubung ke Telegram.

# Penugasan Telegram melalui CP Boost Monitor (FH3)

## Alur
1. Order **Boosting/Item** FH3 yang baru dibuat di Payroll (manual / Sheet) diproses oleh trigger Telegram yang sudah ada.
2. Ketika order masih berstatus `waiting`, admin dapat membuka **Order Baru** di CP Boost Monitor Android untuk melihat Order, nama pesanan, Game, Buyer, dan TASK.
3. Admin memilih satu karyawan FH3 aktif melalui dialog konfirmasi. **Satu karyawan aktif per order** sesuai unique active assignment di Telegram Payroll.
4. `POST /api/admin/payroll/mobile/assign` menggunakan akun Payroll admin yang sedang login. RPC `cp_mobile_assign_fh3` mengunci workspace/order, menolak order yang sudah mulai, mencatat histori audit aktor, dan menulis karyawan ke workspace Payroll serta assignment Telegram **dalam satu transaksi**.
5. Website Pesanan/Mutasi melihat revisi dan penugasan baru. Order keluar dari antrean Android setelah refresh, tugas tampil pada kartu karyawan pada sinkronisasi berikutnya. Bot memperbarui **pesan order Telegram yang sama** lewat outbox dan cron yang sudah ada.

## Endpoint
- `GET /api/admin/payroll/mobile/pending`: khusus website admin, scope FH3, hanya order Boosting/Item `waiting`, tanpa uang, token Telegram, atau spreadsheet.
- `POST /api/admin/payroll/mobile/assign`: khusus admin, JSON `{"orderRef":"X1234","employeeCode":"EMP001"}`. Server mengambil actor ID dari token login, tidak dari payload. Balasan konflik 409 meminta reload bila order sudah diambil orang lain.
- Keduanya memerlukan autentikasi yang sama dengan aplikasi Payroll dan memakai `Cache-Control: no-store`.

## Keamanan dan batasan
- Tidak ada service role, token bot, atau password di APK. API server memeriksa akses admin untuk setiap permintaan.
- Aplikasi **tidak** mengedit status kerja Payroll melalui fitur lokal Ready / Farming / Tidur / Sedang Bekerja.
- **Bukan push real-time**: ketika aplikasi aktif sinkronisasi ±2 menit, atau tombol refresh. Assignment tersimpan segera setelah server menerima request; kartu Telegram diperbarui oleh outbox worker.
- Penugasan melalui Android saat ini hanya order baru FH3 jenis Boosting/Item dan **satu karyawan**. Gold, multiple active workers, penggantian karyawan yang sedang mengerjakan, serta FH1/FH2 memerlukan perluasan workflow terpisah.
- Order berstatus started/paused/done/verified, ditutup, dibatalkan, atau diarsipkan tidak dapat ditugaskan melalui Android.
- Perubahan website dan Android harus dideploy bersama migrasi `20261019220000_cp_boost_monitor_mobile_assignment.sql`. Jangan aktifkan tombol Android sebelum migrasi sukses.
- Build ulang APK Android dan periksa signing/signature sebelum distribusi. File `website/public/downloads/cp-boost-monitor.apk` dalam repository tidak otomatis berubah hanya karena source Java berubah.

## Uji sebelum produksi
1. Jalankan migrasi pada database staging, lalu tes route dan uji simultan dua admin pada order yang sama.
2. Pastikan user payroll non-admin ditolak (403), request tanpa sesi ditolak (401), dan konflik menghasilkan 409.
3. Buat satu order Boosting FH3 `waiting`; pilih pekerja dari APK lalu periksa `cp_payroll_telegram_assignments`, `cp_mobile_assignment_audit`, dan tampilan Pesanan/Mutasi.
4. Pastikan satu pesan Telegram di-update (bukan muncul pesan order ganda) setelah cron berjalan.
5. Verifikasi bahwa status lokal karyawan dan riwayat SQLite tidak hilang, serta tugas karyawan muncul setelah sync.
6. Uji item, order diarsipkan, resign, assignment bersamaan, logout/token kedaluwarsa, dan koneksi internet putus.

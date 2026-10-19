# Integrasi CP Boost Monitor Android ↔ Payroll Website (FH3)

## Arsitektur tanpa Telegram
- Payroll Website (Supabase `cp_payroll_workspace`) merupakan sumber tunggal karyawan, order baru, dan penugasan karyawan.
- `POST /api/admin/payroll/mobile/session` login/refresh akun payroll berizin.
- `GET /api/admin/payroll/mobile/roster` mengirim hanya identitas karyawan FH3 dan status aktif.
- `GET /api/admin/payroll/mobile/pending` mengirim daftar order Boosting/Item FH3 yang belum ditugaskan, tidak menyertakan nilai uang atau detail privat.
- `POST /api/admin/payroll/mobile/assign` khusus admin, menugaskan satu karyawan langsung pada order Payroll melalui transaksi terproteksi serta audit pelaku.
- `GET /api/admin/payroll/mobile/tasks` mengirim ringkasan tugas aktif langsung dari `workerAssignments` order Payroll.
- Tidak ada proses Telegram, Telegram ID, token bot, atau tabel Telegram pada ketiga API roster/pending/assign/tasks.

## Keamanan dan penyimpanan
Semua API memvalidasi sesi & izin Payroll; aksi penugasan hanya untuk role admin. Access/refresh token disimpan terenkripsi dalam Android Keystore. Jangan menanam Supabase service-role key atau token bot dalam APK. Tidak ada payroll amounts, gaji, kasbon, dan spreadsheet mentah yang dibuka untuk Android.

## Perilaku dan deployment
Tab Order Baru memeriksa ulang setiap ±30 detik saat terlihat. Roster/tugas diperbarui ketika app dibuka, tiap ±2 menit ketika aktif, dan manual. Penugasan segera disimpan di website setelah API sukses. Ini polling, bukan push notification Android.

Server menolak assignment jika order telah ditugaskan, selesai, dibatalkan, ditutup, diarsipkan, perlu review, atau bersifat harian; dan menolak pekerja tidak aktif. Karyawan lain dalam divisi selain FH3 tidak ditampilkan. Status boosting dan historinya di SQLite tidak disinkronkan balik ke Payroll.

Migrasi `20261019220000_cp_boost_monitor_mobile_assignment.sql` dan `20261019220001_cp_boost_monitor_direct_fh3_routing.sql` diperlukan sebelum APK 1.4.0. Routing FH3 Boosting/Item baru melewati Telegram; divisi lain/Gold serta pekerjaan Telegram lama yang sudah dimulai tetap aman. Detail: [panduan CP Boost Monitor langsung](../../../docs/cp-boost-monitor-telegram-assignment.md).

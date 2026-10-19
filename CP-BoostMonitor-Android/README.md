# CP Boost Monitor Android v1.4 — FH3

Aplikasi memantau status lokal (Ready Boosting, Farming, Tidur, Bekerja) serta menerima **order baru langsung dari Payroll Website**. Tidak memerlukan bot Telegram untuk menerima atau menugaskan order.

## Sinkronisasi
- Login menggunakan akun ComePlayers yang memiliki izin Payroll.
- Roster karyawan FH3 dibaca dari menu Payroll → Karyawan di website (GET /mobile/roster).
- Tugas aktif karyawan dibaca langsung dari order Payroll Website (GET /mobile/tasks), tanpa tabel Telegram.
- Order Boosting/Item FH3 yang belum memiliki karyawan muncul di tab **Order Baru** (GET /mobile/pending). Khusus admin dapat memilih pekerja untuk menyimpan assignment (POST /mobile/assign).
- Daftar order refresh sekitar setiap 30 detik selama aplikasi aktif, dengan jumlah order baru terlihat pada Dashboard. Roster dan tugas disinkronkan ketika aplikasi aktif setiap sekitar 2 menit atau melalui tombol refresh.
- Order yang ditugaskan melalui APK tersimpan ke website dan muncul di kartu karyawan setelah sinkronisasi.
- Status Ready/Farming/Tidur/Bekerja beserta historinya tetap di SQLite perangkat. Tidak ada perubahan gaji, kasbon, atau status Payroll dari tombol status lokal.

## Keamanan
Token sesi disimpan menggunakan Android Keystore. Token bot Telegram dan Supabase service role tidak ada di aplikasi; server memeriksa izin Payroll admin sebelum setiap penugasan.

## Instalasi
Unduh APK dari menu [APK Karyawan](https://www.comeplayers.com/admin/payroll/boost-monitor) **setelah** migrasi backend dan deployment versi baru selesai. GitHub Actions membangun APK debug, tetapi update pada branch PR belum otomatis memperbarui APK yang tersedia di website produksi.

Detail backend dan batasan: [Panduan direct mobile assignment](../docs/cp-boost-monitor-telegram-assignment.md).

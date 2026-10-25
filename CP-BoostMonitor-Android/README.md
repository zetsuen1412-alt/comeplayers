# EVOGAMING Monitor Android v1.7.1 — FH3

Current behavior: [Accounts, admin controls, net wages, Tutup Buku and notifications](../docs/monitor-accounts-closing-2026-10-24.md).
The v1.7 package `id.comeplayers.boostmonitor.fh3.accounts` installs alongside
older apps and preserves them. Main releases use a persistent signing key;
PR debug artifacts are for branch testing. Username login and employee bindings
are enforced by the server. Earnings are saved through explicit Tutup Buku.

TAKE terkonfirmasi otomatis mengubah Ready Boosting/Farming ke **Sedang Bekerja**.
Refresh tugas aktif juga mengenali TAKE dari perangkat lain. Tidur manual tetap
dipertahankan; TAKE yang belum pasti tidak mengubah status. Riwayat otomatis
disimpan di SQLite perangkat. Sesudah DONE, perubahan ke Ready tetap manual.
Pembaruan 1.7.1 memakai package dan sertifikat yang sama dengan 1.7.0, sehingga
dapat dipasang sebagai update tanpa menghapus data. [Panduan status otomatis](../docs/monitor-auto-work-2026-10-25.md).

## Historical v1.6 / v1.5 notes

Current behavior: [Telegram + Payroll guide](../docs/monitor-telegram-payroll-2026-10-22.md).
Orders/TASK come only from @evogamings in the verified FH3 group. TAKE is followed
by screenshot START/DONE, with safe delivery states and no automatic resend.
Unpriced work is recorded separately without creating a financial sale. Payroll
shows verified earnings and paged work history for every employee after login
with Payroll access. This new package installs alongside 1.5 and preserves it.

The earlier v1.5 notes below are historical; the current guide supersedes their
old Payroll-only source and description of missing income data.

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


## Bukti screenshot ke grup Telegram FH3 (v1.5)
- Setelah memilih karyawan pada menu **Order Baru**, tekan **START + Foto** untuk memilih screenshot awal dari galeri.
- Pada menu **Tugas**, setiap order assigned memiliki tombol **▶ START + Screenshot**, dan order in_progress memiliki tombol **✅ DONE + Screenshot**.
- Pesan foto dikirim otomatis dari backend Payroll ke **grup Telegram FH3 yang dikonfigurasi admin**. Caption contoh: `x4671/mulyana/start` dan `x4671/mulyana/done`.
- Nama pekerja yang tampil pada caption berasal dari roster website; user tidak dapat menuliskan nama/Chat ID palsu.
- Setelah Telegram sukses, status order di website berubah menjadi `in_progress` (START) atau `completed` (DONE). Gaji/verification tidak langsung berubah.
- File PNG/JPEG maksimum 7 MB. Saat koneksi tidak pasti, **cek grup Telegram sebelum mencoba lagi**.
- Fitur membutuhkan website API `/mobile/progress`, konfigurasi grup dan bot Telegram di server, serta migration `20261019220002_cp_boost_monitor_mobile_telegram_proof.sql`. APK bukan klien Telegram dan tidak menyimpan bot token. Tidak perlu aplikasi Telegram pada HP untuk upload.

## Grup tujuan yang wajib dipilih admin
Grup bukti screenshot FH3: **🔥 EVO🔥 Ilham FH3**. Bot harus bergabung dan admin Telegram mengirim `/bind FH3` di grup ini agar server tahu chat ID asli. Upload START/DONE gagal dengan aman apabila tujuan FH3 bukan grup tersebut (misalnya sebelumnya disetel sebagai chat pribadi leader). Judul saja pada screenshot tidak berisi chat ID.

### Tes koneksi grup tanpa pengiriman foto
Buka tab **Tugas** → **Periksa Koneksi Grup EVO Ilham FH3**. Tombol ini hanya memeriksa apakah bot Telegram yang dipakai website dapat mengakses grup FH3 yang benar; tidak mengirim foto. Jika gagal, periksa konfigurasi `/bind FH3` dan `TELEGRAM_BOT_TOKEN` di backend.

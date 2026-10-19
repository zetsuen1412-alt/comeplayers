# CP Boost Monitor Android v1.5 — FH3

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

# Duration dan progres harian Monitor FH3

Windows 2.1.0 dan Android 1.8.0 (versionCode 14) menambahkan alur untuk penugasan
Monitor baru yang berdurasi lebih dari satu hari. Sumber tetap pesan langsung
admin Telegram yang identitasnya dipin pada grup FH3. TASK, password dan nama
akun tidak dipakai untuk menebak jadwal.

| Duration dari admin | Jadwal |
| --- | --- |
| `8 hours x7`, `8hoursx7`, `8H × 7` | 8 jam per hari, 7 hari |
| `1 Week 8 Hours/Day` | 8 jam per hari, 7 hari |
| `7 days`, `seminggu` | 7 hari; jam harian tidak ditebak |
| `1 month`, `sebulan`, `12 jam x30` | 30 hari, sesuai permintaan pemilik |
| `2 weeks`, `2 months` | 14 hari, 60 hari |
| `48H`, `72 hours` | 2 atau 3 hari, masing-masing 24 jam |
| `12H`, `1 hari` | Alur satu kali START/DONE yang sudah ada |

Jadwal dibatasi 366 hari. Durasi bertentangan (`8h x7 2 weeks`), jam harian
melebihi 24, rentang yang ambigu, pecahan jumlah hari dan total jam yang tidak
habis dibagi 24 (`36H`) ditandai untuk diperiksa admin sebelum TAKE. Durasi
asli tetap tersedia. Kolom **Duration** muncul pada Order Baru dan Tugas Aktif
Windows; Android menampilkannya di kartu order dan tugas.

## Alur pekerjaan

1. TAKE mengunci durasi/jumlah hari dari pesan admin dan menyimpan karyawan.
2. START + foto dikirim sebagai `x5207/adit3/day1/start`.
3. PAUSE/CONTINUE + foto dapat diulang pada hari yang sama, dengan akhiran
   `day1/pause` dan `day1/continue`. DONE diblokir selama PAUSE.
4. DONE + foto dikirim sebagai `x5207/adit3/day1/done`. Hanya konfirmasi Telegram
   yang menambah jumlah hari selesai. Order kembali menunggu START Day 2 pada
   karyawan yang sama, tanpa TAKE ulang.
5. Day 2 sampai Day 7 menggunakan pola yang sama. Baru `day7/done` menutup
   seluruh order. Paket bulanan berakhir di `day30/done`.

Hari merupakan urutan sesi pekerjaan yang dilaporkan, bukan pergantian tanggal
otomatis atau penghitung waktu yang memaksa DONE. Setelah jatah harian selesai,
karyawan mengunggah DONE dan mengawali jatah berikutnya dengan START. Aplikasi
menampilkan `Day 2/7`, jumlah hari selesai, serta tombol START/DONE dengan nomor
hari. Tidak ada pengiriman laporan otomatis tanpa pemilihan dan konfirmasi foto.

Admin dapat memindahkan order. Hari yang sudah DONE dan nama pekerja pada setiap
laporan lama tetap tersimpan; pekerja pengganti melakukan TAKE dan START untuk
hari yang belum selesai. Laporan perangkat lama dari siklus sebelumnya ditolak.
Penugasan baru langsung oleh admin di Kelola Order juga menggunakan aturan ini.
Pemindahan/arsip/status diblokir bila sebuah foto sedang dikirim atau belum pasti.

Penugasan Monitor yang sudah ada sebelum migrasi tidak dikonversi diam-diam.
Order Telegram berikutnya, maupun order antrean lama yang baru diambil setelah
migrasi, otomatis menggunakan alur harian apabila Duration-nya memenuhi aturan.
Perubahan Duration pada pesan setelah TAKE tidak mengubah jadwal yang sudah
dikunci. Penggantian identitas pesan sumber memerlukan pemeriksaan admin.

## Integritas, upah dan kompatibilitas

Jurnal terpisah `cp_monitor_daily_plans` dan `cp_monitor_daily_events` menyimpan
snapshot durasi dan setiap foto/nomor hari/pekerja. Nomor revisi, siklus penugasan
dan hari yang ditinjau pengguna dikirim bersama foto. Transaksi database
menolak lompat hari, aksi tidak berurutan, perubahan pekerja, kiriman ganda dari
dua komputer, serta hasil kiriman Telegram yang belum pasti. Pengiriman ambigu
tidak dicoba ulang otomatis dan tidak menambah progres.

Payload Payroll, gaji dan Closing lama tidak ditulis oleh alur harian. DONE
sementara tidak membuat bukti DONE final pada alur harga/Tutup Buku. Hari terakhir
membuat satu bukti penyelesaian order yang dapat dihargai admin dan dibukukan
melalui alur yang sudah ada. Upah tetap satu nilai bersih yang diisi admin untuk
order, tidak dikalikan jumlah hari. Fitur ini tidak membuat tarif harian baru.

Tabel memakai RLS dan tidak dapat dibaca/ditulis oleh anon/authenticated. Hanya
backend dengan service_role yang dapat membaca jurnal dan menjalankan RPC
terbatas; backend tetap memeriksa akun, pekerja, sesi, dan sumber Telegram.
service_role tidak diberi hak INSERT/UPDATE/DELETE langsung pada tabel baru.
Tidak ada kunci atau token bot yang dikirim ke aplikasi.

Klien lama tidak dapat melewati progres dengan DONE biasa pada order harian.
Jika RPC migrasi belum tersedia, order multi-hari baru tidak dapat di-TAKE dari
backend baru; order satu hari tetap tersedia. Metadata harian dibaca dalam batch
kecil melalui indeks dan tidak membaca ulang payload workspace yang sudah
diotorisasi (optimasi PR #109 dipertahankan).

## Verifikasi dan penerapan

Tes lokal memakai database Postgres terisolasi PGlite dan transport Telegram
palsu. Rangkaian lengkap 7 dan 30 hari, pemindahan, dua klaim bersamaan,
PAUSE/CONTINUE, kegagalan/bukti ambigu, izin, harga final dan Tutup Buku diuji.
Snapshot seluruh workspace Payroll dibandingkan sebelum/sesudah alur harian.
Tes API juga memastikan caption/grup dipilih server dan metadata hari tidak
dapat dipalsukan untuk melewati otorisasi. EXE dan APK diperiksa dengan tes
kontrak serta render UI native; pengujian perangkat fisik dan Telegram nyata
masih memerlukan verifikasi pemilik setelah penerapan.

Sebelum produksi, minta persetujuan pemilik untuk merge/deploy, migrasi tambahan
`20261026172128_fh3_monitor_daily_duration.sql`, dan publikasi EXE/ZIP/APK dengan
kunci Android yang sama. Buat/verifikasi cadangan privat terbaru, terapkan migrasi
secara atomik, periksa izin dan kesesuaian data, lalu deploy backend dan paket.
Jika backend perlu rollback, pertahankan jurnal dan pengaman DONE; jangan drop
tabel atau mencoba membatalkan laporan Telegram yang sudah terkirim.

Android juga menyertakan rancangan halaman Order utama sederhana yang sebelumnya
disiapkan di PR #108. PR tersebut baru dapat ditutup sebagai tergantikan setelah
perubahan gabungan ini disetujui dan diterapkan.

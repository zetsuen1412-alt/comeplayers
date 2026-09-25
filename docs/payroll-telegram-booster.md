# Telegram Booster untuk Payroll ComePlayers

Fitur ini menghubungkan Mutasi Payroll dengan satu grup Telegram per divisi.

## Alur warna Mutasi

- normal/putih: belum mulai, atau sudah diverifikasi admin.
- hijau: START / sedang dikerjakan.
- oranye: PAUSE.
- kuning: DONE / kuota Gold penuh dan menunggu admin.
- merah: bermasalah.

Admin tetap menjadi pihak terakhir yang menekan **Pesanan ini selesai** di Mutasi. Setelah itu baris kembali normal/putih dan proses Gaji/Closing berjalan seperti sebelumnya.

## Grup divisi

Gunakan satu grup Telegram untuk setiap divisi yang dipakai: FH1, FH2, FH3, ADMIN, dan BANDAR.

Tambahkan bot ke grup, lalu admin Telegram menjalankan `/bind FH1` (gunakan FH2/FH3/ADMIN/BANDAR sesuai grup).

## Karyawan

Setiap karyawan menghubungkan Telegram miliknya sekali dengan `/link EMP001`. Kode harus sama dengan Kode Karyawan di Payroll ComePlayers.

Admin dapat menjadikan karyawan sebagai leader dengan `/leader EMP001`.

Admin/leader memilih atau mengganti karyawan Boosting langsung dari Telegram dengan `/assign X3101 EMP001`. Assignment lama disimpan sebagai riwayat; bukti lama tidak dihapus.

## Boosting

1. Order baru dikirim otomatis ke grup sesuai FH/divisi.
2. Admin/leader memilih karyawan dengan /assign.
3. Karyawan menekan START.
4. Bot meminta minimal satu foto/screenshot/video bukti START.
5. Setelah bukti diterima, Mutasi menjadi hijau.
6. PAUSE membuat Mutasi oranye.
7. RESUME mengembalikan Mutasi ke hijau.
8. DONE meminta minimal satu bukti foto/screenshot/video. Beberapa file diperbolehkan.
9. Setelah semua bukti terkirim, karyawan menekan SELESAI UPLOAD.
10. Mutasi menjadi kuning.
11. Admin membuka Bukti Telegram di Mutasi, memeriksa file, lalu menekan Pesanan ini selesai.
12. Mutasi kembali normal/putih.

Foto dan video tidak dipindahkan melalui Vercel. ComePlayers hanya menyimpan Telegram chat/message/file ID. Admin membuka pesan asli Telegram untuk melihat atau mengunduh file.

## Gold global lintas divisi

Order Gold dikirim ke semua grup FH1/FH2/FH3 yang sudah di-bind. Tidak ada kuota per divisi. Kuota hanya satu secara global untuk order.

Setiap setoran: tekan KIRIM GOLD, masukkan jumlah (contoh 30M), kirim minimal satu bukti foto/video, lalu tekan SELESAI UPLOAD. Server menerima jumlah secara atomik.

Jika sisa hanya 20M tetapi karyawan mengajukan 30M, hanya 20M diterima. Saat total mencapai target, order langsung dikunci dan semua pengiriman berikutnya ditolak. Mutasi menjadi kuning menunggu verifikasi admin.

## Setup environment Vercel

Tambahkan tiga Environment Variable: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` (minimal 16 karakter), dan `TELEGRAM_ADMIN_USER_IDS` (pisahkan koma jika lebih dari satu).

Untuk mengetahui Telegram User ID setelah webhook aktif, jalankan `/myid`.

Setelah environment variable ditambahkan dan deployment baru aktif:

1. buka `/admin/payroll/telegram`;
2. klik **Pasang / Perbarui Webhook**;
3. tambahkan bot ke grup divisi;
4. jalankan `/bind FH1`, `/bind FH2`, dan seterusnya;
5. minta karyawan menjalankan `/link KODE_KARYAWAN`.

## Order lama

Gunakan `/dispatch X3101` untuk mengirim order yang sudah ada sebelum Telegram aktif. Order baru dari sinkronisasi Google Sheets akan dicoba dikirim otomatis setelah tersimpan ke Payroll.

## Keamanan

- webhook Telegram wajib membawa secret token.
- hanya service-role server yang dapat membaca/menulis tabel Telegram.
- admin Telegram ditentukan oleh TELEGRAM_ADMIN_USER_IDS.
- leader hanya dapat mengelola assignment divisinya.
- karyawan hanya dapat START/PAUSE/RESUME/DONE untuk assignment miliknya.
- START dan DONE tidak dapat selesai tanpa bukti media.
- file media tetap di Telegram sehingga tidak menambah transfer video melalui Vercel.
- kuota Gold memakai transaksi database dengan row lock agar dua divisi tidak dapat melewati target pada waktu bersamaan.
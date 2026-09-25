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

Admin/leader divisi order memilih **PILIH / GANTI KARYAWAN**. Daftar menampilkan karyawan aktif (NEW/SHIFT/FULL) yang sudah menghubungkan Telegram di divisi tersebut, delapan per halaman. `/assign X3101 EMP001` tetap tersedia. Assignment dan bukti lama disimpan. `/link` tidak dapat mengambil alih akun/kode yang sudah terhubung; perubahan identitas harus ditangani admin.

## Boosting

1. Order baru dikirim otomatis ke grup sesuai FH/divisi.
2. Admin/leader divisi order memilih karyawan melalui tombol atau /assign.
3. Karyawan menekan START.
4. Bot meminta minimal satu foto/screenshot/video bukti START.
5. Setelah bukti diterima, Mutasi menjadi hijau.
6. PAUSE membuat Mutasi oranye.
7. RESUME mengembalikan Mutasi ke hijau.
8. DONE meminta minimal satu bukti foto/screenshot/video. Beberapa file diperbolehkan.
9. Setelah semua bukti terkirim, karyawan menekan SELESAI UPLOAD.
10. Mutasi menjadi kuning.
11. Admin membuka Bukti Telegram di Mutasi, memeriksa file, lalu menekan Pesanan ini selesai.
12. Mutasi kembali normal/putih. Status Telegram menjadi `verified`; notifikasi dikirim ke grup terkait. Semua tombol lama ditolak oleh database setelah verifikasi atau Closing, termasuk mengganti karyawan dan setoran Gold.

Sesi DONE/Gold menghitung foto dan video secara terpisah. **TAMBAH BUKTI** melanjutkan sesi; **BATAL** menutup sesi tanpa menghapus bukti. Tombol selesai dari sesi lama tidak dapat menutup sesi baru. Telegram tidak pernah membayar gaji atau melakukan Closing otomatis.

Foto dan video tidak dipindahkan melalui Vercel. ComePlayers hanya menyimpan Telegram chat/message/file ID. Admin membuka pesan asli Telegram untuk melihat atau mengunduh file.

## Gold global lintas divisi

Order Gold dikirim ke semua grup FH1/FH2/FH3 yang sudah di-bind. Tidak ada kuota per divisi. Kuota hanya satu secara global untuk order.

Setiap setoran: tekan KIRIM GOLD, masukkan jumlah (contoh 30M), kirim minimal satu bukti foto/video, lalu tekan SELESAI UPLOAD. Server menerima jumlah secara atomik.

Jika sisa hanya 20M tetapi karyawan mengajukan 30M, hanya 20M diterima. Saat total mencapai target, order langsung dikunci dan semua pengiriman berikutnya ditolak. Mutasi menjadi kuning menunggu verifikasi admin.

## Setup environment Vercel

Tambahkan tiga Environment Variable: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` (minimal 16 karakter), dan `TELEGRAM_ADMIN_USER_IDS` (pisahkan koma jika lebih dari satu).

Di [BotFather](https://t.me/BotFather), gunakan `/newbot`, tentukan nama dan username, lalu simpan token hanya di Vercel. Gunakan `/setprivacy` → pilih bot → **Disable** agar bukti di grup diterima; tambahkan ulang bot ke grup jika perlu. Buat webhook secret secara aman di server/pengelola kata sandi, bukan di browser. Secret hanya menggunakan huruf, angka, `_`, atau `-`. Halaman setup menampilkan checklist konfigurasi tanpa mengirim nilai secret ke browser.

Antrean pending diperiksa setiap menit melalui `/api/cron/payroll-telegram`, memakai `CRON_SECRET` yang sudah ada. Jadwal per menit memerlukan paket Vercel yang mendukungnya. Worker tidak mengirim pesan dari preview. Webhook hanya dipasang ke domain produksi ComePlayers. Setelah `/myid`, isi daftar ID admin angka lalu redeploy. Konfigurasi yang belum ada harus diisi dengan nilai asli, bukan token contoh.

Untuk mengetahui Telegram User ID setelah webhook aktif, jalankan `/myid`.

Setelah environment variable ditambahkan dan deployment baru aktif:

1. buka `/admin/payroll/telegram`;
2. klik **Pasang / Perbarui Webhook**;
3. tambahkan bot ke grup divisi;
4. jalankan `/bind FH1`, `/bind FH2`, dan seterusnya;
5. minta karyawan menjalankan `/link KODE_KARYAWAN`.

## Order lama

Gunakan `/dispatch X3101` untuk order lama. Order baru dari Sheet **dan input manual** masuk antrean dalam transaksi penyimpanan workspace. Boosting hanya ke divisinya; divisi kosong berstatus **Menunggu divisi**. Gold hanya ke FH1/FH2/FH3 aktif. Item dan jenis tak dikenal tidak masuk workflow. Grup yang belum dihubungkan dapat menerima order setelah `/dispatch` dijalankan ulang; kiriman yang sudah tercatat tidak digandakan.

## Jenis order spreadsheet

Kolom `JENIS ORDER`, `JENIS`, `ORDER TYPE`, atau `TYPE` diutamakan: GOLD/KOIN/COIN → `gold`; BOOSTING/BOOST/JOKI/JASA BOOSTING → `boosting`; ITEM/ITEM GAME → `item`. Tanpa nilai eksplisit, PROSES JOKI/BOOST/BOOSTING berarti Boosting; BOOSTER hitam dengan distribusi bernama dan jumlah bersatuan seperti `PERMANA 20M` berarti Gold. Data ambigu tetap draft dengan peringatan impor dan tanpa dispatch. Nama pesanan dan JUMLAH tetap mengikuti Sheet; validasi jumlah yang sudah ada tetap berlaku.

## Transaksi, retry, dan pengiriman pesan

Migrasi tambahan: `website/supabase/migrations/20260926030001_payroll_telegram_durable_workflow.sql`. Tabel fondasi dan bukti lama dipertahankan. RPC `cp_telegram_process_update` mengunci workspace lalu order, memeriksa identitas/assignment/status, dan menyimpan aksi, update_id, bukti, kuota, serta antrean notifikasi dalam satu transaksi. Error database membatalkan transaksi agar Telegram dapat retry; penolakan aturan disimpan sehingga retry tidak mengulang aksi. RPC Gold lama tanpa bukti ditutup.

Telegram `sendMessage` tidak menyediakan kunci idempotensi. Karena itu worker menandai pesan `sending` sebelum mengirim dan **tidak mengirim ulang secara buta** setelah timeout atau hasil yang tidak pasti. Baris `uncertain` atau `sending` yang tertinggal perlu diperiksa admin terhadap pesan asli Telegram; ini mencegah pesan ganda tetapi hasil pengiriman ambigu dapat memerlukan pemulihan manual. Pesan `pending` tetap diproses oleh worker berikutnya. Aksi bisnis tetap tersimpan meskipun Telegram sedang tidak tersedia.

## Pengujian

Jalankan `npm test`, `npm run typecheck`, dan `npm run build` dari `website`. Tes PGlite menjalankan migrasi dan RPC PostgreSQL asli pada database sementara, termasuk otorisasi, bukti, sesi lama, retry dan proteksi verified.

Untuk uji contention tiga koneksi PostgreSQL nyata di Windows: `npm install --prefix tmp/telegram-pg --no-save embedded-postgres@17.9.0-beta.17`, lalu `node scripts/test-payroll-telegram-concurrency.mjs`. Cluster localhost terisolasi dibuat di folder sementara, memakai kredensial acak lokal dan tidak membaca kredensial produksi. Tiga transaksi dibuktikan menunggu lock secara bersamaan sebelum dilepas; total akhir tidak boleh melebihi target. Data uji tidak dikirim ke Telegram.

## Keamanan

- webhook Telegram wajib membawa secret token.
- hanya service-role server yang dapat membaca/menulis tabel Telegram.
- admin Telegram ditentukan oleh TELEGRAM_ADMIN_USER_IDS.
- leader hanya dapat mengelola assignment divisinya.
- karyawan hanya dapat START/PAUSE/RESUME/DONE untuk assignment miliknya.
- START dan DONE tidak dapat selesai tanpa bukti media.
- file media tetap di Telegram sehingga tidak menambah transfer video melalui Vercel.
- kuota Gold memakai transaksi database dengan row lock agar dua divisi tidak dapat melewati target pada waktu bersamaan.

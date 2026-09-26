# Telegram Booster untuk Payroll ComePlayers

Alur utama: **admin website → akun Telegram leader → karyawan**. Satu akun leader dapat menangani beberapa divisi dan seluruh karyawan aktifnya. Karyawan tidak perlu punya akun Telegram atau menjalankan `/link`.

## Alur warna Mutasi

- normal/putih: belum mulai, atau sudah diverifikasi admin.
- hijau: START / sedang dikerjakan.
- oranye: PAUSE.
- kuning: DONE / kuota Gold penuh dan menunggu admin.
- merah: bermasalah.

Admin tetap menjadi pihak terakhir yang menekan **Pesanan ini selesai** di Mutasi. Setelah itu baris kembali normal/putih dan proses Gaji/Closing berjalan seperti sebelumnya.

## Akun leader dan divisi

Leader membuka bot, mengirim `/start`, lalu `/myid`. Admin membuka **Payroll → Telegram Booster**, memasukkan ID angka tersebut dan mencentang divisi leader (FH1/FH2/FH3/ADMIN/BANDAR). Satu ID boleh dipakai untuk beberapa divisi. Order baru dikirim ke chat pribadi leader. Tidak perlu membuat grup atau menghubungkan semua akun karyawan.

Di **Pesanan**, admin wajib memilih **Divisi tujuan**, lalu memilih **Ditentukan leader melalui Telegram** atau **Pilih karyawan langsung / Request booster**. Pilihan langsung hanya menampilkan karyawan aktif dari divisi tersebut. Satu booster yang dipilih langsung otomatis ditugaskan; jika ada beberapa request, leader memilih penugasan aktif melalui tombol. Divisi tidak lagi disimpulkan dari pilihan karyawan. Stok Gold/Item tetap mengikuti validasi Gudang yang sudah ada.

Mengganti leader berlaku untuk divisi yang dicentang, menutup sesi lama dan menghentikan antrean order menuju penerima lama. Order lama tidak dikirim ulang otomatis; admin dapat memakai `/dispatch KODE_ORDER`. Pengaturan grup dan tautan karyawan lama tetap kompatibel: `/bind FH1` harus dikirim admin di grup, bukan chat pribadi.

## Karyawan

Leader memilih **PILIH / GANTI KARYAWAN**. Daftar mengambil semua karyawan aktif (NEW/SHIFT/FULL) dari Payroll pada divisi order, delapan per halaman. `/assign X3101 EMP001` tetap tersedia. Leader mengirim status dan bukti atas nama karyawan tersebut. Nama karyawan dan ID Telegram pengirim bukti disimpan terpisah. Penugasan ikut diperbarui di Mutasi dengan revisi workspace baru agar perubahan tidak tertimpa penyimpanan tab lama.

## Boosting

1. Order baru dikirim otomatis ke leader sesuai divisi yang dipilih admin.
2. Admin/leader divisi order memilih karyawan melalui tombol atau /assign.
3. Leader menekan START atas nama karyawan terpilih.
4. Bot meminta minimal satu foto/screenshot/video bukti START.
5. Setelah bukti diterima, Mutasi menjadi hijau.
6. PAUSE membuat Mutasi oranye.
7. RESUME mengembalikan Mutasi ke hijau.
8. DONE meminta minimal satu bukti foto/screenshot/video. Beberapa file diperbolehkan.
9. Setelah semua bukti terkirim, leader menekan SELESAI UPLOAD.
10. Mutasi menjadi kuning.
11. Admin membuka Bukti Telegram di Mutasi, memeriksa file, lalu menekan Pesanan ini selesai.
12. Mutasi kembali normal/putih. Status Telegram menjadi `verified`; notifikasi dikirim ke grup terkait. Semua tombol lama ditolak oleh database setelah verifikasi atau Closing, termasuk mengganti karyawan dan setoran Gold.

Sesi DONE/Gold menghitung foto dan video secara terpisah. **TAMBAH BUKTI** melanjutkan sesi; **BATAL** menutup sesi tanpa menghapus bukti. Tombol selesai dari sesi lama tidak dapat menutup sesi baru. Telegram tidak pernah membayar gaji atau melakukan Closing otomatis.

Foto dan video tidak dipindahkan melalui Vercel. ComePlayers hanya menyimpan Telegram chat/message/file ID. Tautan pesan tersedia untuk grup yang mendukungnya; bukti dari chat pribadi dibuka oleh akun leader di percakapan aslinya. Website tetap menampilkan metadata dan nama karyawan.

## Gold sesuai divisi order

Semua order Gold, termasuk dari Sheet dan order lama, dikirim hanya ke leader divisi order (FH1/FH2/FH3). Contoh: X2867 dengan FH2 tidak dikirim ke FH3. Jika leader FH2 belum terhubung, order menunggu penerima FH2; tidak dialihkan ke divisi lain. Divisi kosong menunggu perbaikan di Sheet/website. Satu akun boleh menangani beberapa divisi, tetapi daftar karyawan tetap dibatasi ke divisi order. Total setoran seluruh karyawan memakai satu kuota untuk order tersebut.

Migrasi `website/supabase/migrations/20260926041704_payroll_telegram_strict_division_routing.sql` menonaktifkan sesi dan antrean yang salah divisi tanpa menghapus order, bukti, atau riwayat pesan. Pesan lama tetap terlihat di Telegram, tetapi tombol dari penerima/divisi yang tidak sesuai ditolak. Setelah leader divisi yang benar terhubung, admin dapat memakai `/dispatch KODE_ORDER` untuk order lama.

Setiap setoran: leader menekan KIRIM GOLD, memilih karyawan, memasukkan jumlah (contoh 30M), mengirim minimal satu bukti foto/video, lalu menekan SELESAI UPLOAD. Ulangi untuk karyawan berikutnya. Server menerima jumlah secara atomik; untuk order baru dari form, pembagian aktual ikut diperbarui di Mutasi tanpa memverifikasi order atau membayar gaji.

Jika sisa hanya 20M tetapi karyawan mengajukan 30M, hanya 20M diterima. Saat total mencapai target, order langsung dikunci dan semua pengiriman berikutnya ditolak. Mutasi menjadi kuning menunggu verifikasi admin.

## Item

Admin memilih jenis **Item**, divisi tujuan, dan stok Item yang sesuai dari Gudang. Jumlah stok harus sama dengan jumlah pesanan. Admin dapat menyerahkan pemilihan pekerja kepada leader atau meminta karyawan tertentu. Satu karyawan yang diminta langsung akan ditugaskan otomatis; beberapa request memerlukan pilihan leader seperti Boosting.

Order dikirim hanya ke leader divisi tujuan dengan judul **ORDER ITEM** dan jumlah Item sebenarnya. Leader memilih karyawan, menekan **START**, lalu mengirim minimal satu foto/video bukti. **PAUSE**, **RESUME**, dan **BERMASALAH** tersedia. Untuk menyelesaikan seluruh order, tekan **DONE**, kirim bukti pengiriman Item, lalu **SELESAI UPLOAD**. Item memakai penyelesaian satu order penuh, bukan setoran kuota bertahap seperti Gold.

Status menjadi kuning menunggu verifikasi admin di Mutasi. Penyelesaian mencatat seluruh jumlah Item sebagai terkirim. Stok/reservasi dan kepemilikan Gudang tidak diubah oleh aksi Telegram; pemilihan karyawan memperbarui pembagian pekerjaan, bukan pemilik stok. Nilai pesanan, pembayaran, Gaji dan Closing tetap mengikuti proses website. Order diverifikasi, Closing, atau diarsipkan dari Sheet menolak aksi Telegram berikutnya.

Migrasi `website/supabase/migrations/20260926035622_payroll_telegram_item_workflow.sql` tidak mengirim order lama secara massal. Gunakan `/dispatch KODE_ORDER` dari akun admin Telegram untuk mengirim satu order Item lama yang masih aktif.

## Setup environment Vercel

Tambahkan tiga Environment Variable: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` (minimal 16 karakter), dan `TELEGRAM_ADMIN_USER_IDS` (pisahkan koma jika lebih dari satu).

Di [BotFather](https://t.me/BotFather), gunakan `/newbot`, tentukan nama dan username, lalu simpan token hanya di Vercel. Gunakan `/setprivacy` → pilih bot → **Disable** agar bukti di grup diterima; tambahkan ulang bot ke grup jika perlu. Buat webhook secret secara aman di server/pengelola kata sandi, bukan di browser. Secret hanya menggunakan huruf, angka, `_`, atau `-`. Halaman setup menampilkan checklist konfigurasi tanpa mengirim nilai secret ke browser.

Antrean pending diperiksa setiap menit melalui `/api/cron/payroll-telegram`, memakai `CRON_SECRET` yang sudah ada. Jadwal per menit memerlukan paket Vercel yang mendukungnya. Worker tidak mengirim pesan dari preview. Webhook hanya dipasang ke domain produksi ComePlayers. Setelah `/myid`, isi daftar ID admin angka lalu redeploy. Konfigurasi yang belum ada harus diisi dengan nilai asli, bukan token contoh.

Untuk mengetahui Telegram User ID setelah webhook aktif, jalankan `/myid`.

Setelah environment variable ditambahkan dan deployment baru aktif:

1. buka `/admin/payroll/telegram`;
2. klik **Pasang / Perbarui Webhook**;
3. leader membuka bot dan mengirim `/start` lalu `/myid`;
4. isi ID leader dan pilih divisinya di website, lalu **Simpan leader**;
5. buat order dengan divisi tujuan dan pilihan karyawan yang sesuai.

## Order lama

Gunakan `/dispatch X3101` untuk order lama. Order baru dari Sheet **dan input manual** masuk antrean dalam transaksi penyimpanan workspace. Boosting, Gold, dan Item hanya ke divisi order; divisi kosong berstatus **Menunggu divisi**. Gold memerlukan divisi FH1/FH2/FH3. Jenis tak dikenal tidak masuk workflow. Penerima yang belum dihubungkan dapat menerima order setelah `/dispatch` dijalankan ulang; kiriman yang sudah tercatat tidak digandakan.

## Jenis order spreadsheet

Kolom `JENIS ORDER`, `JENIS`, `ORDER TYPE`, atau `TYPE` diutamakan: GOLD/KOIN/COIN → `gold`; BOOSTING/BOOST/JOKI/JASA BOOSTING → `boosting`; ITEM/ITEM GAME → `item`. Tanpa nilai eksplisit, PROSES JOKI/BOOST/BOOSTING berarti Boosting; BOOSTER hitam dengan distribusi bernama dan jumlah bersatuan seperti `PERMANA 20M` berarti Gold. Data ambigu tetap draft dengan peringatan impor dan tanpa dispatch. Nama pesanan dan JUMLAH tetap mengikuti Sheet; validasi jumlah yang sudah ada tetap berlaku.

## Transaksi, retry, dan pengiriman pesan

Migrasi tambahan: `website/supabase/migrations/20260926030001_payroll_telegram_durable_workflow.sql`. Tabel fondasi dan bukti lama dipertahankan. RPC `cp_telegram_process_update` mengunci workspace lalu order, memeriksa identitas/assignment/status, dan menyimpan aksi, update_id, bukti, kuota, serta antrean notifikasi dalam satu transaksi. Error database membatalkan transaksi agar Telegram dapat retry; penolakan aturan disimpan sehingga retry tidak mengulang aksi. RPC Gold lama tanpa bukti ditutup.

Migrasi leader: `website/supabase/migrations/20260926030002_payroll_telegram_leader_dispatch.sql`. File dibuat dengan CLI dan diurutkan setelah fondasi bertanggal maju. Migrasi tidak mengirim order lama, menghapus bukti, atau mengubah kredensial. Endpoint konfigurasi leader hanya dapat dipakai admin website; RPC terkait tetap hanya untuk service role.

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

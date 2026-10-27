# Monitor langsung berjalan

Atas permintaan pemilik, Windows 2.2.0 dan Android 1.9.0 membuka Order Baru tanpa akun karyawan, kata sandi, aktivasi perangkat, atau token bersama yang ditanam di aplikasi. Pilih nama karyawan FH3 untuk TAKE. START, PAUSE/CONTINUE, DONE, Duration, progres DAY, dan atribusi nama tetap mengikuti jurnal Telegram yang sama.

Login Admin berada di Pengaturan. Hanya admin dapat menghapus/mengarsipkan, memindahkan pekerja, mengubah Refund/Bermasalah, memberi upah, atau membuat Tutup Buku. Membuka ulang aplikasi selalu memulai mode karyawan; sesi admin tersimpan tidak otomatis diaktifkan/diperbarui. Keluar atau kegagalan pembaruan sesi admin mengembalikan mode karyawan tanpa menghapus riwayat pekerjaan lokal.

Android baru mengaktifkan pemantauan order secara bawaan dan meminta izin notifikasi Android bila diperlukan. Pilihan notifikasi pengguna lama dipertahankan. Layanan latar belakang memakai akses operasional tanpa akun, termasuk ketika admin sedang login. Izin notifikasi/batas baterai Android tetap berlaku. Antrean pertama menjadi baseline senyap; hanya order berikutnya memicu suara/popup, dengan deduplikasi yang sama.

## Batas akses

`X-Monitor-Mode: public` adalah penanda protokol terbuka, bukan rahasia atau bukti identitas. Sesuai keputusan pemilik, siapa pun yang mengakses protokol ini dapat melihat operasional FH3 dan memilih nama FH3 yang masih aktif. Tidak ada pembatasan perangkat/IP kantor atau klaim bahwa nama yang dipilih sudah diautentikasi.

Daftar izin publik hanya mencakup GET roster/pending/tasks/completed/proof-setup/books serta POST assign/take/progress. Header Authorization yang ada selalu melewati pemeriksaan identitas biasa dan tidak diturunkan menjadi publik ketika tidak valid. Manajemen, akun, penutupan buku, dan endpoint penghasilan Payroll lama tetap privat. Data Tutup Buku Monitor dapat dibaca tim sesuai keputusan pemilik sebelumnya; gaji, potongan, bank, dan Closing Payroll lama tidak ikut dipublikasikan.

Server menentukan actor non-admin tetap `00000000-0000-4000-8000-0000000000f3`, memeriksa nama/kode/ID FH3 yang unik dan aktif, serta memakai guard SQL yang sama untuk order Telegram langsung dari pengirim/grup yang diizinkan. Pemindahan ke pekerja berbeda tetap tindakan admin. Client tidak dapat memilih actor admin, grup Telegram, urutan DAY, atau melewati konfirmasi TAKE/foto. Pengiriman yang hasilnya belum pasti tidak diulang otomatis.

## Database dan beban baca

Migrasi `20261027060739_fh3_open_monitor_workspace.sql` menambah dua tabel kecil, RPC proyeksi dan pembatas permintaan, serta memperluas guard actor yang sama. Tidak ada perubahan/penghapusan baris Payroll, karyawan, gaji, Closing, atau audit lama. Tidak ada perubahan kunci APK. Tabel dan RPC baru tidak dapat dipanggil langsung oleh anon/authenticated; server service_role hanya diberi EXECUTE RPC yang dibutuhkan, tanpa akses langsung tabel baru.

RPC memproyeksikan identitas pekerja dan metadata operasional order, sehingga setiap poll tidak mengirim dokumen Payroll/Closing lengkap ke server aplikasi. Semua ID/kode pekerja dan referensi order lintas tim tetap dipertahankan untuk pemeriksaan benturan; gaji/bank/arsip tidak ditransfer. Tidak ada cache otorisasi lintas permintaan. Operasi publik dibatasi per hash IP per menit (1.000 pembacaan, 100 perubahan) untuk mendukung banyak komputer di satu NAT. GET roster/pending/tasks/completed/books mempunyai deadline server 18 detik; polling mundur hingga 120 detik ketika gagal.

Sakelar darurat `cp_monitor_set_open_mode(actor_admin, false)` dapat menonaktifkan seluruh operasi publik; menyalakannya lagi memakai `true`. RPC ini hanya dapat dipanggil server dan tetap memeriksa role admin pada database. Jangan menerapkan sakelar/migrasi tanpa izin produksi.

Mode tanpa akun menghindari ketergantungan pekerja pada Supabase Auth. Koneksi internet dan database tetap diperlukan untuk menerima order dan mengirim laporan. Diagnosis baca-saja pada 27 Oktober 2026 menemukan database Unhealthy dan tekanan memori; perubahan ini mengurangi beban, tanpa mengklaim menjamin ketersediaan database atau menghapus audit yang besar.

Build preview pertama tertahan dua pembacaan katalog yang tidak dibatasi. Sitemap kini membatalkan pembacaan setelah lima detik dan memperbarui fallback tiap jam; halaman kategori admin membaca saat request dengan batas yang sama dan menunjukkan pesan muat ulang ketika database gagal. Build rilis tidak lagi menunggu halaman admin membaca database produksi.

## Validasi dan penerapan

Tes lokal mencakup pemasangan baru, sesi admin lama/kedaluwarsa, tanpa panggilan Auth, TAKE/foto sekali kirim, notifikasi latar belakang tanpa akun, pembatas izin/rate, DAY 1–7/30 dan 48H, pemindahan admin, serta kesetaraan dokumen Payroll sebelum/sesudah operasi. PGlite menjalankan seluruh rantai migrasi terkait secara lokal. Tidak ada pesan uji ke grup Telegram asli.

Urutan rilis setelah persetujuan: cadangkan state operasional dan definisi fungsi, terapkan migrasi, verifikasi ACL dan data lama, deploy backend, lalu publikasikan paket Windows/Android dan metadata unduhan. Verifikasi read-only protokol publik 200 serta endpoint admin tetap ditolak tanpa sesi. Publikasi empat berkas unduhan dilakukan dengan checksum dan sertifikat APK lama. Build preview tanpa migrasi baru akan menolak mode publik dengan 503; tidak boleh fallback membaca seluruh Payroll atau melewati guard.

CI GitHub sebelumnya diblokir pembayaran. Penerapan manual dengan tes lokal/build preview sebagai pengganti CI memerlukan persetujuan tersendiri untuk perubahan ini. Tidak ada produksi, migrasi, restart, pembelian, atau merge yang tersirat hanya karena PR sudah dibuat.

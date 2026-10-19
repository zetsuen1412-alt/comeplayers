# CP Boost Monitor: order langsung dari Payroll Website (FH3)

## Alur baru (tanpa bot Telegram)
1. Order Boosting/Item FH3 masuk Payroll Website melalui input manual atau sinkronisasi Google Sheets yang sudah ada.
2. Selama order masih belum memiliki pekerja, belum selesai/diarsipkan, dan tidak ditandai perlu review, order langsung tersedia di endpoint `GET /api/admin/payroll/mobile/pending`. Tidak diperlukan tabel Telegram, akun leader, atau bot.
3. CP Boost Monitor Android membuka tab **Order Baru**, menyegarkan antrean sekitar setiap 30 detik selama aplikasi aktif, dan menampilkan kode order, nama order, game, buyer, dan TASK.
4. Admin memilih karyawan FH3 yang aktif dan menyetujui penugasan.
5. `POST /api/admin/payroll/mobile/assign` memvalidasi token admin Payroll dan memanggil `cp_mobile_assign_fh3`. Transaksi mengunci satu row workspace, memvalidasi state/employee lagi, menyimpan `workerAssignments`, `employeeCode`, `employeeName`, `assignmentMode=direct`, dan `operationalStatus=assigned`, menambah revision, dan mencatat aktor ke audit.
6. Order hilang dari antrean, lalu muncul pada kartu karyawan setelah sync berikutnya. Website Pesanan/Mutasi membaca assignment yang sama.

## Endpoint admin
- `GET /api/admin/payroll/mobile/pending`: langsung dari `cp_payroll_workspace.payload[orders]`; JSON `{schema:2,source:"payroll",scope:"FH3",revision,pending:[...]}`.
- `POST /api/admin/payroll/mobile/assign`: JSON `{"orderRef":"X1234","employeeCode":"EMP001"}`; admin ID diambil dari sesi login, bukan dari klien. Jika orang lain sudah menugaskan pekerja berbeda, akan gagal 409 dan user diminta refresh.
- `GET /api/admin/payroll/mobile/tasks`: kartu tugas yang sudah ditugaskan berasal langsung dari Payroll workspace, bukan dari Telegram.
- `GET /api/admin/payroll/mobile/roster`: roster FH3 dari Payroll seperti semula.
- Data gaji, gaji bersih, kasbon, token bot Telegram, dan isi spreadsheet mentah tidak dikirim ke APK.

## Batasan desain
- Rilis ini khusus **FH3**, jenis order **Boosting/Item**, satu karyawan per order, serta order satu kali (non-DAY). Gold, FH1/FH2, order harian DAY, dan pembagian ke beberapa karyawan memerlukan versi lanjutan.
- Antrean menerima status `draft`, `confirmed`, atau `assignment_pending` selama tidak dalam review dan belum ditugaskan.
- Status Ready/Farming/Tidur/Bekerja tetap dikelola lokal dan tidak menjadi status resmi `operationalStatus` Payroll.
- Belum menggunakan Android push notification saat aplikasi tidak aktif. Order Baru diperiksa sekitar 30 detik selama aplikasi aktif (termasuk Dashboard); roster/tugas setiap ±2 menit atau manual refresh.
- Admin yang berbeda tidak dapat menimpa assignment yang sudah tersimpan. Repeated submit untuk pekerja sama dijawab sukses tanpa membuat penugasan duplikat.
- Sinkronisasi Sheet mempertahankan pilihan worker dari aplikasi selama kolom BOOSTER sumber kosong; worker yang eksplisit ditentukan Sheet tetap mengambil prioritas pada import berikutnya.

## Migrasi, kompatibilitas, dan Telegram lama
1. Jalankan `20261019220000_cp_boost_monitor_mobile_assignment.sql` untuk assignment langsung dan audit.
2. Jalankan `20261019220001_cp_boost_monitor_direct_fh3_routing.sql` untuk mencegah dispatch Telegram **baru** pada Boosting/Item FH3. Pending unsent Telegram notices untuk order FH3 yang belum dimulai dibatalkan. Pekerjaan Telegram lama yang sudah `in_progress` dipertahankan hingga selesai, dan divisi lain maupun Gold tetap memakai workflow lamanya.
3. Deploy website API, kemudian install APK Android versi 1.5.0. Jangan gunakan APK baru jika migrasi belum diterapkan.
4. Workflow GitHub Actions menghasilkan APK debug internal. APK yang diunduh dari website hanya berubah setelah build dari main dan publish berhasil. Jangan mengasumsikan APK produksi otomatis terbarui dari PR.

## Checklist pengujian
- [ ] Unit test endpoint, database PGlite dan typecheck: `npx tsx --test tests/payroll-mobile-assignment*.test.ts` serta `npm run typecheck`.
- [ ] Sinkronisasi order baru manual dan dari Sheet muncul di tab Android tanpa Telegram.
- [ ] Admin memilih karyawan aktif; assignment muncul di website dan kartu karyawan di APK.
- [ ] Dua admin memilih berbeda bersamaan; hanya pemenang pertama berhasil, lainnya konflik.
- [ ] Refresh Sheet dengan booster kosong mempertahankan assignment mobile.
- [ ] Order verify/closed/archived/review/resign/daily dan akun non-admin ditolak.
- [ ] Uji Android fisik, keystore/upgrade APK, logout, token kedaluwarsa dan internet putus.
- [ ] Yakinkan order baru FH3 tidak mengirim pesan Telegram, dan workflow lama lintas divisi tidak rusak.


## START dan DONE dari CP Boost Monitor (v1.5)
Alur penugasan tetap **Payroll Website → Android → Payroll Website**, bukan bot sebagai sumber order. Telegram hanya dipakai untuk **pengiriman foto bukti** dengan token bot yang tersimpan aman di backend.
1. Admin memilih karyawan FH3 pada order Boosting/Item. Aplikasi menawarkan **START + Foto**; foto dipilih dari galeri, lalu dikonfirmasi.
2. Website mengecek penugasan, status, dan tujuan Telegram berdasarkan konfigurasi grup aktif **FH3** pada `cp_payroll_telegram_divisions`. APK tidak dapat memasukkan chat ID sembarang. Bukti dikirim memakai `sendPhoto` bot server dengan caption otomatis `x4671/mulyana/start`.
3. Telegram harus mengembalikan `message_id` sebelum website mengubah `operationalStatus` menjadi `in_progress`. Referensi pesan dan file Telegram dicatat di tabel `cp_mobile_order_proof`.
4. Pada halaman **Tugas**, tekan **DONE + Screenshot**, pilih foto akhir, konfirmasi. Setelah Telegram berhasil mengirim `x4671/mulyana/done` + foto, status website berubah menjadi `completed` dan `completedAt` terisi (belum otomatis diverifikasi atau dimasukkan ke gaji).
5. Satu order/aksi hanya dapat memiliki satu bukti terkirim; tindakan paralel ditolak. Foto wajib PNG/JPEG maksimal 7 MB. Jika respons Telegram tidak pasti, aksi ditahan untuk pemeriksaan manual dan tidak diulang otomatis.
6. Jika pesan awal order tercatat dengan `message_id` di `cp_payroll_telegram_order_chats` untuk grup yang sama, bukti dikirim sebagai **reply**. Jika order awal diketik manual di Telegram tanpa tautan ID, bukti tetap dikirim ke grup tetapi berupa pesan foto baru, bukan reply berutas.

**Persiapan operasional:** masukkan bot dengan izin mengirim foto ke grup tujuan (misalnya *EVO Ilham FH3*), konfigurasikan chat ID grup tersebut sebagai divisi FH3 di pengaturan Telegram Payroll Website, dan pastikan `TELEGRAM_BOT_TOKEN` di server telah diset. Nama dan chat ID grup dari screenshot saja tidak cukup untuk menghubungkannya secara otomatis. Jangan menaruh token bot di aplikasi Android.

**Migrasi tambahan:** jalankan `20261019220002_cp_boost_monitor_mobile_telegram_proof.sql` setelah dua migrasi direct-assignment sebelumnya. Endpoint `POST /api/admin/payroll/mobile/progress` menerima multipart `orderRef`, `employeeCode`, `action`, `photo`, memerlukan akun admin dan membalas hasil konfirmasi. Status lokal Ready/Farming/Tidur/Bekerja tetap independen. Uji di staging dengan grup uji terlebih dahulu sebelum menggunakan grup produksi.

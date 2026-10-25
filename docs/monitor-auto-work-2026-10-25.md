# Status Sedang Bekerja otomatis setelah TAKE

Windows 2.0.3 dan Android 1.7.1 mengubah Ready Boosting/Farming menjadi Sedang
Bekerja setelah API mengonfirmasi bahwa TAKE telah diterima Telegram. Assignment
yang tersimpan tetapi TAKE belum terkonfirmasi tidak cukup untuk mengubah status.

Refresh tugas aktif juga mengenali TAKE terkonfirmasi dari perangkat lain. Hanya
tugas assigned/in_progress yang dapat dilanjutkan, dengan takeStatus=sent, tanpa
deliveryUncertain, yang digunakan. Identitas dicocokkan menggunakan ID dan kode
karyawan FH3 aktif; nama tampilan tidak digunakan untuk atribusi. Roster ambigu
tidak boleh memperbarui status.

Status otomatis dan riwayatnya disimpan di perangkat, tanpa menulis status ke
Payroll Website. Polling berulang atau beberapa order tidak menggandakan event
Work. Tidur, Istirahat dan Offline manual tetap dipertahankan; durasi Tidur tidak
direset. Karyawan Tidur harus diubah ke Ready dahulu untuk TAKE order baru.

DONE atau menghilangnya tugas tidak mengembalikan Work ke Ready secara otomatis
dalam pembaruan ini. Operator tetap menentukan status setelah pekerjaan berakhir.
File riwayat lama dipertahankan. Kegagalan menyimpan status lokal tidak boleh
diartikan sebagai kegagalan TAKE atau memicu pengiriman laporan ulang.

Pembaruan Android tetap memakai package id.comeplayers.boostmonitor.fh3.accounts
dan sertifikat rilis yang sama dengan 1.7.0, dengan versionCode 9. APK tersebut
dapat memperbarui 1.7.0 tanpa menghapus data lokal. Tidak ada perubahan server,
migrasi database, kunci penandatanganan, atau data Payroll/gaji/Closing.

Pengujian mencakup konfirmasi TAKE, deduplikasi status, pergantian akun/logout,
refresh lintas perangkat, identitas ambigu/berubah, tugas selesai/terblokir, serta
perlindungan status dan waktu Tidur. Jangan memakai order pelanggan atau laporan
Telegram palsu sebagai data pengujian produksi.

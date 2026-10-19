# CP Boost Monitor — Khusus karyawan FH3

**Sumber data:** menu [Payroll → Karyawan](https://www.comeplayers.com/admin/payroll/employees),
filter Bagian/FH **FH3**. Endpoint roster hanya mengirim identitas dan status anggota FH3.
Endpoint tugas terpisah mengirim proyeksi minimal order aktif yang sudah ditugaskan:
Order, nama order, Game, Buyer, TASK, kode/ID karyawan, dan status pengerjaan.
Token bot Telegram, gaji, kasbon, mutasi, serta spreadsheet mentah **tidak** dikirim ke APK.

## Penugasan order baru (fitur source terbaru, perlu deploy)
Admin Payroll dapat membuka tab **Order Baru** untuk memilih satu karyawan FH3 aktif untuk order Boosting/Item `waiting`. Penugasan disimpan secara atomik ke website, assignment Telegram, dan audit; bot memperbarui pesan order ketika worker outbox berjalan. Perlu migrasi database dan APK baru sebelum digunakan di produksi. Detail: [panduan penugasan Telegram](../docs/cp-boost-monitor-telegram-assignment.md).

## Pembaruan otomatis
1. Instal APK terbaru melalui [APK Karyawan](https://www.comeplayers.com/admin/payroll/boost-monitor).
2. Saat pertama dibuka login menggunakan akun Payroll ComePlayers berizin.
3. Nama FH3 dan order aktif langsung diambil dari website dan diperbarui saat APK dibuka,
   tiap sekitar 2 menit selama aktif, atau dengan tombol **Ambil Nama Terbaru**.
4. Perubahan nama/kode di website mengikuti ID payroll dan tidak mereset status
   Ready Boosting, Farming, Tidur, dan Sedang Bekerja. Order Telegram yang sudah ditugaskan
   ikut muncul pada kartu karyawan saat sinkronisasi.

## Pembersihan data
Database APK versi 4 secara lokal membersihkan karyawan selain FH3 beserta
riwayatnya saat upgrade. Proses ini juga dilakukan saat sinkronisasi atau restore
backup. Anggota yang pindah keluar FH3 dibersihkan dari APK pada sync berikutnya.
FH3 resign/hilang Sheet disembunyikan dari daftar aktif.

**Seluruh data Payroll Website tetap utuh.** Tidak ada perintah penghapusan pada
database website. APK melakukan polling terautentikasi; perubahan order muncul saat
sinkronisasi berikutnya, bukan push real-time.

Build debug perlu ditandatangani dengan keystore stabil untuk pembaruan produksi.
Jika debug APK baru ditolak Android, backup JSON dari APK lama sebelum uninstall.

## Pengujian
- `website/tests/payroll-mobile-roster.test.ts` memeriksa FH3-only, status nonaktif,
  rename berdasarkan ID, dan perlindungan data keuangan.
- Build Android GitHub Actions memeriksa kompilasi dan signature APK.
- Website smoke test memeriksa checksum unduhan dan API menolak akses tanpa login.
- Login asli dan sinkronisasi pada HP admin perlu diverifikasi terpisah.

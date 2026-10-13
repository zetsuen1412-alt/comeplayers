# CP Boost Monitor v1.3 — Khusus karyawan FH3

**Sumber data:** menu [Payroll → Karyawan](https://www.comeplayers.com/admin/payroll/employees),
filter Bagian/FH **FH3**. Endpoint khusus APK hanya mengirim nama, kode, ID,
FH, status karyawan, dan aktif/nonaktif untuk anggota FH3. FH1/FH2/ADMIN/BANDAR,
gaji, kasbon, mutasi, order maupun spreadsheet mentah **tidak** dikirim.

## Pembaruan otomatis
1. Instal APK terbaru melalui [APK Karyawan](https://www.comeplayers.com/admin/payroll/boost-monitor).
2. Saat pertama dibuka login menggunakan akun Payroll ComePlayers berizin.
3. Nama FH3 langsung diambil dari website dan diperbarui saat APK dibuka,
   tiap sekitar 2 menit selama aktif, atau dengan tombol **Ambil Nama Terbaru**.
4. Perubahan nama/kode di website mengikuti ID payroll dan tidak mereset status
   Ready Boosting, Menganggur, Tidur, dan Bekerja.

## Pembersihan data
Database APK versi 3 secara lokal membersihkan karyawan selain FH3 beserta
riwayatnya saat upgrade. Proses ini juga dilakukan saat sinkronisasi atau restore
backup. Anggota yang pindah keluar FH3 dibersihkan dari APK pada sync berikutnya.
FH3 resign/hilang Sheet disembunyikan dari daftar aktif.

**Seluruh data Payroll Website tetap utuh.** Tidak ada perintah penghapusan pada
database website. Status boosting belum dibagi real-time antar HP.

Build debug perlu ditandatangani dengan keystore stabil untuk pembaruan produksi.
Jika debug APK baru ditolak Android, backup JSON dari APK lama sebelum uninstall.

## Pengujian
- `website/tests/payroll-mobile-roster.test.ts` memeriksa FH3-only, status nonaktif,
  rename berdasarkan ID, dan perlindungan data keuangan.
- Build Android GitHub Actions memeriksa kompilasi dan signature APK.
- Website smoke test memeriksa checksum unduhan dan API menolak akses tanpa login.
- Login asli dan sinkronisasi pada HP admin perlu diverifikasi terpisah.

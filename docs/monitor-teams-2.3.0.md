# EVOGAMING Monitor Windows 2.3.0 — tim dan pembagian hasil

Versi ini dibangun dari source Windows 2.2.1 yang cocok persis dengan
`EVOGAMINGMonitor (12).exe` (SHA-256
`9b85dc8d25f4d6003c8c23a4684107a505e70c03833a2919a0b1acf1c48c269b`).
Mode karyawan tanpa login, TAKE/START/PAUSE/CONTINUE/DONE dengan foto,
Order Selesai, Data Tutup Buku, riwayat status lokal dan notifikasi tetap tersedia.

## Penggunaan

1. Login admin melalui **Pengaturan** untuk mengatur anggota dan persentase.
2. Pilih karyawan penanggung jawab dan order baru, kemudian **TAKE + ATUR TIM**.
3. Tambahkan hingga empat karyawan. Isi persentase masing-masing, maksimal dua
   angka desimal. Semua bagian harus lebih dari nol dan totalnya tepat **100%**.
   Tombol **Bagi rata** tersedia sebagai pilihan; admin tetap memeriksa hasilnya.
4. Untuk order berjalan, pilih **Tugas Aktif → Tambah Karyawan**. Admin dapat
   menambahkan anggota serta mengubah persentase sebelum order selesai.
5. Persentase berlaku terhadap **total upah order**, termasuk ketika anggota baru
   bergabung di tengah pekerjaan. Karyawan yang sudah bergabung tetap tercatat.
6. Penanggung jawab awal mengirim satu rangkaian laporan order. Anggota tambahan
   mendapat kredit pekerjaan dan bagian upahnya di Order Selesai/Tutup Buku.

Satu order tetap dihitung satu kali pada total tim. Contoh upah Rp100.000 dengan
bagian 60%/40% menghasilkan Rp60.000 dan Rp40.000. Pembulatan rupiah menggunakan
urutan kode karyawan yang tetap; jumlah semua bagian selalu sama dengan upah order.
Tutup Buku menyimpan bagian masing-masing sebagai snapshot yang tidak berubah.

## Urutan pemasangan server

1. Jalankan pemeriksaan SQL di database uji. Terapkan migrasi additive
   `website/supabase/migrations/20261031013816_fh3_monitor_teams.sql` dengan prosedur
   migrasi proyek yang berlaku.
2. Deploy API website dari commit yang sama; periksa endpoint team dan tugas
   menggunakan sesi admin uji. Jangan mengirim bukti Telegram percobaan ke order nyata.
3. Terbitkan EXE/ZIP 2.3.0 setelah server siap. Workflow Windows memperbarui unduhan
   publik hanya pada push ke main; pull request hanya menghasilkan artefak uji.
4. Tutup aplikasi lama sebelum membuka EXE baru. Riwayat status dan sesi memakai
   lokasi yang sama. Jika sesi admin berakhir, masuk lagi melalui Pengaturan.

Order satu karyawan lama tetap mendapat 100% tanpa migrasi ulang riwayat. Snapshot
Tutup Buku lama tidak ditulis ulang. Payroll finansial website tidak diubah oleh
roster tim operasional Monitor. Android lama tetap memakai lifecycle penanggung
jawab; pengeditan tim tersedia di Windows 2.3.0.

Kontrak database dan pengamanan versi: [monitor-teams-database.md](monitor-teams-database.md).

## Verifikasi

- Regresi API/database Monitor: 99 tes lulus lokal, termasuk migrasi dari struktur lama,
  pembagian upah, penguncian versi, otorisasi dan kompatibilitas workflow.
- TypeScript: `tsc --noEmit --incremental false` pada source dependency pengujian.
- Windows: build Release; pemeriksaan tim dan render WinForms dengan data sintetis.
- Suite Windows penuh tetap dijalankan CI pada Windows normal. Sandbox lokal tidak
  menyediakan profil pengguna yang diperlukan DPAPI untuk tes sesi terenkripsi;
  enkripsi produksi tidak diubah untuk menghindari keterbatasan tersebut.

Build dari PR merupakan versi uji sampai migrasi dan API server diterapkan.

# Changelog v0.7.0

## Mutasi selesai otomatis masuk Gaji

- Mutasi FH sekarang memiliki aksi **Selesai & Masuk Gaji**.
- Saat aksi digunakan, status pekerjaan menjadi terverifikasi dan pendapatan karyawan dihitung otomatis dari harga order × pembagian.
- Halaman Gaji sekarang membaca langsung order yang sudah selesai/terverifikasi, bukan daftar INCOME manual.
- Gaji dapat difilter Semua, FH1, FH2, atau FH3.
- Order yang belum selesai tidak masuk ke pendapatan/gaji.
- Tutup Buku dan file Excel kini memakai pendapatan dan gaji yang berasal dari order yang sudah terverifikasi.
- Tutup Buku menampilkan peringatan bila masih ada order dalam periode yang belum selesai.
- Mutasi FH menampilkan jumlah potensi bagian karyawan dan jumlah yang sudah masuk Gaji.
- Mode demo menyimpan perubahan status pekerjaan di browser agar bisa dicoba tanpa database.

## Alur paling sederhana

Pesanan → Mutasi FH → Selesai & Masuk Gaji → Gaji → Keuangan → Tutup Buku → Excel.

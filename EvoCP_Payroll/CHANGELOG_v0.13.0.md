# Changelog v0.13.0

## Mutasi status
- Mutasi FH sekarang memiliki empat aksi status sederhana: **Proses**, **Dikerjakan**, **Bermasalah**, dan **Pesanan ini selesai**.
- Hanya **Pesanan ini selesai** yang mengubah order menjadi `verified` dan membuatnya masuk ke Payroll/Gaji.
- Untuk order Gold/Item, stok Gudang baru benar-benar dikeluarkan ketika pesanan ditandai selesai.
- Setelah order selesai dan masuk Gaji, status selesai dikunci di demo untuk mencegah perubahan payroll tanpa sengaja.

## Mulai dari nol
- Data contoh Karyawan dihapus.
- Data contoh Pesanan/Mutasi FH dihapus.
- Data contoh Mutasi Bandar dihapus.
- Data contoh Stok/Gudang dihapus karena terhubung ke karyawan lama.
- Data contoh Kasbon dan penyesuaian gaji per karyawan lama dihapus.
- Masalah keuangan contoh lama dihapus dari tampilan demo.
- LocalStorage memakai versi baru sehingga data demo v0.12 dan sebelumnya tidak ikut terbaca.
- Kode order baru kembali mulai dari **EG1** pada data kosong.

## Database scaffold
- `supabase/seed.sql` tidak lagi membuat contoh karyawan. Organisasi, FH, permission, role, dan contoh katalog game tetap dapat diseed sebagai data konfigurasi.

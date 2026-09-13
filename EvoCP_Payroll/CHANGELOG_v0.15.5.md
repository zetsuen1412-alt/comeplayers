# v0.15.5 — Total Penghasilan Stok Keluar Gold

- Export **Stok Keluar Gold** sekarang menghitung **Gold × Rate** untuk setiap transaksi.
- Menambahkan kolom **TOTAL PENGHASILAN** tepat di sebelah kanan **TOTAL GOLD**.
- TOTAL PENGHASILAN per karyawan menjumlahkan nilai Gold × Rate dari seluruh tanggal pada periode export.
- Baris **TOTAL** paling bawah juga menampilkan total penghasilan seluruh karyawan.
- Jika satu karyawan memiliki beberapa stok keluar pada tanggal yang sama dengan rate berbeda, kolom RATE harian tetap memakai rate rata-rata tertimbang, sedangkan TOTAL PENGHASILAN memakai jumlah nilai transaksi yang sebenarnya.
- Perubahan ini hanya berlaku untuk **Stok Keluar Gold**. Stok Masuk dan Item tetap mengikuti format sebelumnya.

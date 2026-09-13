# v0.15.1 — Stok Masuk / Stok Keluar

- Menghapus input dan tampilan **Modal rata-rata / unit** dari menu Stok / Gudang.
- Menambahkan tiga tampilan: **Stok Saat Ini**, **Stok Masuk**, dan **Stok Keluar**.
- Stok Masuk otomatis dicatat ketika admin menambahkan stok.
- Stok Keluar otomatis dicatat ketika order Gold/Item ditandai selesai.
- Tampilan Stok Masuk/Keluar memakai tabel harian horizontal: karyawan/item sebagai baris dan tanggal sebagai kolom.
- Pada Stok Keluar, kolom **Jumlah Gold/Item** dan **Rate order** tampil berdampingan untuk setiap tanggal.
- Filter Game dan Jenis (Gold/Item) berlaku untuk Stok Saat Ini, Stok Masuk, Stok Keluar, dan export Excel.
- Export Excel Stok tidak lagi menampilkan Modal rata-rata atau Nilai stok.
- Menambahkan export khusus Stok Masuk dan Stok Keluar.
- Menambahkan scaffold database `sale_rate_minor` pada ledger inventory movement untuk snapshot rate penjualan order.

# CP-OFS v0.10.0 — Jenis Order & Gudang Karyawan

- Tambah `Jenis Order`: Gold, Item, Boosting.
- Gold dan Item wajib mengambil stok dari Gudang sebelum pesanan bisa disimpan.
- Satu order Gold/Item dapat mengambil stok dari beberapa lokasi/karyawan.
- Jumlah stok yang diambil harus sama persis dengan jumlah order.
- Simpan diblokir jika stok kurang, stok berlebih, game tidak cocok, atau stok yang sama dipilih dua kali.
- Gudang kini menyimpan lokasi, karyawan pemegang stok, FH otomatis, jenis Gold/Item, game, nama Gold/Item, stok, dipesan, tersedia, dan modal rata-rata.
- Tambah form `+ Tambah Stok / Lokasi` di halaman Stok / Gudang.
- Saat Gold/Item disimpan, stok dicadangkan. Saat order selesai, stok keluar dari gudang.
- Pesanan, Mutasi FH, detail order, dan Excel Tutup Buku menampilkan informasi jenis order dan stok gudang.
- Excel Tutup Buku menambah sheet `STOK GUDANG`.
- Tambah migration Supabase untuk order type, pemegang lokasi gudang, dan validasi reservasi stok.

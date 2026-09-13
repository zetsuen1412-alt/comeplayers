# CP-OFS v0.11.0

Perubahan utama:

- Menu **Karyawan** sekarang memiliki tombol **+ Tambah Karyawan**.
- Karyawan baru cukup mengisi nama dan FH. Kode karyawan dibuat otomatis.
- Karyawan yang ditambahkan langsung tersedia di form Pesanan dan Stok/Gudang pada Mode Contoh.
- Ditambahkan menu baru **Produk / Game**.
- Produk/Game menyimpan kode game, nama game, nama pencarian lain, Region, dan Server.
- Kolom Game di Pesanan berubah menjadi pencarian dengan rekomendasi. Game tidak dapat disimpan sebagai teks bebas.
- Region dan Server di Pesanan hanya dapat dipilih dari game yang sudah dipilih.
- Jika Jenis Order = **Gold**, kolom Nama Order disembunyikan dan tidak diwajibkan.
- Gold/Item wajib mengambil stok Gudang dengan Game + Region + Server yang sama.
- Stok/Gudang sekarang juga menyimpan Region dan Server.
- Region dan Server ikut muncul pada Pesanan, Mutasi, detail Pesanan, dan export Excel.
- Ditambahkan migration Supabase untuk employee creation, Product/Game catalog, Region/Server, dan validasi relasi.

Alur sederhana:

Karyawan + Produk/Game → Gudang → Pesanan → Mutasi → Gaji → Keuangan → Tutup Buku → Excel

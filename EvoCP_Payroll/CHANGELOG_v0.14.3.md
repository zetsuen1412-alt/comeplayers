# v0.14.3 — Waktu Closing + Kunci Sistem

- Closing sekarang memakai **tanggal dan jam** (`datetime-local`) untuk waktu awal dan akhir.
- Ditambahkan tombol **Kunci Periode** sebelum Closing.
- Tombol **Closing dinonaktifkan** sampai periode dikunci.
- Selama periode terkunci, seluruh halaman admin selain Tutup Buku menjadi **read-only**: input, select, textarea, dan tombol edit dinonaktifkan.
- Sidebar menampilkan status **SISTEM DIKUNCI** beserta rentang waktunya.
- Ditambahkan tombol **Buka Kunci** untuk mengaktifkan edit kembali.
- Closing berhasil tidak otomatis membuka kunci; admin memutuskan kapan kunci dibuka.
- Riwayat Closing menyimpan dan menampilkan rentang sampai menit.
- Scaffold Supabase menambahkan tabel lock organisasi agar versi production dapat menerapkan lock yang sama untuk semua user/account, bukan hanya browser demo.
- Panduan diperbarui mengikuti alur: pilih waktu → kunci → closing → buka kunci.

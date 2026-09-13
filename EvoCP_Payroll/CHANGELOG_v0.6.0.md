# Changelog v0.6.0

## Tambah Pesanan mengikuti MUTASI FH

- Form Tambah Pesanan sekarang berisi Hari/Tanggal, Kode, Gate, Buyer, Nama Order, Booster/Karyawan, FH, Game, Proses, Jumlah, Rate, dan Pembagian.
- FH otomatis mengikuti karyawan yang dipilih.
- Total order otomatis = Jumlah × Rate.
- Bagian karyawan dan perusahaan dihitung langsung.
- Pembagian dapat diatur per order; tersedia tombol cepat 25%, 40%, 50%, dan 60%.
- Tombol **Simpan Pesanan & Buat Mutasi** menyimpan data demo di browser.
- Pesanan yang disimpan otomatis muncul di menu **Pesanan** dan **Mutasi FH** tanpa input ulang.
- Pesanan tambahan ikut terbaca saat membuat Excel Tutup Buku pada periode yang sesuai.
- Detail pesanan tambahan dapat dibuka dari menu Pesanan/Mutasi.

## Catatan Mode Contoh

Data yang Anda tambah masih disimpan di localStorage browser agar aplikasi dapat dicoba tanpa database. Integrasi Supabase/production dilakukan saat source ComePlayers asli tersedia.

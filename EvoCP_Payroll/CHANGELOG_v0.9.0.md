# CHANGELOG v0.9.0

## Tambah Pesanan dibuat lebih otomatis dan aman

- Hari/tanggal order tidak lagi diketik manual; aplikasi mengambil waktu dari endpoint waktu server.
- Kode order dibuat otomatis dengan urutan:
  - `EG1` sampai `EG9999`
  - lanjut `EGA0001` sampai `EGA9999`
  - lanjut `EGB0001` dan seterusnya sampai `EGZ9999`.
- Label **Gate** dihapus dari antarmuka; sekarang hanya memakai istilah **Sumber**.
- Pilihan sumber ditambah: G2G, ComePlayers, Direct, Telegram, OverGear, FunPay, PlayerAuction, dan Lainnya.
- Satu pesanan dapat mempunyai beberapa karyawan.
- Setiap karyawan mempunyai FH otomatis, proses sendiri, dan jumlah pekerjaan sendiri.
- Sistem menjumlahkan pembagian kuantitas semua karyawan.
- Jika total pembagian lebih besar atau lebih kecil dari jumlah order, pesanan tidak dapat disimpan.
- Contoh valid: order 5000, pembagian 1000 + 1500 + 2500 = 5000.
- Contoh ditolak: order 5000, pembagian 2000 + 2000 + 2000 = 6000.
- Karyawan yang sama tidak dapat dimasukkan dua kali pada order yang sama di form demo.
- Mutasi, detail pesanan, payroll, pemeriksa AI, dan export Excel diperbarui untuk membaca beberapa karyawan.
- Excel Mutasi FH menghasilkan satu baris per karyawan/alokasi agar jumlah pekerjaan dan pendapatan masing-masing dapat dilacak.

## Database scaffold

Ditambahkan migration `202609100004_multi_worker_order_code.sql`:
- sequence kode order per organisasi yang atomik,
- fungsi pembentuk kode EG,
- `process_snapshot` pada `order_allocations`,
- trigger pencegah over-allocation,
- fungsi validasi bahwa total allocation harus sama persis dengan quantity order item sebelum konfirmasi.

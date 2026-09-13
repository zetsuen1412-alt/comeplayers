# Referensi Spreadsheet EVO GAMING 2026

Versi v0.5.0 menggunakan file `EVO GAMING 2026(1).xlsx` sebagai referensi alur kerja bisnis.

## Mapping sederhana

| Spreadsheet lama | Aplikasi baru |
|---|---|
| MUTASI FH | Mutasi → Mutasi FH |
| MUTASI BANDAR | Mutasi → Mutasi Bandar |
| INCOME | Pendapatan otomatis dari Mutasi FH; tidak perlu input ulang |
| PAYROLL-1 | Gaji → FH1 |
| PAYROLL-2 | Gaji → FH2 |
| PAYROLL-3 | Gaji → FH3 |
| DB CLOSING | Keuangan → Tutup Buku |
| GUDANG ... | Stok / Gudang |
| Sheet game ($) | Referensi game dan stok/pergerakan khusus game |

## Kolom Mutasi FH yang dipertahankan

- Hari & tanggal
- Kode
- Gate
- Nama buyer
- Nama order
- Booster/karyawan
- FH
- Status
- Game
- Proses
- Jumlah
- Rate
- Total
- Status transfer
- Pembagian karyawan

## Kolom Mutasi Bandar yang dipertahankan

- Hari & tanggal
- Code
- Gate
- Nama buyer
- Nama order
- FH
- Seller/Vendor
- Game
- Proses
- Jumlah
- Rate jual
- Total jual
- Rate vendor
- Total bayar vendor
- Profit
- Status transfer

## Perbedaan penting dari spreadsheet lama

1. INCOME tidak diketik manual lagi.
2. Pembagian karyawan disimpan per order.
3. Gaji dapat difilter FH1/FH2/FH3 tanpa tiga halaman terpisah.
4. Tutup buku memakai tanggal/periode, bukan range baris Excel.
5. Excel hasil Tutup Buku berisi: RINGKASAN, MUTASI FH, MUTASI BANDAR, PENDAPATAN, GAJI FH1, GAJI FH2, GAJI FH3, MASALAH.
6. Data akun/password dari sheet AKUN JUALAN tidak disalin ke laporan atau demo.

# CHANGELOG v0.12.0

## Gaji lebih sederhana
- Menghapus persentase karyawan dari form Pesanan.
- Menambahkan satu persentase gaji global di menu Gaji.
- Menambahkan pilihan cepat 25%, 40%, 50%, dan 60%.
- Menambahkan Operasional Rp0/Rp25.000/Rp50.000.
- Menambahkan potongan Kasbon dan Denda.
- Menambahkan Bonus/Tips sebagai tambahan gaji.
- Menampilkan Gaji Bersih setelah seluruh penyesuaian.

## Kasbon
- Menambahkan menu Kasbon.
- Kasbon disimpan per karyawan.
- Saldo kasbon aktif otomatis muncul sebagai potongan di Gaji.
- Jika saldo kasbon lebih besar daripada gaji yang tersedia, tampilan menyisakan saldo untuk dibawa ke periode berikutnya.

## Karyawan
- Menambahkan status NEW, SHIFT, FULL, SAKIT, IJIN, RESIGN.
- Status dapat diubah kapan saja.
- Status otomatis tampil di menu Gaji.
- Karyawan RESIGN tidak tersedia untuk order baru atau kasbon baru.

## Database scaffold
- Menambahkan migration `202609100007_payroll_status_kasbon.sql`.
- Menyiapkan status karyawan, pengaturan persentase global, penyesuaian payroll, dan employee advances/kasbon.

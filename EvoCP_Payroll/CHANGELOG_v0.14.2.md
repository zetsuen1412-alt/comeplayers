# v0.14.2 — Edit Mutasi + History Perubahan

## Baru
- Mutasi dapat diedit dari tombol **Edit Mutasi**, termasuk setelah order berstatus Selesai.
- Order yang sudah Closing juga tetap dapat dikoreksi; history memberi label khusus **EDIT SETELAH CLOSING**.
- Menu baru **History Perubahan** di sidebar.
- History menyimpan waktu edit, kode order, alasan, status order saat edit, dan daftar nilai sebelum → sesudah.
- Untuk order yang sudah selesai, alasan perubahan wajib diisi.
- Field edit: Sumber, Buyer, Nama Order (non-Gold), Jumlah (jika tidak terkunci stok), Rate, dan proses/jumlah karyawan yang aman diedit.
- Order Gold/Item yang sudah terkait alokasi stok menjaga jumlah tetap terkunci agar stok tidak rusak.
- Setelah Closing, edit tidak menghitung ulang payroll periode lama secara diam-diam; history menjadi catatan koreksi.
- Panduan diperbarui.

## Database scaffold
- Migration `202609110002_mutation_edit_history.sql` menambahkan tabel append-only `mutation_edit_history` dengan RLS.

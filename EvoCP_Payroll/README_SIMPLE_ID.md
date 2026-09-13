# Panduan Singkat EVO COMEPLAYERS v0.14.3

## Urutan paling mudah

**1. Karyawan**  
Tambah nama + bagian (FH1/FH2/FH3/ADMIN/BANDAR) + status.

**2. Produk / Game**  
Tambah Game, Region, dan Server yang boleh dipilih.

**3. Stok / Gudang**  
Khusus Gold/Item. Stok dicatat per karyawan, FH, Game, Region, dan Server. Klik filter Game seperti **GW2** untuk melihat stok GW2 saja.

**4. Pesanan**  
Buat order. Untuk Boosting, order jumlah 1 boleh dibagi ke beberapa karyawan dan nilai order dibagi rata otomatis. Untuk Gold/Item, jumlah dan stok harus cocok.

**5. Mutasi**  
Semua sumber berada di **satu Mutasi**. Cari kode order, pilih Sumber, dan pilih periode. Tidak ada lagi Mutasi Bandar terpisah.

**6. Gaji**  
Jika order sudah selesai, order masuk daftar Gaji. Klik **Perlihatkan** untuk melihat order selesai milik karyawan. Persentase gaji diatur per karyawan, lalu dihitung bersama Operasional, Kasbon, Denda, dan Bonus/Tips.

**7. Kunci & Closing**  
Pilih **tanggal + jam** awal dan akhir. Klik **Kunci Periode**. Saat terkunci semua user hanya bisa membaca data. Setelah terkunci tombol **Closing** aktif. Order selesai masuk gajian, order bermasalah ditunda. Setelah selesai, klik **Buka Kunci** bila ingin mengedit lagi.

**8. Excel**  
Download laporan Closing. Di dalamnya ada ringkasan per Sumber, Mutasi, pendapatan, gaji FH1/FH2/FH3/ADMIN/BANDAR, order ditunda, dan stok.

## Warna

- 🟢 **Hijau:** selesai / sudah masuk gajian.
- 🔴 **Merah:** bermasalah / ditunda.
- Gaji Bersih **minus** tampil merah.

## Contoh Boosting

Order: **1**  
Harga: **Rp10.000**  
Karyawan: **2 orang**

Hasil:
- Karyawan A nilai kerja Rp5.000
- Karyawan B nilai kerja Rp5.000
- Mutasi tetap mencatat **1 order**

Persentase gaji kemudian diterapkan masing-masing di menu Gaji.


## v0.14.2 — Edit Mutasi & History Perubahan
- Mutasi bisa diedit walaupun order sudah selesai.
- Edit order selesai wajib menyertakan alasan.
- Menu **History Perubahan** menyimpan data sebelum → sesudah, waktu edit, alasan, dan penanda edit setelah Selesai/Closing.
- Edit setelah Closing tidak menghitung ulang payroll lama secara otomatis; history menjadi catatan koreksi.


## v0.14.3 — Kunci sebelum Tutup Buku
- Closing dapat diatur sampai jam dan menit.
- Urutan wajib: **Pilih waktu → Kunci Periode → Closing**.
- Selama terkunci, semua halaman edit menjadi read-only.
- Closing tidak dapat ditekan jika sistem belum dikunci.
- Kunci tidak otomatis dibuka setelah Closing; buka manual lewat menu Tutup Buku.


## v0.14.4 — Export Spreadsheet
- Menu baru **Export Spreadsheet** untuk menyimpan snapshot seluruh data operasional ke satu file Excel.
- Sheet: **RINGKASAN, MUTASI, STOK, PENJUALAN, PAYROLL GAJI, TUTUP BUKU, KARYAWAN**.
- Export tetap dapat digunakan saat sistem dikunci karena tidak mengubah data.
- Export Mutasi dan Excel Closing per periode tetap tersedia.


## v0.14.5 — Export per menu
Setiap menu utama memiliki tombol Export Excel sendiri. Spreadsheet yang dihasilkan hanya berisi data yang sedang difilter. Contoh: di Mutasi pilih G2G + 1–7 September lalu Export; Excel hanya berisi Mutasi G2G pada tanggal tersebut.

## v0.14.7 — Export Excel Rapih

Seluruh tombol Export sekarang menghasilkan spreadsheet yang lebih rapih dengan gaya yang mengikuti referensi `EVO GAMING 2026`: judul hitam, header berwarna, border tabel, format Rupiah, status berwarna, lebar kolom yang sesuai, AutoFilter, serta informasi filter/periode di bagian atas file. Format ini berlaku untuk Mutasi, Penjualan/Pesanan, Stok, Gaji, Karyawan, Closing, dan Export Semua Data.


### Update v0.14.8
- Tambahan bagian **BANDAR**.
- Di Gaji pilih Semua/FH1/FH2/FH3/ADMIN/BANDAR. Judul Excel Gaji ikut bagian yang dipilih.
- Di Penjualan tersedia filter Sumber, Jenis, Buyer, Game, tanggal, kode order, serta pilihan sortir. Export Excel mengikuti hasil yang sedang tampil.

## v0.14.9 — Export Detail + Filter Mutasi + Pesanan Langsung Form
- Export Penjualan dan Mutasi sekarang menaruh **ringkasan di atas dan tabel detail hasil filter di bawah pada sheet yang sama**, jadi data tidak perlu dicari di tab lain.
- Mutasi memiliki filter **Periode, Sumber, Jenis, Buyer, Game, kode order, dan Sortir/Urutan**. Export mengikuti seluruh filter dan urutan tersebut.
- Menu **Pesanan** sekarang langsung membuka form **Tambah Pesanan** dan tidak lagi menampilkan tabel daftar pesanan.
- Panduan diperbarui.



## v0.15.0 — Stok Terjual
Menu Stok / Gudang sekarang menampilkan **Stok terjual**. Nilai ini bertambah saat order Gold/Item selesai, bukan saat baru dicadangkan. Export Excel Stok dan Closing ikut membawa kolom tersebut.


## Update v0.15.1 — Stok Masuk / Stok Keluar

Menu Stok / Gudang sekarang memiliki tab Stok Saat Ini, Stok Masuk, dan Stok Keluar. Stok Masuk dicatat saat stok ditambahkan; Stok Keluar dicatat otomatis saat order Gold/Item selesai. Tabel riwayat menggunakan tanggal sebagai kolom dan karyawan/item sebagai baris. Untuk Stok Keluar, jumlah dan rate order tampil berdampingan. Input Modal rata-rata / unit dihapus.


## Perubahan v0.15.3
Stok **Gold** tidak memakai Nama Gold/Item dan Lokasi Gudang. Gold cukup dibedakan berdasarkan Game, Region, Server, Karyawan/FH, dan jumlah stok. Stok **Item** tetap memakai Nama Item dan Lokasi Gudang.


## v0.15.3 — Gudang per Karyawan
- Lokasi Gudang dihapus untuk Gold dan Item.
- Identitas gudang cukup nama karyawan + FH.
- Filter Karyawan ditambahkan di Stok / Gudang dan ikut berlaku pada Export.
- Item tetap menyimpan Nama Item, Game, Region, Server, karyawan, FH, dan jumlah.


## v0.15.4 — Export Stok Masuk Harian
Export Stok Masuk kini berbentuk matriks: Kode Karyawan → Nama → FH → Region → tanggal-tanggal → Total Gold. Nama Game/Produk tampil pada judul paling atas. Jika beberapa Game/Produk ikut terfilter, masing-masing dibuat pada sheet terpisah.

## v0.15.5 — Total Penghasilan Stok Keluar Gold
Khusus export **Stok Keluar Gold**, spreadsheet memiliki kolom **TOTAL PENGHASILAN** di sebelah kanan **TOTAL GOLD**. Nilainya dihitung dari `Gold × Rate` untuk setiap stok keluar dan dijumlahkan per karyawan. Baris TOTAL paling bawah juga menampilkan total penghasilan seluruh karyawan.

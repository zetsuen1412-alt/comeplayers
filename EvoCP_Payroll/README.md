# EVO COMEPLAYERS — CP-OFS Simple Indonesia v0.14.3

CP-OFS adalah prototype aplikasi internal **EVO COMEPLAYERS** untuk menggantikan alur spreadsheet `EVO GAMING 2026(1).xlsx` secara bertahap. Fokus versi ini adalah alur yang sederhana: data ditulis sekali, Mutasi menjadi satu pusat aktivitas, Gaji dihitung per karyawan, dan Closing dilakukan manual.

### Bagian karyawan
Pilihan bagian karyawan tersedia: **FH1, FH2, FH3, ADMIN, BANDAR**. Nilai ini ikut ke Pesanan, Mutasi, Gudang, Kasbon, Gaji, dan export Closing.

## Jalankan

1. Extract ZIP.
2. Jalankan `RUN_ME_FIRST.bat`.
3. Buka browser ke `http://localhost:3000` bila tidak terbuka otomatis.
4. Gunakan menu **Panduan** bila ingin mengikuti alur dari awal.

## Alur utama

`Karyawan → Produk/Game → Stok/Gudang → Pesanan → Mutasi → Gaji/Kasbon → Closing → Excel`

## Perubahan utama v0.14.3

- Brand antarmuka menjadi **EVO COMEPLAYERS** dan tanda demo menjadi **DEMO!**.
- **Mutasi Bandar dihapus.** Semua order berada di satu menu **Mutasi** dan dibedakan berdasarkan **Sumber**.
- Mutasi dapat dicari berdasarkan **kode order** dan difilter: Semua, Hari ini, 7 hari, Bulan ini, atau tanggal bebas.
- Mutasi dapat difilter berdasarkan Sumber seperti G2G, ComePlayers, OverGear, FunPay, PlayerAuction, dan sumber lain yang dipakai di order.
- Ringkasan Mutasi menampilkan **jumlah order dan total nilai per Sumber** untuk periode yang dipilih.
- Status Mutasi: Proses, Dikerjakan, Bermasalah, dan Pesanan ini selesai.
- Order **Bermasalah** berwarna merah. Order yang sudah masuk Closing/Gaji berwarna hijau dan dikunci dari gajian berikutnya.
- **Boosting:** order jumlah 1 tetap dapat dikerjakan beberapa karyawan. Harga order dibagi rata otomatis. Contoh Rp10.000 dengan 2 karyawan = nilai kerja Rp5.000 per karyawan, tetapi tetap satu order di Mutasi.
- **Gold/Item:** pembagian jumlah tetap harus sama persis dengan jumlah order dan stok Gudang wajib cocok.
- Persentase gaji sekarang **per karyawan**, bukan global. Misalnya Ari 40%, Budi 50%, Citra 60%.
- Menu Gaji memakai tombol **Perlihatkan (N)** untuk melihat daftar order selesai per karyawan.
- Gaji Bersih dapat minus dan tampil merah.
- Komponen payroll: Persentase, Operasional Rp0/Rp25.000/Rp50.000, Kasbon, Denda, Bonus/Tips.
- **Closing sepenuhnya manual:** pilih tanggal **dan jam** awal/akhir, lalu **Kunci Periode**. Tombol Closing hanya aktif ketika sistem terkunci.
- Hanya order Selesai yang masuk Closing. Order Bermasalah ditunda dan baru dapat masuk gajian berikutnya setelah diselesaikan.
- Closing menyimpan penanda pada order agar order yang sudah digaji **tidak masuk lagi** ke gajian berikutnya.
- Closing dan Mutasi mempunyai **Ringkasan Sumber**.
- Stok/Gudang dapat difilter berdasarkan **Game** serta Gold/Item.
- Panduan telah diperbarui agar mengikuti alur baru.

## Excel

Download Mutasi menghasilkan:
- `RINGKASAN SUMBER`
- `MUTASI`

Download Closing menghasilkan:
- `RINGKASAN`
- `RINGKASAN SUMBER`
- `MUTASI`
- `PENDAPATAN`
- `GAJI FH1`
- `GAJI FH2`
- `GAJI FH3`
- `GAJI ADMIN`
- `GAJI BANDAR`
- `DITUNDA`
- `STOK GUDANG`
- `MASALAH`

Satu order tetap satu baris di sheet `MUTASI`. Jika satu order dikerjakan beberapa karyawan, nama dan nilai kerja masing-masing karyawan disimpan dalam order yang sama.

## Tentang DEMO

Versi ini masih **standalone demo**. Data operasional disimpan di localStorage browser. Folder `supabase/migrations` adalah scaffold untuk integrasi production dan belum berarti aplikasi ini sudah terhubung ke database ComePlayers asli.

File spreadsheet referensi dan data kredensial tidak dibundel ke project.

## Pemeriksaan

Gunakan:

```bash
npm install
npm test
npm run verify
npm run dev
```

`npm run verify` memeriksa struktur file penting. Runtime penuh tetap harus diuji setelah dependency berhasil dipasang.


## v0.14.2 — Edit Mutasi & History Perubahan
- Mutasi bisa diedit walaupun order sudah selesai.
- Edit order selesai wajib menyertakan alasan.
- Menu **History Perubahan** menyimpan data sebelum → sesudah, waktu edit, alasan, dan penanda edit setelah Selesai/Closing.
- Edit setelah Closing tidak menghitung ulang payroll lama secara otomatis; history menjadi catatan koreksi.


## v0.14.3 — Kunci Sistem sebelum Closing
- Pilih tanggal + jam awal/akhir Closing.
- Klik **Kunci Periode** sebelum Closing.
- Saat terkunci, semua halaman admin selain Tutup Buku menjadi read-only untuk mencegah perubahan data saat payroll/closing diperiksa.
- Klik **Buka Kunci** untuk mengizinkan edit kembali.
- Pada demo, lock disimpan di browser. Scaffold Supabase menyediakan struktur lock organisasi untuk production agar semua user/account mengikuti lock yang sama.


## v0.14.4 — Export Spreadsheet
- Menu baru **Export Spreadsheet** untuk menyimpan snapshot seluruh data operasional ke satu file Excel.
- Sheet: **RINGKASAN, MUTASI, STOK, PENJUALAN, PAYROLL GAJI, TUTUP BUKU, KARYAWAN**.
- Export tetap dapat digunakan saat sistem dikunci karena tidak mengubah data.
- Export Mutasi dan Excel Closing per periode tetap tersedia.

## v0.14.6 — Penjualan
Menu **Penjualan** menampilkan total nilai penjualan berdasarkan filter periode, sumber, dan kode order. Hasil yang sedang terlihat juga dapat diexport langsung ke Excel.

## v0.14.7 — Export Excel Rapih

Seluruh tombol Export sekarang menghasilkan spreadsheet yang lebih rapih dengan gaya yang mengikuti referensi `EVO GAMING 2026`: judul hitam, header berwarna, border tabel, format Rupiah, status berwarna, lebar kolom yang sesuai, AutoFilter, serta informasi filter/periode di bagian atas file. Format ini berlaku untuk Mutasi, Penjualan/Pesanan, Stok, Gaji, Karyawan, Closing, dan Export Semua Data.


## v0.14.8 — BANDAR + Filter Penjualan Lengkap
- Bagian/FH sekarang memiliki 5 pilihan: **FH1, FH2, FH3, ADMIN, BANDAR**.
- Menu Gaji memiliki filter BANDAR dan export Payroll ikut filter bagian yang dipilih.
- Judul export Gaji otomatis menjadi `EVO COMEPLAYERS — PAYROLL GAJI FH 1/FH 2/FH 3/ADMIN/BANDAR` bila satu bagian dipilih; jika **Semua**, judul tetap `EVO COMEPLAYERS — PAYROLL GAJI`.
- Menu Penjualan dapat difilter berdasarkan **Sumber, Jenis, Buyer, Game, kode order, dan periode**.
- Penjualan dapat disortir berdasarkan terbaru, terlama, nilai terbesar/terkecil, Sumber A-Z, Buyer A-Z, atau Game A-Z.
- Export Penjualan menggunakan data yang sedang tampil setelah seluruh filter dan sortir diterapkan.

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

### v0.15.5 — Gold stock-out income total
Gold stock-out matrix exports now append **TOTAL PENGHASILAN** immediately after **TOTAL GOLD**. The value is the exact sum of `quantity × rateMinor` for all matching stock-out movements per employee, with a grand total on the final row. Daily RATE cells remain quantity-weighted averages when multiple rates exist on the same day.

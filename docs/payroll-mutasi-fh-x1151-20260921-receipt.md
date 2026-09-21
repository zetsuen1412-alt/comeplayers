# MUTASI FH import X1151 → X2674 — 21 September 2026

## Sumber dan cakupan

Sumber produksi adalah workbook pengguna `EVO GAMING 2026 (3).xlsx`, sheet `MUTASI FH`, SHA-256 `b1c611bd3cc4be25d198b0bc1a74f0a41896ad54e503cacc3a7ed2f31971adc5`.

Cakupan mengikuti **posisi baris spreadsheet**, dimulai dari row 4178 / kode **X1151** (08/09/2026 01:42:22 WIB) dan diteruskan ke bawah sampai row 4849 / kode **X2674** (21/09/2026 10:42:35 WIB). Karena cakupan mengikuti urutan baris, timestamp yang tertulis pada beberapa baris sesudah X1151 tetap dipertahankan apa adanya walaupun lebih awal dari timestamp X1151.

## Aturan pemetaan yang diterapkan

- `GATE` → Sumber.
- `NAMA BUYER` → Nama pembeli.
- `NAMA ORDER` → Nama pesanan.
- `BOOSTER` → Karyawan.
- `JUMLAH` → Jumlah pesanan.
- `STATUS` **tidak** mengganti Nama pesanan.
- Bila sel `BOOSTER` berwarna hitam/HITAM, `STATUS` dibaca sebagai daftar karyawan dan jumlah yang dikerjakan. Angka di belakang nama karyawan dicocokkan terhadap `JUMLAH`.
- Nama karyawan yang tidak dapat dicocokkan dengan roster produksi tidak dibuat secara fiktif; pesanan ditandai perlu diperiksa.

Contoh X2137 tetap satu pesanan 16M dengan pembagian PERMANA 2M + FARDAN 5M + FERDI 4M + DIO 3M + DANDA 2M = 16M.

## Hasil produksi

- Baris kode sumber dalam cakupan: **659**.
- Pesanan yang dimasukkan: **654**.
- Total nilai pesanan: **Rp217.962.386**.
- Pesanan yang ditandai perlu diperiksa: **174**.
- Baris BOOSTER hitam pada sumber: **202**.
- Baris lengkap dengan BOOSTER hitam yang menjadi pesanan: **199**.
- Baris dengan tanggal yang dipulihkan dari arsip sebelumnya: row **4275, 4342, 4664, 4716**.
- Workspace payroll berubah dari revision **13** ke **14**.

Lima baris tidak dijadikan pesanan karena data kuantitas/nilai belum lengkap: **X2205, X2285, X2380, X2398, X2479**. Nilai yang hilang tidak ditebak.

## Keamanan operasional

Impor ini tidak menjalankan pembayaran gaji, tidak menjalankan Tutup Buku/Closing, tidak mengubah stok gudang, dan tidak otomatis memverifikasi pesanan untuk payroll. Seluruh pesanan hasil impor berada pada status finance `under_review` sampai ditinjau sesuai kebutuhan operasional.

Receipt produksi disimpan sebagai batch `mutasi-fh-b1c611bd-from-x1151-v5` dengan revision akhir 14.

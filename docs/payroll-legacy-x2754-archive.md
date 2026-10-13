# Migrasi arsip MUTASI FH sebelum KODE X2754

## Hasil pemeriksaan workbook
Berkas yang diberikan admin pada 13 Oktober 2026 berisi:
- `MUTASI FH!B5848 = X2754`; tanggal pada kolom A **06/10/2026 01.15 WIB**; status transfer N5848 **DELIVERED**.
- `MUTASI FH!B5849 = X3085`; status transfer **PENDING**.
- Dari baris 3–5847 ada **5.687 baris yang mempunyai KODE**, dengan 4.414 kode berbeda, karena KODE paket harian dapat muncul berulang. Baris 5847 adalah baris subtotal/kalkulasi, bukan transaksi.
- Buku baru dimulai **inklusif baris 5848**, bukan dengan membandingkan angka pada KODE; KODE setelahnya dapat tidak berurutan.

## Pengertian penting

**Arsip periode lama** di Data Pembukuan tidak sama dengan mengeksekusi Closing payroll baru. Berdasarkan konfirmasi admin bahwa riwayat sebelum X2754 sudah ditutup, baris historis diimpor secara **baca-saja** dan dikeluarkan dari Mutasi Aktif dan perhitungan Gaji. Snapshot Closing yang benar-benar tercatat secara finansial tetap berada di bagian Tutup Buku. Proses ini **tidak membuat tagihan atau gaji baru, tidak mengurangi Kasbon, tidak mengubah snapshot Closing lama dan tidak menghapus baris Google Sheet**.

Pemisahan baris per sumber, bukan per KODE, agar nama pembeli, paket, karyawan, FH, game, proses, nilai, dan status transfer masing-masing DAY tetap dapat diperiksa.

## Mengaktifkan backfill di Apps Script (dibutuhkan satu kali)

Deployment website **tidak dapat mengganti Apps Script yang disimpan pada akun Google**. Setelah website ter-deploy dan backup disimpan:
1. Buka Google Sheets sumber `EVO GAMING 2026`, pilih **Extensions → Apps Script**. Gunakan akun pemasang sinkronisasi.
2. Cadangkan Script Properties dan kode lama; perbarui bagian payroll dengan `website/scripts/comeplayers-payroll-google-sheets.gs` dari branch `main`, tanpa menghapus skrip mirror yang masih digunakan.
3. Pastikan `CP_SPREADSHEET_ID` menunjuk ke workbook **sumber**, bukan mirror/target. Pastikan secret sync tetap disimpan aman di Script Properties.
4. Jalankan `activateComePlayersX2754LegacyArchive()` satu kali dengan izin pemilik Sheet. Fungsi memeriksa **B5848=X2754** dan **A5848=06/10/2026 01.15 WIB** sebelum mengaktifkan pengarsipan. Jika patokan baris berubah, fungsi akan **menolak** sinkronisasi; jangan memaksa.
5. Biarkan pemicu sinkronisasi berkala melanjutkan proses. Lebih dari 5.000 baris lama diproses dalam banyak batch hingga lengkap; angka di **Data Pembukuan → Arsip buku lama** akan bertambah. Uji X2754, X3085, dan satu kode lama sebelum menyatakan backfill selesai.
6. Pastikan angka arsip mendekati **5.687 baris berkode** sesuai file snapshot (mungkin berbeda jika sumber telah diubah setelah unggahan). Periksa KODE ganda dan nominal sampel, serta amati log **Apps Script → Executions**.

Untuk berhenti mengimpor riwayat lama tanpa mematikan sinkronisasi aktif, ubah `CP_LEGACY_BOOKKEEPING=false`; data yang sudah tersalin tetap ada di Data Pembukuan. Jangan menandai transaksi sebelum X2754 sebagai baru digaji hanya karena impor arsip berhasil.

## Aturan keamanan
- Baris historis `MUTASI FH` yang sumbernya **sebelum 5848** tidak masuk Mutasi Aktif atau Gaji, termasuk ketika `STATUS TRANSFER = DELIVERED`.
- X2754 pada **5848** dan baris berikutnya tetap menjadi Mutasi Aktif sampai benar-benar menjalani Closing. PENDING belum masuk gaji.
- Untuk paket multi-hari yang melintasi batas, hanya hari sebelum baris 5848 yang menjadi arsip lama; hari sesudahnya tetap aktif.
- Nama dan rate lama disimpan dalam snapshot data mutasi, bukan dihitung sebagai snapshot Gaji. Perubahan sumber berikutnya tidak menimpa snapshot arsip awal.
- Sinkronisasi menolak jika penanda X2754 bergeser atau tidak memiliki tanggal yang diharapkan.
- Pengarsipan source-batch menggunakan autentikasi yang sama dengan sinkronisasi payroll resmi.
- Halaman Mutasi Aktif menghapusnya **dari tampilan saja**; database dan Google Sheets tetap menyimpan data asal. Data Pembukuan menyajikan arsip dengan filter dan ekspor CSV.

## Periksa sebelum produksi
```sh
cd website
npm run typecheck
npx --no-install tsx --test tests/payroll-legacy-x2754-cutover.test.ts tests/payroll-transfer-cutover-conflicts.test.ts tests/payroll-google-sheet-sync.test.ts tests/payroll-google-sheet-daily.test.ts tests/payroll-final-workspace.test.ts
npm run build
```

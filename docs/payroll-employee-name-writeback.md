# Edit Nama Karyawan → Google Sheets (EVO GAMING 2026)

## Perilaku setelah aktivasi
1. Admin di **Karyawan** klik **Edit Nama** → **Simpan Perbaikan**.
2. Untuk karyawan yang berasal dari tab `PAYROLL-1`, `PAYROLL-2`, atau `PAYROLL-3`, website menyimpan **permintaan** (bukan mengganti nama secara sepihak).
3. Pada jadwal sinkronisasi sekitar setiap satu menit, Apps Script yang sudah diotorisasi pemilik Sheet mengambil permintaan melalui `GET /api/integrations/payroll-employee-renames` menggunakan secret sinkronisasi lama.
4. Apps Script memastikan **workbook sumber**, **tab PAYROLL**, **baris**, **header B2=NAMA**, **nama lama**, **tidak ada formula**, dan **tidak ada nama duplikat** cocok. Hanya sel nama di kolom B diubah. Tidak ada mutasi/gaji atau kolom lain yang ditulis.
5. Pembacaan roster melalui sinkronisasi existing mengonfirmasi nama baru; website menghapus tanda **Menunggu Sheet** tanpa mengganti kode/ID karyawan. Snapshots Closing dan riwayat lama tetap utuh.

Karyawan yang dibuat manual (tidak memiliki `sheetRosterSource`) bisa diperbaiki di website, tanpa dikirim ke Sheet.

## Langkah pemasangan Google — diperlukan satu kali

**Perubahan GitHub/Vercel TIDAK memperbarui skrip di Extensions → Apps Script secara otomatis.**

1. Pastikan fitur website sudah lulus pengujian dan dideploy.
2. Di workbook sumber **EVO GAMING 2026**, buka **Extensions → Apps Script** menggunakan akun Google yang memasang sinkronisasi. Cadangkan kode dan Script Properties sebelumnya.
3. Ganti kode Apps Script payroll menggunakan versi terbaru di `website/scripts/comeplayers-payroll-google-sheets.gs`, tanpa menghapus konfigurasi secret atau pemicu sinkronisasi yang berjalan.
4. Pastikan Script Properties: `CP_SYNC_ROSTER=true`, `CP_SPREADSHEET_ID` menunjuk ke **workbook sumber yang dapat diedit** (bukan mirror), dan `CP_SYNC_NAMESPACE_ID` sesuai identitas Sheet yang digunakan sinkronisasi website. Jika mirror terkonfigurasi, aktivasi menolak workbook yang tidak sama dengan `EGM_CONFIG.sourceId`.
5. Pastikan `PAYROLL-1/2/3` memiliki header `NAMA` di kolom **B2**, dan daftar nama di kolom **B mulai baris 3**. Pastikan kolom nama bukan formula hasil mirroring.
6. Jalankan fungsi **`activateComePlayersEmployeeNameWriteback()`** satu kali. Fungsi akan memeriksa sumber sebelum mengaktifkan `CP_ENABLE_EMPLOYEE_NAME_WRITEBACK=true` dan menjalankan sinkronisasi.
7. Uji memakai seorang karyawan uji yang sudah muncul di website: perbaiki namanya dan periksa kolom B pada baris sumber, lalu muat ulang halaman Karyawan dan pastikan status menunggu hilang. Jangan menguji dengan nama karyawan yang tidak bisa diverifikasi.

Jika belum diaktivasi, koreksi nama dari website akan tertahan sebagai **Menunggu Sheet**. Jangan menjanjikan sinkronisasi dua arah sudah aktif hanya karena deploy website sukses.

## Keselamatan dan troubleshooting

- Tidak pernah mencari karyawan hanya dari nama baru untuk menentukan sel yang ditulis. Baris yang berubah/bergeser ditolak bila nama sebelumnya tidak cocok. Pengelola harus memeriksa sumber secara manual; jangan paksa menulis.
- Sheet yang memiliki formula pada sel nama tidak ditimpa. Perubahan gagal atau konflik tidak menulis data gaji.
- Sistem menolak input nama kosong, duplikat dalam FH yang sama, nama mirip formula spreadsheet, dan koreksi kedua sebelum permintaan pertama terkonfirmasi.
- Jika request masih **Menunggu Sheet**, cek **Apps Script → Executions**, Script Properties, akun pemasang/pemicu, dan apakah nama lama pada sel sumber masih sama. Koreksi tidak boleh dilakukan dari dua tempat secara bersamaan.
- Untuk mematikan penulisan balik tanpa mematikan sinkronisasi mutasi, set `CP_ENABLE_EMPLOYEE_NAME_WRITEBACK=false` pada Script Properties. Sinkronisasi Sheet → website tetap berjalan.
- Script menjalankan `syncComePlayersPayroll()` setelah mencoba koreksi; readback menjadi konfirmasi tunggal yang boleh menghapus status menunggu.
- Admin website tidak diberikan Google OAuth token, dan secret sinkronisasi hanya dikirim dari Apps Script ke endpoint backend.
- Jika daftar karyawan memakai struktur sumber yang berbeda dari PAYROLL-1/2/3 kolom B, **jangan aktifkan** sebelum pemetaan aktual diperiksa.

## Pemeriksaan kode

Di direktori `website/`:

```sh
npm run typecheck
npx --no-install tsx --test tests/payroll-employee-name-correction.test.ts tests/payroll-google-sheet-roster.test.ts tests/payroll-google-sheet-script.test.ts tests/payroll-final-workspace.test.ts
npm run build
```

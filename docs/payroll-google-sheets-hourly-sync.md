# ComePlayers Payroll — sinkronisasi realtime + rekonsiliasi 1 menit

Nama file lama dipertahankan agar tautan tetap bekerja. Sinkronisasi per jam sudah diganti dengan dua trigger Google Apps Script. Ini bukan otomatisasi Codex dan tidak memakai token Codex.

Sinkronisasi ini menghubungkan workbook Google Sheets **EVO GAMING 2026** langsung ke workspace Payroll ComePlayers tanpa membuat spreadsheet menjadi publik.

## Alur

1. Google Apps Script terpasang pada workbook sumber.
2. Trigger **installable onEdit** menjalankan `onComePlayersPayrollEdit` ketika pengguna mengedit nilai di **MUTASI FH**. Satu edit mengirim baris tersebut; paste beberapa baris mengirim semua baris terdampak yang berubah. Event memakai rentang, bukan `event.value`, sehingga paste/clear didukung.
3. Trigger clock menjalankan `syncComePlayersPayroll` dengan `.timeBased().everyMinutes(1).create()`. Trigger ini membaca seluruh baris berkode dan mengirim hanya signature yang berubah/belum berhasil disinkronkan. Perubahan formula, warna BOOSTER, pengurutan, API/script, atau edit yang terlewat dipulihkan oleh rekonsiliasi.
4. Data dikirim ke endpoint privat `POST /api/integrations/payroll-sheet`.
5. Server memvalidasi secret, memastikan actor adalah akun ADMIN ComePlayers, memetakan karyawan/game, lalu menyimpan perubahan ke `cp_payroll_workspace` dengan revision guard dan audit yang sudah digunakan Payroll.

Installable onEdit memerlukan izin `UrlFetchApp`, sehingga jangan menggantinya dengan simple `onEdit`. Google menjalankan trigger memakai akun pemasangnya. Latensi mendekati realtime, bukan jaminan waktu satu detik; penjadwalan, kuota dan jaringan Google tetap berlaku. Komputer/Codex tidak perlu menyala.

## Lock, deduplikasi, dan pemulihan

- Kedua handler memakai `LockService.getScriptLock()`. Lock meliputi pembacaan, HTTP, dan penyimpanan signature serta selalu dilepas melalui `finally`.
- Jika lock sibuk, edit dilewati tanpa menandainya berhasil; rekonsiliasi berikutnya membaca ulang nilai terbaru. Tidak ada dua penulisan Apps Script bersamaan. Revision guard database tetap menangani penulisan dari admin atau project script lain.
- Signature SHA-256 (144 bit) mencakup header, nilai asli, tampilan, warna hitam BOOSTER, nomor baris, dan penanda duplikat. Signature disimpan dalam shard **Script Properties** (`CP_ROW_HASH_*`, 100 baris/shard), tidak di sel. Ini juga melakukan deduplikasi event edit berulang tanpa menunda edit pertama.
- Hanya acknowledgement API yang memperbarui cache. Baris berhasil/unchanged tidak dikirim lagi selama input sama. Baris protected/conflict/invalid yang tidak berubah diberi jeda retry **15 menit** agar order historis tidak diunggah berulang tiap menit. Perubahan isi langsung mengabaikan jeda tersebut. Kegagalan HTTP tidak menandai baris berhasil dan dicoba lagi oleh trigger berikutnya.
- Saat edit, hanya baris terdampak dibaca penuh. Kolom KODE saja dipindai untuk mendeteksi kode duplikat di luar rentang edit; seluruh spreadsheet tidak diunggah.
- Maksimal 100 baris/request, 10.000 baris data per sheet. Setelah sekitar 45 detik, batch berikutnya ditunda ke rekonsiliasi berikutnya; batch yang sudah diakui tidak diulang. Header default tetap baris 2, data mulai baris 3.
- Baris tanpa KODE tidak aktif. Signature baris kosong/dihapus dibersihkan saat rekonsiliasi, tetapi order di ComePlayers tidak dihapus.
- Cache memantau perubahan spreadsheet. Setelah perubahan master game/karyawan atau untuk rekonsiliasi paksa, jalankan `reinstallComePlayersPayrollRealtimeSync()` lalu `syncComePlayersPayroll()`; helper menghapus cache signature, bukan data payroll.

## Pemetaan

- Kolom tanggal/jam (A) → `orderedAt` dalam WIB.
- `KODE` → kode pesanan / external reference.
- `GATE` → sumber.
- `NAMA BUYER` → nama pembeli.
- `NAMA ORDER` → nama pesanan.
- `TASK` → task jika kolom tersedia.
- `BOOSTER` → karyawan jika cocok dengan kode/nama karyawan.
- `FH` → FH1/FH2/FH3/ADMIN/BANDAR.
- `GAME` / `GIM` → Produk / Game.
- `PROSES` → metode/proses.
- `JUMLAH`, `RATE`, `TOTAL` → kuantitas dan nilai pesanan.
- Jika sel `BOOSTER` berwarna hitam, `STATUS` dibaca sebagai daftar karyawan + jumlah, misalnya `Irwan: 4M`.
- `STATUS` **tidak** otomatis mengubah status operasional pesanan.

Header dicari berdasarkan nama. Jika header lama belum lengkap, fallback A–M tetap didukung.

## Aturan keselamatan

- Sinkronisasi bersifat idempotent: payload yang sama tidak menambah pesanan kedua kali.
- Pesanan manual dengan `KODE` yang sama tidak pernah ditimpa otomatis.
- Pesanan hasil sinkronisasi yang sudah `verified` atau sudah Closing tidak diubah.
- Perlindungan juga mencakup `payrollPeriodId`, pekerjaan harian verified/Closing, dan KODE yang tercantum dalam catatan Closing.
- KODE adalah identitas order dalam sumber sheet. Sort, insert, dan delete tidak memindahkan identitas order. Mengganti KODE berarti membuat draft baru; order KODE lama tetap ada untuk ditinjau manual. ID lama berbasis nomor baris tetap dipertahankan saat KODE cocok.
- Semua kemunculan KODE duplikat dilewati, bukan memilih baris pertama. Order dari sumber spreadsheet lain tidak diambil alih.
- Baris yang tidak dapat memetakan game/karyawan diberi `importNeedsReview`; identitas karyawan tidak ditebak.
- Pesanan baru masuk sebagai `draft` + finance `pending`, sehingga sinkronisasi tidak otomatis membayar gaji atau melakukan Closing.
- Menghapus baris dari Google Sheets tidak otomatis menghapus pesanan di ComePlayers.
- Jika Payroll sedang dikunci, perubahan ditolak oleh validation workspace dan akan dicoba lagi pada jadwal berikutnya.
- Semua perubahan yang benar-benar tersimpan memakai revision guard dan audit workspace.

## Setup satu kali

### 1. Konfigurasi secret di Vercel

Tambahkan Environment Variable pada project ComePlayers:

```
PAYROLL_SHEETS_SYNC_SECRET=<secret acak minimal 24 karakter>
```

Endpoint juga dapat memakai `CRON_SECRET` sebagai fallback, tetapi secret khusus direkomendasikan.

Setelah menambah/mengubah Environment Variable, lakukan redeploy production.

### 2. Pasang Apps Script pada workbook

1. Buka workbook **EVO GAMING 2026**.
2. Buka tab **MUTASI FH** yang akan menjadi sumber.
3. Pilih **Extensions → Apps Script**.
4. Salin isi `website/scripts/comeplayers-payroll-google-sheets.gs` ke project Apps Script.
5. Save.
6. Jalankan fungsi `setupComePlayersPayrollSync`.
7. Berikan izin Google saat diminta.
8. Masukkan secret yang sama dengan `PAYROLL_SHEETS_SYNC_SECRET`.
9. Masukkan email akun **ADMIN ComePlayers** yang akan dipakai sebagai actor audit.

Setup menyimpan secret, email admin, spreadsheet ID, nama sheet dan header di **Script Properties**, bukan di sel spreadsheet. Helper menghapus trigger ComePlayers lama milik akun pemasang, lalu memasang tepat:

```js
ScriptApp.newTrigger("onComePlayersPayrollEdit")
  .forSpreadsheet(spreadsheet).onEdit().create();
ScriptApp.newTrigger("syncComePlayersPayroll")
  .timeBased().everyMinutes(1).create();
```

Trigger yang tidak berhubungan dengan ComePlayers tidak dihapus. Google tidak mengizinkan akun melihat/menghapus trigger milik akun lain; gunakan **akun pemasang lama**, dan minta pemilik lain menghapus trigger ComePlayers duplikat bila ada. Lock script tetap melindungi antar-eksekusi dalam project yang sama.

### Upgrade instalasi per jam yang sudah berjalan

1. Deploy endpoint baru ke production terlebih dahulu.
2. Ganti isi project Apps Script workbook dengan versi terbaru `website/scripts/comeplayers-payroll-google-sheets.gs` dan Save.
3. Jalankan **`reinstallComePlayersPayrollRealtimeSync()`** memakai akun pemasang lama. Secret/email yang sudah tersimpan tetap digunakan; helper juga menyimpan spreadsheet ID untuk trigger clock.
4. Berikan izin baru Google bila diminta. Pastikan halaman Triggers menampilkan hanya satu **From spreadsheet / On edit** dan satu **Time-driven / Every minute** untuk ComePlayers.
5. Jalankan `syncComePlayersPayroll()` satu kali, kemudian uji edit dan paste di order draft.

Deploy Vercel atau merge GitHub **tidak otomatis memperbarui project Apps Script maupun trigger di akun Google**. Langkah instalasi Google ini harus dilakukan pada workbook sumber.

### 3. Tes langsung

Jalankan fungsi:

```
syncComePlayersPayroll
```

Jika berhasil, Execution log akan berisi hasil seperti:

```json
{
  "ok": true,
  "saved": true,
  "syncMode": "incremental",
  "added": 5,
  "updated": 2,
  "unchanged": 100,
  "skippedProtected": 0,
  "skippedConflicts": 0,
  "skippedInvalid": 0
}
```

Pada eksekusi berikutnya, data yang tidak berubah akan dihitung sebagai `unchanged` dan tidak membuat revision baru.

`CP_LAST_SYNC_AT`, `CP_LAST_SYNC_STATUS`, dan `CP_LAST_SYNC_RESULT` menyimpan ringkasan eksekusi; pesan error tidak mencetak secret/payload mentah. Counter `unchanged` di Apps Script juga mencakup baris yang ditekan cache. Respons API menghitung hanya baris yang diterima.

## Kontrak API

Endpoint tetap `POST /api/integrations/payroll-sheet`, dengan autentikasi Bearer yang sama. Payload versi 1 menerima `syncMode: "incremental" | "reconcile"` (default `reconcile` untuk klien lama). Kedua mode bersifat upsert saja; baris yang tidak disertakan tidak dihapus.

Setiap baris membawa `rowNumber`, `values`, `display`, `boosterBlack`, serta `duplicateCode` jika KODE muncul lebih dari sekali dalam sheet. Respons berhasil, termasuk tanpa perubahan, selalu mengembalikan `added`, `updated`, `unchanged`, `skippedProtected`, `skippedConflicts`, `skippedInvalid`, serta `rowResults: [{ rowNumber, status }]` untuk acknowledgement per baris. Mode tidak dikenal atau nomor baris berulang ditolak dengan HTTP 400.

Jika revision database berubah saat request, API membaca ulang dan menghitung merge ulang sampai tiga percobaan; order yang baru diverifikasi/manual tetap dilindungi. Jika terus bertabrakan, API mengembalikan 409 untuk retry. API selalu memakai aksi workspace `save`; tidak ada aksi Closing atau pembayaran.

## Verifikasi lokal

```sh
cd website
npx --no-install tsx --test tests/payroll-google-sheet*.test.ts
npm run typecheck
npm test
npm run build
```

Test Apps Script mengeksekusi file `.gs` sebenarnya dengan simulasi range, trigger, Script Properties, lock, dan HTTP. Test API mengeksekusi handler dengan penyimpanan revision yang disimulasikan. Validasi pemasangan/izin dan waktu pemicu sebenarnya tetap dilakukan di Google Apps Script.

## Menghentikan sinkronisasi

Jalankan:

```
removeComePlayersPayrollSyncTriggers
```

Secret dapat dicabut dengan mengganti atau menghapus `PAYROLL_SHEETS_SYNC_SECRET` di Vercel.

Nama helper lama `installComePlayersPayrollHourlyTrigger` kini memasang kedua trigger realtime; `removeComePlayersPayrollHourlyTrigger` menghapus keduanya untuk kompatibilitas.

## Catatan untuk data lama

Import historis MUTASI FH yang sudah ada tetap dipertahankan. Sinkronisasi otomatis tidak mengambil alih pesanan manual/historis dengan kode yang sama, sehingga tidak ada overwrite diam-diam. Data baru yang dibuat oleh sync memakai ID internal berawalan `gsheet:`.

# Mirror EVO GAMING ke OTOMATIS EVO GAMING

Script: [`website/scripts/evo-gaming-sheet-mirror.gs`](../website/scripts/evo-gaming-sheet-mirror.gs).

Alur satu arah:

```text
EVO GAMING 2026 / MUTASI FH
  → OTOMATIS EVO GAMING 2026 / MUTASI FH
  → integrasi ComePlayers Payroll yang sudah terpasang
```

Hanya `MUTASI FH` diaktifkan. Sumber selalu menjadi master. Mirror tidak mengirim data ke endpoint Payroll, tidak memanggil Closing/pembayaran, tidak mengubah `CP_START_ROW`, dan tidak menghapus trigger Payroll. Perubahan manual di target dapat ditimpa oleh nilai sumber pada rekonsiliasi berikutnya. Edit pekerjaan sehari-hari di **sumber**.

## Konfigurasi dan pemasangan

1. Pastikan ID sumber benar. ID bersifat case-sensitive: salin bagian setelah `/spreadsheets/d/` dari URL **EVO GAMING 2026**. Jangan menebak huruf yang mirip seperti `g/q` atau `O/Q`.
2. Buka **EVO GAMING 2026** → **Extensions → Apps Script** memakai satu akun pemasang yang memiliki akses edit ke kedua workbook.
3. Tambahkan file script baru bernama `evo-gaming-sheet-mirror`. Salin seluruh isi file `.gs` di atas. Pertahankan script lain yang sudah ada.
4. Periksa bagian konfigurasi:

   ```javascript
   var EVO_GAMING_MIRROR = {
     sourceId: '1i8aqw507TPoVd66TcMooDhQTzZvoUcFuqrlBmH6Lrdo',
     targetId: '1dcw71cfqrJnLUOd27bcDlP5EhFqer1xL6OnWuojbRMQ',
     sheets: ['MUTASI FH'],
     chunkCells: 10000,
     runBudgetMs: 45000,
     setupBudgetMs: 240000
   };
   ```

   ID sumber di atas berasal dari permintaan awal. Cocokkan dengan URL workbook sebelum menjalankan setup. Target adalah **OTOMATIS EVO GAMING 2026**.

5. Pada **Services**, klik **+**, pilih **Google Sheets API**, versi **v4**, identifier **Sheets**, lalu **Add**. Jika proyek menggunakan Google Cloud project tersendiri, aktifkan Google Sheets API juga pada project tersebut. Ini diperlukan agar nilai dan format satu batch bisa ditulis bersama secara atomik, termasuk warna hasil conditional formatting.
6. Simpan, pilih `setupEvoGamingMirrorSync`, lalu **Run**. Setujui otorisasi Google untuk membaca/menulis spreadsheet dan memasang trigger. Tidak diperlukan CRON_SECRET atau secret Payroll. Gunakan kode dari repository yang sudah diperiksa; tidak perlu membuat web app/deployment Apps Script.
7. Setup memvalidasi akses dan keberadaan sheet sumber, menyimpan konfigurasi pada **Script Properties**, mengganti hanya trigger mirror, memasang dua trigger, lalu mulai sinkronisasi awal. Ribuan baris tidak perlu disalin manual.
8. Pada **Triggers**, pastikan ada:

   | Function | Event source | Event |
   | --- | --- | --- |
   | `syncEvoGamingEditedRange` | From spreadsheet **sumber** | On edit |
   | `reconcileEvoGamingMirror` | Time-driven | Every minute |

9. Periksa **Executions**. Hasil `ok: true` dan `complete: true` menandakan putaran selesai. Jika `complete: false`, batas waktu tercapai dan sisa batch dilanjutkan pada pemicu menit berikutnya. `EGM_LAST_RESULT` menyimpan ringkasan terakhir tanpa isi sel. Jangan menyimpulkan sinkronisasi selesai hanya dari keberadaan trigger.

Jalankan installer hanya dari satu akun dan satu project. Google hanya menampilkan trigger milik akun saat ini. Installer tidak bisa menghapus trigger mirror yang dipasang akun lain atau project lain; pemiliknya harus menghapus trigger duplikat tersebut. Lock hanya berlaku untuk project ini.

## Cara kerja

- **Saat edit:** hanya koordinat range yang diedit dibaca dan disalin ke koordinat yang sama. Paste beberapa sel/baris, dropdown, teks multiline, angka `0`, boolean, currency, dan tanggal didukung. Script membaca nilai terkini, bukan `e.value`, agar paste dan clear berfungsi.
- **Setiap menit:** rekonsiliasi nilai terhitung, format, dan dropdown pada area data aktif setiap sheet yang diaktifkan. Perubahan formula atau format yang tidak memicu onEdit tetap tertangkap. Baris sumber 5068 tetap menjadi baris target 5068, termasuk KODE yang sama pada beberapa baris; tidak ada append, deduplikasi order, atau interpretasi bisnis.
- **Tanggal:** `effectiveValue.numberValue` dari sumber disalin sebagai serial tanggal Sheets dengan number format sumber. Rumus sirkular `IF(...NOW()...)` tidak disalin sebagai `formulaValue`. Nilai valid seperti `25/09/2026 10:55` tidak berubah menjadi nol/`30/12/1899`. Jika sumber sendiri berisi nol atau error, script tidak mengarang tanggal pengganti; perbaiki sumber dahulu.
- **Format:** number/date format, RGB background/font, family/size, bold/italic/underline/strikethrough, alignment, dan wrapping disalin. Background hitam BOOSTER serta STATUS multiline diteruskan apa adanya; NAMA ORDER tidak ditafsirkan/diganti.
- **Dropdown:** daftar nilai disalin. Dropdown dari range sumber dijadikan snapshot daftar nilai terhitung agar tidak merujuk ke range dari workbook lain. Perubahan daftar sumber diperiksa ulang pada rekonsiliasi. Batas 500 opsi dilaporkan sebagai error, tidak dipotong diam-diam. Daftar kosong menghapus validasi untuk sel tersebut. Aturan validasi lainnya disalin; custom formula yang merujuk sheet lain membutuhkan sheet/referensi yang sesuai di target.
- **Warna bersyarat:** yang disalin adalah warna efektif sumber. Aturan conditional formatting lama pada sheet target yang diaktifkan dilepas saat rekonsiliasi agar tidak menimpa warna hasil mirror. Aturan sumber tetap utuh. Bentuk/warna chip dropdown, komentar, grafik, lebar kolom, tinggi baris, proteksi, dan script/formula lain tidak digandakan.
- **Merge:** rentang merge sumber dalam area aktif direplikasi, termasuk header. Tidak ada penghapusan sheet/baris/kolom atau pengecilan grid. Sheet target yang belum ada dibuat, dan grid diperbesar jika perlu. Merge target yang melewati batas area aktif tidak dibongkar otomatis; konflik merge akan muncul di Executions untuk diperiksa.
- **Baris kosong:** rekonsiliasi melewati baris sumber yang seluruh nilai terhitungnya kosong dan tidak menghapus ekor data target di luar area aktif. Ini melindungi riwayat saat satu baris sumber dikosongkan sementara. Sebaliknya, clear langsung oleh pengguna diterapkan **hanya pada range edit tersebut**, termasuk jika seluruh range kosong. Sel kosong dalam baris aktif tetap mengikuti sumber.
- **Concurrency:** `LockService.getScriptLock().tryLock()` membatasi satu penulis mirror. Edit yang berbenturan masuk antrean Script Properties berupa koordinat saja. Clear tidak hilang walaupun fallback melindungi baris kosong. Lock selalu dilepas lewat `finally`. Nilai dan format setiap batch ditulis bersamaan melalui `Sheets.Spreadsheets.batchUpdate`.
- **Dedup:** hash mencakup nilai, format, dan validasi. Target juga dibandingkan agar perubahan manual di target dapat diperbaiki walaupun hash sumber tidak berubah. Tidak ada penulisan sel jika sudah sama. Cache menyimpan hash setelah batch sukses; kegagalan tidak dianggap tersinkron. Tidak ada ribuan panggilan `setValue` per sel.
- **Ukuran besar:** baca maksimal 10.000 sel per chunk, tulis baris bersebelahan dalam batch berukuran terbatas, simpan cursor setelah sukses. Putaran biasa dibatasi 45 detik, setup/manual 240 detik. Sisa antrean dan rekonsiliasi dilanjutkan, termasuk paste besar; data tidak dibuang saat kehabisan waktu.

Jadwal setiap menit bukan jaminan latensi tepat 60 detik: Google dapat menunda trigger, perhitungan sumber bisa belum selesai, atau kuota bisa habis. Untuk spreadsheet besar, pantau durasi/error **Executions** dan kuota harian akun. Konsumsi ini memakai layanan Google Apps Script, bukan kredit automation Codex.

## Hubungan dengan Payroll

Penulisan Apps Script/API **tidak memicu onEdit** di spreadsheet target. Maka edit sumber segera dicerminkan ke target, lalu integrasi Payroll yang sudah ada mengambilnya lewat rekonsiliasi satu menit. Formula yang baru terhitung mungkin memerlukan rekonsiliasi mirror lebih dahulu; kedua tahap dapat menambah waktu tunggu. Konfigurasi periode setelah Closing dan perlindungan manual/verified/Closing pada importer Payroll tetap berlaku. Script mirror tidak mengubah file importer atau secret-nya.

## Fungsi operasional

| Fungsi | Kegunaan |
| --- | --- |
| `setupEvoGamingMirrorSync()` | Simpan konfigurasi, pasang dua trigger, mulai mirror awal. |
| `reinstallEvoGamingMirrorSync()` | Terapkan ulang konfigurasi dari kode, ganti trigger mirror, rekonsiliasi dari awal. |
| `syncEvoGamingMirrorNow()` | Rekonsiliasi manual dari awal menggunakan konfigurasi tersimpan; tidak mengaktifkan ulang jadwal yang dihentikan. |
| `reconcileEvoGamingMirror()` | Handler satu menit; lanjutkan antrean dan cursor jika ada. |
| `syncEvoGamingEditedRange(e)` | Handler installable onEdit; jangan dijalankan manual tanpa event. |
| `removeEvoGamingMirrorSync()` | Hentikan mirror dan hapus hanya dua trigger mirror, tanpa menghapus sel atau trigger Payroll. Jika `busy`, ulangi setelah eksekusi aktif selesai. |

Menambah sheet nanti: tambahkan nama pada `EVO_GAMING_MIRROR.sheets`, lalu jalankan installer kembali. `MUTASI BANDAR`, `PAYROLL-1/2/3`, `SV$`, `MFH$`, `EQL$`, `DB CLOSING`, `GV$`, dan `QF$` belum diaktifkan.

## Verifikasi

1. Setelah setup selesai, cari `X2834` di sumber dan target; pastikan nomor baris sama.
2. Pada perubahan operasional yang memang diperlukan, edit satu sel di baris `X2834` di **sumber**, misalnya TASK. Catat nilainya terlebih dahulu jika hanya menguji. Pastikan nilai berubah di range target yang sama tanpa memengaruhi sel sebelah. Kembalikan nilai sumber jika pengujian sementara.
3. Periksa tanggal di A5070: bandingkan tampilan dengan sumber. Target harus menyimpan nilai tanggal, bukan formula `NOW()`.
4. Periksa satu BOOSTER hitam dan STATUS multiline. Nama order, setiap baris pekerja, warna, dan wrapping harus sesuai sumber.
5. Uji paste di salinan pengujian atau data yang memang perlu diperbarui. Pastikan seluruh baris/kolom yang diedit sesuai posisi.
6. Biarkan sumber berubah melalui formula; lihat eksekusi `reconcileEvoGamingMirror` dan hasil target. Jangan mengubah setting recalculation sumber hanya untuk pengujian.
7. Pastikan kedua trigger Payroll lama pada target tetap ada dan impor masih dimulai pada periode setelah Closing. Jangan menggunakan Closing atau pembayaran sebagai uji mirror.

Tes lokal menjalankan file `.gs` dengan emulator API/trigger/lock, memeriksa request aktual, tipe nilai, exact range, blank clear, retry/cursor, dedup, dropdown, merge, grid expansion, dan 5.100 baris:

```powershell
cd website
node node_modules/tsx/dist/cli.mjs --test tests/evo-gaming-sheet-mirror.test.ts tests/payroll-google-sheet-script.test.ts
```

Tes emulator tidak menggantikan otorisasi dan pengujian trigger nyata di akun Google. Merge GitHub juga tidak otomatis memasang Apps Script ke spreadsheet.

Referensi: [installable triggers](https://developers.google.com/apps-script/guides/triggers/installable), [nilai dan format efektif Sheets](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/cells), [Advanced Sheets service](https://developers.google.com/apps-script/advanced/sheets), [kuota Apps Script](https://developers.google.com/apps-script/guides/services/quotas).

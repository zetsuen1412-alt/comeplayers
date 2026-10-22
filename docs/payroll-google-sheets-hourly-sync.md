# Status 22 Oktober 2026: sinkronisasi Payroll dimatikan secara default

Instruksi instalasi di bawah adalah referensi historis. Jangan mengaktifkan
sinkronisasi sebelum mendapat persetujuan pemilik. Server hanya menerima impor
jika `PAYROLL_SHEETS_SYNC_ENABLED` tepat `true` dan secret khusus valid. Flag kosong,
hilang, atau nilai lain menghasilkan HTTP 410 `PAYROLL_SHEETS_SYNC_DISABLED`
sebelum membaca payload, mengakses Supabase, menjalankan bootstrap XLSX, atau
mengirim Telegram. `CRON_SECRET` tidak lagi diterima oleh integrasi Payroll Sheets.
Endpoint koreksi nama Sheets ikut berhenti; editor website dan cron lain tetap tersedia.

Untuk menghentikan pengiriman dari Google: ganti kode Payroll Apps Script dengan
versi ini lalu jalankan `pauseComePlayersPayrollSync()` sebagai setiap akun yang
pernah memasang trigger. Apps Script hanya dapat menghapus trigger milik akun
pelaksana. Fungsi hanya menghapus handler `syncComePlayersPayroll`,
`onComePlayersPayrollEdit`, `onComePlayersPayrollChange`; jangan hapus trigger
mirror EVO GAMING/`EGM_*`. Workbook, sel, CP_ROW_HASH, secret, data karyawan,
gaji, order dan Closing tidak dihapus. Kiriman dari script versi lama tetap
ditolak server setelah perubahan server ini dirilis.

Probe setelah rilis yang disetujui: `GET /api/integrations/payroll-sheet` harus
mengembalikan 410, `enabled:false`, `saved:false`. Probe ini tidak mengubah data.
Kode yang belum dirilis tidak membuktikan status produksi; audit 22 Oktober
menemukan produksi masih pada `8ffefaa` dengan mitigasi secret terpisah saja.

Rollback yang aman: biarkan flag server kosong/`false` dan pertahankan secret
khusus. Untuk rollback kode ke sebelum sakelar ini, penghentian hanya bergantung
pada mitigasi secret; karena itu lebih aman rollback bagian lain sambil tetap
mempertahankan guard ini. Reaktivasi memerlukan persetujuan terpisah: review
sumber/cakupan data dahulu, isi secret khusus, aktifkan server dan
`CP_PAYROLL_SYNC_ENABLED=true`, baru pasang trigger Payroll. Tidak perlu migrasi.

---

# ComePlayers Payroll — sinkronisasi realtime + rekonsiliasi 1 menit

Nama file lama dipertahankan agar tautan tetap bekerja. Sinkronisasi memakai trigger edit, perubahan struktur, dan pemeriksaan setiap menit. Ini bukan otomatisasi Codex dan tidak memakai token Codex.

Sinkronisasi ini menghubungkan workbook Google Sheets **EVO GAMING 2026** langsung ke workspace Payroll ComePlayers tanpa membuat spreadsheet menjadi publik.

## Alur

1. Google Apps Script terpasang pada workbook sumber.
2. Trigger **installable onEdit** menjalankan `onComePlayersPayrollEdit` ketika pengguna mengedit nilai di **MUTASI FH**. Satu edit mengirim baris tersebut; paste beberapa baris mengirim semua baris terdampak yang berubah. Event memakai rentang, bukan `event.value`, sehingga paste/clear didukung. Jika sinkronisasi roster diaktifkan, edit pada **PAYROLL-1/2/3** menjalankan rekonsiliasi nama dan TYPE karyawan.
3. Trigger clock menjalankan `syncComePlayersPayroll` dengan `.timeBased().everyMinutes(1).create()`. Trigger ini membaca seluruh baris berkode dan mengirim hanya signature yang berubah/belum berhasil disinkronkan. Perubahan formula, warna BOOSTER, pengurutan, API/script, atau edit yang terlewat dipulihkan oleh rekonsiliasi.
4. Data dikirim ke endpoint privat `POST /api/integrations/payroll-sheet`.
5. Server memvalidasi secret, memastikan actor adalah akun ADMIN ComePlayers, memetakan karyawan/game, lalu menyimpan perubahan ke `cp_payroll_workspace` dengan revision guard dan audit yang sudah digunakan Payroll.

Installable onEdit memerlukan izin `UrlFetchApp`, sehingga jangan menggantinya dengan simple `onEdit`. Google menjalankan trigger memakai akun pemasangnya. Latensi mendekati realtime, bukan jaminan waktu satu detik; penjadwalan, kuota dan jaringan Google tetap berlaku. Komputer/Codex tidak perlu menyala.

## Lock, deduplikasi, dan pemulihan

### Kunci per pesanan dan penghapusan live

Admin website dapat menekan **Kunci dari Sheet** pada satu order, atau mencentang beberapa order lalu **Kunci pilihan**. Kunci melindungi seluruh data order dari pembaruan maupun penghapusan oleh Sheet. Anggota biasa tidak dapat mengganti kunci melalui UI maupun endpoint. Identitas dan waktu penguncian dicatat server. **Buka kunci** meminta pembacaan ulang walaupun isi Sheet tidak berubah; pembaruan mengikuti pemeriksaan berikutnya (biasanya 1–2 siklus menit).

`presence` hanya diterima sebagai rekonsiliasi terpisah dengan `rows: []`, `complete: true`, `startRow`, dan seluruh daftar `references`. Daftar ini mencakup KODE sebelum batas periode juga, sehingga pemindahan baris ke bagian lain tidak disalahartikan sebagai penghapusan. Apps Script membacanya ulang sebelum pemeriksaan awal dan setelah pengiriman; snapshot yang berubah tidak dikirim sebagai daftar lengkap. Penghapusan tidak disimpulkan dari batch sebagian. Order manual, sumber lain, pesanan yang dikunci, Gaji/Closing, stok dan pembayaran tetap dilindungi. Mode lama membatasi arsip menurut `startRow`; mode semua pesanan terdaftar memakai awal data setelah header.

Respons menambahkan `archived`, `restored`, `refreshReferences`, dan `trackedRows` yang hanya berisi KODE serta nomor baris pesanan dari sumber yang sama. Arsip disimpan sebagai `sheetDeletedAt`, disembunyikan dari daftar aktif dan perhitungan Gaji, serta tersedia di panel **Dihapus dari Sheet**. Tidak ada penghapusan permanen atau pembayaran otomatis. Audit dan revision guard yang sama tetap berlaku; lock yang tersimpan bersamaan menyebabkan API membaca ulang sebelum menerapkan perubahan.

Untuk instalasi mirror EVO → OTOMATIS, setelah deployment endpoint dan penggantian file Apps Script, jalankan **`activateComePlayersSourceSync()`**. Helper menggunakan `EGM_CONFIG` yang sudah ada untuk membaca EVO secara langsung dan memasang trigger pada sumber tersebut. `CP_SYNC_NAMESPACE_ID` mempertahankan identitas target lama agar tidak menduplikasi order; secret tetap dipakai tanpa dicetak. Helper mengaktifkan `CP_SYNC_DELETIONS=true` dan `CP_START_AFTER_CLOSING=true`. Pada mode ini batas aktif mengikuti penanda **CLOSING** terakhir di kolom A meskipun nomor baris bergeser. Jika penandanya hilang, sync berhenti dengan error, bukan mengarsipkan seluruh data.

Untuk memperbarui semua pesanan website yang belum dilindungi, termasuk yang terletak sebelum CLOSING terbaru, jalankan **`activateComePlayersAllUnlockedSync()`** setelah endpoint dan file Apps Script terbaru dipasang. Helper mempertahankan workbook sumber, namespace, secret, dan actor yang sudah dikonfigurasi. Helper mengaktifkan `CP_SYNC_ALL_EXISTING=true`, `CP_SYNC_ROSTER=true`, serta `CP_SYNC_DELETIONS=true`, memasang ulang trigger milik pemasang, dan menjalankan pemeriksaan pertama.

Mode ini membaca sejak baris setelah header. Pesanan baru hanya dibuat dari baris setelah CLOSING terakhir (`newOrdersStartRow`). Baris sebelum batas hanya memperbarui pesanan yang sudah berasal dari sumber tersebut. Pemeriksaan awal mengembalikan `trackedRows`, sehingga ribuan pesanan historis yang belum terdaftar tidak diberi signature atau diunggah. Jika KODE muncul beberapa kali dalam riwayat, hanya nomor baris yang tercatat pada pesanan website yang dipertimbangkan; kemunculan di periode aktif dengan nomor baris lain juga ditolak agar tidak mengambil alih riwayat. KODE yang hanya muncul sekali dapat mengikuti perpindahan baris. Duplikat dalam periode CLOSING yang sama tetap ditolak; kasus identitas yang ambigu tidak memilih baris pertama. Pesanan periode aktif diprioritaskan jika unggahan membutuhkan beberapa batch. Jika `CP_SYNC_DELETIONS=false` dipasang secara eksplisit, pemeriksaan awal tetap mengambil identitas dan roster tetapi tidak mengirim `presence` atau mengarsipkan pesanan.

Roster lengkap mengambil kolom **B (NAMA)** dan **E (TYPE)** dari PAYROLL-1 → FH1, PAYROLL-2 → FH2, serta PAYROLL-3 → FH3. Nama tanpa nomor karyawan dan TYPE seperti OFF tetap disertakan; header, total, dan label FH dikecualikan. Ketiga tab dan header NAMA harus valid sebelum snapshot dikirim. Roster diterapkan sebelum pencocokan pekerja pesanan. Perubahan nama atau TYPE membatalkan signature pesanan agar alokasi dibaca ulang. Karyawan lama yang masih direferensikan riwayat keuangan dipertahankan dengan penanda tidak ada di roster; entri lama tanpa referensi dapat dihapus. Pemeriksaan roster tetap berjalan walaupun tidak ada perubahan pesanan.

Trigger **onChange** menangani insert/delete baris; onEdit menangani edit/paste/clear; clock satu menit menangkap perubahan formula/API dan event yang terlewat. Semuanya berjalan di Google, termasuk ketika browser/komputer/Codex ditutup. Jadwal aktif sepanjang hari, tetapi bukan jaminan uptime 100%: kuota Apps Script, gangguan Google/Vercel, izin pemasang, dan jaringan tetap dapat menunda eksekusi. Periksa Executions serta `CP_LAST_SYNC_AT/RESULT`; tidak ada otomatisasi Codex tambahan.

- Handler payroll memakai `LockService.getUserLock()`, terpisah dari ScriptLock milik mirror. Payroll hanya membaca sumber dan mengelola properti `CP_*`; mirror mengelola target serta properti `EGM_*`. Lock payroll meliputi pembacaan, HTTP, dan penyimpanan signature serta selalu dilepas melalui `finally`. UserLock menserialkan eksekusi untuk akun pemasang yang sama; pemasang lain tetap dilindungi revision guard server. Lihat [dokumentasi LockService Google](https://developers.google.com/apps-script/reference/lock/lock-service).
- Edit menunggu lock hingga 1 detik dan rekonsiliasi hingga 25 detik. Jika tetap sibuk, edit dilewati tanpa menandainya berhasil; rekonsiliasi berikutnya membaca ulang nilai terbaru. Revision guard database juga menangani penulisan dari admin atau project script lain.
- Signature SHA-256 (144 bit) mencakup header, nilai asli, tampilan, warna hitam BOOSTER, nomor baris, penanda duplikat, batas pembuatan pesanan baru, jumlah kemunculan KODE, dan hash roster ketika aktif. Signature disimpan dalam shard **Script Properties** (`CP_ROW_HASH_*`, 100 baris/shard), tidak di sel. Ini juga melakukan deduplikasi event edit berulang tanpa menunda edit pertama.
- Hanya acknowledgement API yang memperbarui cache. Baris berhasil/unchanged tidak dikirim lagi selama input sama. Baris protected/conflict/invalid yang tidak berubah diberi jeda retry **15 menit** agar order historis tidak diunggah berulang tiap menit. Perubahan isi langsung mengabaikan jeda tersebut. Kegagalan HTTP tidak menandai baris berhasil dan dicoba lagi oleh trigger berikutnya.
- Saat edit, hanya baris terdampak dibaca penuh. Pada mode lama kolom KODE dalam rentang aktif dipindai; pada mode semua pesanan terdaftar kolom KODE dan penanda CLOSING seluruh Sheet menentukan identitas historis serta duplikat per periode. Hanya baris yang relevan dan berubah diunggah.
- Maksimal 100 baris/request, 10.000 baris data aktif per sheet. Satu batch tetap dikirim jika persiapan sheet memakan lebih dari 45 detik, agar sinkronisasi tidak terus tertunda tanpa kemajuan. Batch berikutnya ditunda ke rekonsiliasi berikutnya; batch yang sudah diakui tidak diulang. Header default tetap baris 2, data mulai baris 3 kecuali `CP_START_ROW` diatur.
- Baris tanpa KODE tidak aktif. Jika `CP_SYNC_DELETIONS=true`, daftar KODE lengkap dikirim setelah batch berhasil; order yang hilang diarsipkan dari daftar aktif. Record dan audit tetap disimpan.
- Cache memantau perubahan spreadsheet. Setelah perubahan master game/karyawan atau untuk rekonsiliasi paksa, jalankan `reinstallComePlayersPayrollRealtimeSync()` lalu `syncComePlayersPayroll()`; helper menghapus cache signature, bukan data payroll.

## Pemetaan

- Kolom tanggal/jam (A) → `orderedAt` dan batas waktu turunan `dueAt` dalam WIB.
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

Angka asli dari `getValues()` diprioritaskan. Teks rupiah dengan pecahan Indonesia atau Inggris, misalnya `2.200,0`, `2,200.0`, dan `2200.0`, dibaca sebagai 2200; pemisah yang rusak tidak digabung menjadi angka lain. Pemeriksaan perbedaan harga menggunakan kolom RATE yang tersimpan langsung.

## Pemeriksaan jumlah di Mutasi

Jumlah tetap berasal dari `JUMLAH`; sistem tidak menggantinya dengan angka tebakan dari nama pesanan. Mutasi menandai **Bermasalah** jika total alokasi karyawan berbeda dari JUMLAH pada Gold/Item, termasuk impor lama tanpa jenis yang mempunyai nama jumlah jelas atau proses F2F/MAIL/TRADE. Nama jumlah yang jelas (misalnya `200M`, `50M`, `40M SKADI`) juga dibandingkan dengan JUMLAH. Angka level, durasi, paket gabungan, dan pemisah angka ambigu tidak dipakai untuk menebak jumlah. Boosting dan pekerjaan harian tetap memakai aturan pembagiannya sendiri.

Contoh: X2832 dengan nama `200M`, JUMLAH `20`, dan alokasi karyawan berjumlah `200M` menampilkan dua masalah: nama berbeda dari JUMLAH dan kelebihan alokasi `180M`. Pemeriksaan ini berlaku langsung untuk data yang sudah tersimpan tanpa impor ulang. Rincian juga terlihat saat Edit Mutasi. Pesanan dengan masalah jumlah tidak dapat diselesaikan atau masuk Closing sebelum dikoreksi; riwayat Closing yang sudah ada tidak ditulis ulang.

Untuk alur mirror, koreksi angka pada spreadsheet **sumber EVO GAMING 2026** setelah memeriksa pesanan aslinya, karena spreadsheet target mengikuti sumber. Sinkronisasi berikutnya memperbarui order draft yang belum dilindungi, dan penanda masalah hilang jika nama, JUMLAH, serta alokasi sudah sesuai. Tarif dan TOTAL perlu diperiksa saat membetulkan JUMLAH.

## Aturan keselamatan

- Sinkronisasi bersifat idempotent: payload yang sama tidak menambah pesanan kedua kali.
- Pesanan manual dengan `KODE` yang sama tidak pernah ditimpa otomatis.
- Pesanan hasil sinkronisasi yang sudah `verified` atau sudah Closing tidak diubah.
- Perlindungan juga mencakup `payrollPeriodId`, pekerjaan harian verified/Closing, dan KODE yang tercantum dalam catatan Closing.
- KODE adalah identitas order. Sort/insert tidak membuat duplikat; mengganti KODE membuat draft baru dan mengarsipkan KODE lama yang tidak lagi ada jika tidak dikunci. ID lama tetap dipertahankan saat KODE cocok.
- Semua kemunculan KODE duplikat dalam periode CLOSING yang sama dilewati, bukan memilih baris pertama. Riwayat dengan KODE berulang di periode lain dibatasi menurut identitas baris yang telah terdaftar. Order dari sumber spreadsheet lain tidak diambil alih.
- Baris yang tidak dapat memetakan game/karyawan diberi `importNeedsReview`; identitas karyawan tidak ditebak.
- Pesanan baru masuk sebagai `draft` + finance `pending`, sehingga sinkronisasi tidak otomatis membayar gaji atau melakukan Closing.
- Menghapus baris/KODE mengarsipkan pesanan yang tidak dikunci dan tidak dilindungi. Tidak ada hard delete. Record dapat dipulihkan admin melalui **Dihapus dari Sheet → Pulihkan & kunci**, atau otomatis ketika KODE valid muncul kembali.
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
ScriptApp.newTrigger("onComePlayersPayrollChange")
  .forSpreadsheet(spreadsheet).onChange().create();
ScriptApp.newTrigger("syncComePlayersPayroll")
  .timeBased().everyMinutes(1).create();
```

Trigger yang tidak berhubungan dengan ComePlayers tidak dihapus. Google tidak mengizinkan akun melihat/menghapus trigger milik akun lain; gunakan **akun pemasang lama**, dan minta pemilik lain menghapus trigger ComePlayers duplikat bila ada. UserLock melindungi eksekusi payroll milik pemasang yang sama; revision guard melindungi penyimpanan antar-pemasang.

### Mulai data setelah Closing

Pengaturan bagian ini berlaku pada mode lama ketika `CP_SYNC_ALL_EXISTING` tidak bernilai `true`. Untuk instalasi yang sudah memiliki pesanan dan perlu mengikuti koreksi di seluruh Sheet, gunakan `activateComePlayersAllUnlockedSync()`.

Atur Script Property **`CP_START_ROW`** ke nomor baris order pertama setelah blok CLOSING, misalnya `4908`. Header tetap dibaca dari **`CP_HEADER_ROW`**; untuk header gabungan baris 1–2 yang judulnya berada di baris 1, gunakan `CP_HEADER_ROW=1`.

Kedua trigger hanya membaca/mengirim data mulai `CP_START_ROW`. Edit/paste yang melintasi batas hanya mengirim bagian setelah batas; pemeriksaan KODE duplikat juga hanya mencakup rentang aktif tersebut. Order ComePlayers yang sudah ada tetap mengikuti perlindungan manual/verified/Closing. Mengubah batas tidak menghapus order apa pun.

Batas ini berupa nomor baris tetap. Perbarui nilainya ketika berpindah periode Closing atau menyisipkan/menghapus baris sebelum batas. Kosongkan properti untuk kembali mulai setelah header. Nilai yang bukan bilangan bulat setelah header akan menghentikan sync, bukan mengimpor riwayat lama secara diam-diam. Setelah mengganti workbook atau membersihkan order melalui fitur resmi, jalankan helper reinstall agar cache lama tidak menahan impor ulang.

### Upgrade instalasi per jam yang sudah berjalan

1. Deploy endpoint baru ke production terlebih dahulu.
2. Ganti isi project Apps Script workbook dengan versi terbaru `website/scripts/comeplayers-payroll-google-sheets.gs` dan Save.
3. Jalankan **`reinstallComePlayersPayrollRealtimeSync()`** memakai akun pemasang lama. Secret/email yang sudah tersimpan tetap digunakan; helper juga menyimpan spreadsheet ID untuk trigger clock.
4. Berikan izin baru Google bila diminta. Pastikan Triggers menampilkan masing-masing satu **On edit**, **On change**, dan **Time-driven / Every minute** untuk ComePlayers.
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

Setiap baris membawa `rowNumber`, `values`, `display`, `boosterBlack`, serta `duplicateCode` jika KODE berulang dalam periode yang sama. Mode semua pesanan terdaftar juga mengirim `codeOccurrences` dari seluruh Sheet dan `newOrdersStartRow`. Baris sebelum batas tidak membuat pesanan baru; pembaruan harus cocok dengan nomor baris sumber tersimpan atau KODE yang terbukti unik.

Payload dapat membawa `roster: { complete: true, sheets: [{ sheetName, rows: [{ rowNumber, name, type? }] }] }` dengan tepat tiga tab PAYROLL-1/2/3. Snapshot tidak lengkap atau nama ambigu dalam FH yang sama ditolak. `rosterAdded`, `rosterUpdated`, dan `rosterRemoved` memicu penyimpanan serta audit meskipun `rows` kosong.

Respons berhasil, termasuk tanpa perubahan, selalu mengembalikan `added`, `updated`, `unchanged`, `skippedProtected`, `skippedConflicts`, `skippedInvalid`, `skippedHistorical`, `trackedRows: [{ reference, rowNumber? }]`, serta `rowResults: [{ rowNumber, status }]` untuk acknowledgement per baris. `trackedRows` hanya mengungkap identitas sumber, tanpa nilai keuangan, dan mencakup arsip yang dapat dipulihkan. Mode tidak dikenal, metadata kemunculan/batas tidak valid, atau nomor baris berulang ditolak dengan HTTP 400.

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

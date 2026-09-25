# ComePlayers Payroll — sinkronisasi Google Sheets setiap 1 jam

Sinkronisasi ini menghubungkan workbook Google Sheets **EVO GAMING 2026** langsung ke workspace Payroll ComePlayers tanpa membuat spreadsheet menjadi publik.

## Alur

1. Google Apps Script terpasang pada workbook sumber.
2. Trigger time-driven menjalankan `syncComePlayersPayroll` setiap 1 jam.
3. Script membaca sheet yang aktif saat setup (gunakan sheet **MUTASI FH**) termasuk nilai tampilan dan warna sel BOOSTER.
4. Data dikirim ke endpoint privat `POST /api/integrations/payroll-sheet`.
5. Server memvalidasi secret, memastikan actor adalah akun ADMIN ComePlayers, memetakan karyawan/game, lalu menyimpan perubahan ke `cp_payroll_workspace` dengan revision guard dan audit yang sudah digunakan Payroll.

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

Setup menyimpan secret di **Script Properties**, bukan di sel spreadsheet, lalu membuat trigger `everyHours(1)`.

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
  "added": 5,
  "updated": 2,
  "unchanged": 100
}
```

Pada eksekusi berikutnya, data yang tidak berubah akan dihitung sebagai `unchanged` dan tidak membuat revision baru.

## Menghentikan sinkronisasi

Jalankan:

```
removeComePlayersPayrollHourlyTrigger
```

Secret dapat dicabut dengan mengganti atau menghapus `PAYROLL_SHEETS_SYNC_SECRET` di Vercel.

## Catatan untuk data lama

Import historis MUTASI FH yang sudah ada tetap dipertahankan. Sinkronisasi otomatis tidak mengambil alih pesanan manual/historis dengan kode yang sama, sehingga tidak ada overwrite diam-diam. Data baru yang dibuat oleh sync memakai ID internal berawalan `gsheet:`.

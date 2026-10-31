# EVOGAMING Monitor — konteks untuk melanjutkan di ChatGPT

## Tujuan pengguna dan pilihan yang sudah disepakati

Pengguna berbahasa Indonesia mengembangkan aplikasi Windows **EVOGAMING Monitor —
FH3**, terintegrasi dengan **https://www.comeplayers.com** dan laporan Telegram FH3.
Gunakan proyek yang sudah ada; pertahankan fungsi operasionalnya.

Permintaan yang sudah ditangani:

1. Satu order dapat dikerjakan 1–4 karyawan. Admin dapat menambahkan anggota ketika
   order berjalan, termasuk saat PAUSE atau di antara sesi order harian.
2. **Admin menentukan persentase masing-masing karyawan, total tepat 100%.**
   Persentase membagi **total upah order**, termasuk bila anggota ditambahkan di
   tengah pekerjaan. Angka disimpan sebagai basis points integer: 1% = 100.
3. Penanggung jawab awal tetap mengirim satu lifecycle order
   TAKE/START/PAUSE/CONTINUE/DONE. Anggota tambahan mendapat kredit pekerjaan dan
   bagian upah sendiri. Satu order tetap dihitung sekali pada total tim.
4. Tombol **×** terpisah membatalkan pilihan karyawan, order baru, atau tugas aktif.
   Ini hanya membatalkan seleksi lokal, bukan menghapus order. Pilihan lain tetap
   tersimpan; refresh/filter/fokus tidak boleh memilih baris pertama secara otomatis.
5. Dari sepuluh usulan tema pengguna memilih **Pearl Blue** (ditulis pengguna
   "peral blue"): latar terang, panel putih, sidebar putih, teks gelap, aksen biru.
   Pertahankan susunan operasional aplikasi agar tetap familiar.

Pengguna ingin melanjutkan pekerjaan berikutnya di ChatGPT setelah perubahan ini.

## Repositori dan status sumber

- Repositori private: https://github.com/zetsuen1412-alt/comeplayers
- Pull request: https://github.com/zetsuen1412-alt/comeplayers/pull/118
- Branch: `codex/monitor-teams-admin-splits-20261031`
- PR #118 masih terbuka dan belum di-merge ketika ringkasan ini disiapkan pada
  31 Oktober 2026 (Asia/Bangkok). Status saat paket ditulis ulang dicatat di manifest.
- Baseline main saat pekerjaan dimulai: `cfb5611a84e399ae65369998a574a384c2483e37`.
- Rilis awal Windows 2.2.1 berasal dari commit `086e06795b3680a6c09468898b4e3e5f060c3b39`.
- EXE awal pengguna `D:\EVOGAMINGMonitor (12).exe` cocok persis dengan manifest
  GitHub: 70.440.409 byte, SHA-256
  `9b85dc8d25f4d6003c8c23a4684107a505e70c03833a2919a0b1acf1c48c269b`.
- Tim/bagi hasil ditambahkan pada commit `273a9050f633ebc65ae8d7ce5b4070b0d355c805`.
- Pembatalan pilihan 2.3.1 ditambahkan pada `2b8b5da1ab1e6b208102711475381ff6c523f2fd`.
- Versi berikutnya **2.4.0 Pearl Blue**. SHA final dan checksum EXE tercantum di
  `build.json` dalam paket hasil, dan `HANDOFF-MANIFEST.json` dalam paket lanjutan.

Jangan menganggap main sama dengan branch PR: periksa status PR dan head terbaru
sebelum mengubah atau merilis kode. Perubahan disimpan di PR; **chat ini tidak
menjalankan migrasi atau deployment produksi**. Screenshot aplikasi bukan bukti
bahwa migrasi tim sudah terpasang di server.

## Teknologi dan bagian proyek

### Windows

WinForms C#, .NET 8, Windows 10/11 x64. Proyek:

- `CP-BoostMonitor-Windows/CPBoostMonitor.Windows.csproj`
- `CP-BoostMonitor-Windows.Tests/CPBoostMonitor.Windows.Tests.csproj`
- `CP-BoostMonitor-Windows.Preview/CPBoostMonitor.Windows.Preview.csproj`

File utama:

- `MainForm.cs`: navigasi, koneksi, workflow, laporan, admin.
- `TakeOrderPanel.cs`: karyawan, order baru, tugas aktif, TAKE, tombol ×.
- `OrderTeamDialog.cs`: peserta, persentase, tambah anggota, versi yang ditinjau.
- `Models.cs`: metadata tim/bagian upah dan validasi integer.
- `PayrollApi.cs`: transport API; jangan mengulang mutasi/pengiriman Telegram secara otomatis.
- `LuxuryControls.cs`: palet dan kontrol tema; `DimensionalControls.cs`: grid dan
  penjagaan agar fokus tidak menghidupkan kembali seleksi yang dibatalkan.
- `CompletedOrdersPanel.cs`, `MonitorWorkspacePanel.cs`: riwayat, upah, Tutup Buku.

Palet Pearl Blue: background `#F1F5FA`, surface/sidebar `#FFFFFF`, raised
`#F6F8FC`, text `#1A2B43`, muted `#5E7085`, border `#DCE4EE`, sidebar text
`#34445C`, accent `#2563EB`, hover `#1D4ED8`, selection `#E9F0FF`, success `#157B57`.

Fitur lama yang harus dipertahankan: mode karyawan tanpa login/aktivasi perangkat,
Login Admin melalui Pengaturan, foto laporan, Discord/duration/order harian,
hapus sebagai arsip dan pulihkan, status lokal termasuk jam tidur yang bertahan
setelah restart, CSV riwayat lokal, notifikasi popup dan musik 10 detik.
Sesi disimpan dengan DPAPI; jangan mengganti enkripsi untuk mengakali lingkungan tes.

### Website/API

Next.js 16.3.6 + TypeScript + Supabase. Baca `website/AGENTS.md` dan panduan
Next.js pada `node_modules/next/dist/docs/` sebelum mengubah route/komponen.

Endpoint dasar: `https://www.comeplayers.com/api/admin/payroll/mobile/`.
Route terkait: `assign`, `tasks`, `completed`, `management`, `books`, dan `team`.

Kontrak tim:

```text
GET team?orderRef=X123
=> {orderRef, teamVersion, primaryEmployeeCode,
    participants:[{employeeId,employeeCode,employeeName,shareBps,joinedAt}]}

POST team
{orderRef,version,participants:[{employeeCode,shareBps}]}

POST assign
{orderRef,employeeCode,teamVersion:0,participants:[{employeeCode,shareBps}]}
```

Tim/persentase hanya dapat diubah admin, divalidasi lagi di SQL. Tiap anggota harus
aktif di FH3 dan mendapat bagian lebih dari 0%, maksimal dua angka desimal; total
harus tepat 100%. Semua anggota lama
dan penanggung jawab dipertahankan. Perubahan ditolak setelah DONE/Tutup Buku atau
ketika pengiriman laporan masih sending/unknown. Order arsip, Refund, Bermasalah,
atau dengan sumber tidak aktif juga tidak dapat diubah timnya. Versi mencegah overwrite perubahan
admin lain. Pengguna satu karyawan lama tetap mendapat 100% tanpa penulisan ulang.

Pemetaan tim/validasi/pembulatan: `website/lib/monitorTeams.ts`.
Kredit selesai: `payrollMobileCompleted.ts`; pembukuan: `monitorManagement.ts`.
Pekerjaan Payroll finansial website terpisah dari ledger operasional Monitor.

### Database

Migrasi additive: `website/supabase/migrations/20261031013816_fh3_monitor_teams.sql`.

Tabel baru:

- `cp_fh3_monitor_teams`: penanggung jawab dan versi.
- `cp_fh3_monitor_team_members`: peserta/persentase/waktu bergabung.
- `cp_fh3_monitor_closing_shares`: snapshot upah per penerima.

RPC tim: `cp_monitor_team_snapshot`, `cp_monitor_team_states`,
`cp_monitor_set_team`, `cp_monitor_assign_team`.

Jaga satu lifecycle Telegram lama dan satu seal closing per order. API harus
**mengganti** baris total closing dengan baris share, bukan menambahkan keduanya.
Pembulatan konsisten berdasarkan urutan kode karyawan, total semua bagian harus
tepat sama dengan total upah. Snapshot Tutup Buku lama tetap utuh.
Rincian: `docs/monitor-teams-database.md` dan `docs/monitor-teams-2.3.0.md`.

## Pengujian yang sudah dilakukan

Regresi API/database berikut dijalankan untuk implementasi 2.3.x; tidak ada perubahan
server pada pembaruan warna 2.4.0. Hasil pemeriksaan Windows/preview final 2.4.0 dan
SHA yang benar dicatat terpisah di `HANDOFF-MANIFEST.json` dan `build.json`.

- 99 tes regresi API/database lulus, termasuk upgrade dari migrasi lama, admin vs
  karyawan, alokasi rupiah, konflik versi, operasi harian dan PAUSE.
- TypeScript lulus pada dependency source yang diambil untuk verifikasi.
- 23 pemeriksaan Windows validasi/transport tim lulus.
- 17 pemeriksaan UI pembatalan pilihan + 10 UI tim lulus.
- Build Release dan startup EXE single-file `--verify-package` lulus.
- Tampilan sintetis ditinjau pada lebar 1120 dan 1460; tidak mengirim laporan
  Telegram atau mengambil order nyata.
- Build Vercel preview pada perubahan awal PR berhasil.

Batas verifikasi: full suite Windows berhenti pada DPAPI "profile not loaded"
dalam sandbox ini. Enkripsi produksi tidak diubah. GitHub Actions berakhir sebelum
langkah tes (steps kosong, log tidak tersedia); penyebab belum terverifikasi.
Jangan menyatakan seluruh pemeriksaan CI atau pengujian live sudah lulus.

Perintah standar pada mesin build normal:

```powershell
dotnet run --project CP-BoostMonitor-Windows.Tests/CPBoostMonitor.Windows.Tests.csproj -c Release
dotnet run --project CP-BoostMonitor-Windows.Preview/CPBoostMonitor.Windows.Preview.csproj -c Release -- dist/preview
dotnet publish CP-BoostMonitor-Windows/CPBoostMonitor.Windows.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:PublishTrimmed=false -o dist/windows
cd website
npm ci
npx tsc --noEmit --incremental false
node --import tsx --test --test-concurrency=1 tests/monitor-*.test.ts tests/payroll-mobile-*.test.ts
```

Untuk verifikasi Windows yang tidak membutuhkan profil DPAPI, tes dan preview
menyediakan argumen `--team-only`; baca `Program.cs` untuk pemakaiannya.

## Isi paket lanjutan

Paket lanjutan menyertakan source Windows lengkap (aplikasi, tes, preview, logo,
ikon, dan suara), patch website/SQL, dokumentasi, dan cuplikan layar.
**Bagian website adalah patch, bukan seluruh website Comeplayers.** Ambil repo
lengkap pada branch di atas untuk build/deploy website; jangan menimpa seluruh
website dengan folder patch ini. Dependensi, cache, file sesi, password, token,
dan kredensial tidak disertakan.

## Langkah berikutnya saat melanjutkan

1. Baca ringkasan ini dan manifest; periksa PR/head terbaru agar tidak memakai EXE
   atau source lama. Pearl Blue adalah pilihan pengguna yang sudah pasti.
2. Konfirmasi perubahan tema akhir melalui cuplikan layar dan pengujian build yang
   tercatat di paket. Jika masih ada pekerjaan UI, lanjutkan dari source ini.
3. Sebelum fitur tim dipakai live, cek migrasi server, selesaikan verifikasi CI,
   lalu ikuti urutan migrasi → deploy API → penerbitan EXE/ZIP. Jika migrasi sudah
   ada, jangan menjalankannya dua kali. Jangan menghapus riwayat lama.
4. Sesuaikan pekerjaan berikutnya dengan permintaan pengguna. Jangan mengulang
   pertanyaan pembagian hasil atau pemilihan tema yang sudah dijawab.

## Pesan yang bisa dikirim pengguna di ChatGPT

> Saya ingin melanjutkan proyek EVOGAMING Monitor yang terintegrasi Comeplayers.
> Baca ringkasan dan paket source yang saya lampirkan terlebih dahulu. Saya sudah
> memilih tema Pearl Blue. Fitur yang dibuat: tim 1–4 karyawan per order dengan
> persentase ditentukan admin, tambah karyawan saat order berjalan, dan tombol ×
> pembatalan pilihan. Lanjutkan dari PR #118; periksa status terbaru dan jelaskan
> pekerjaan yang masih diperlukan untuk menjalankan versi terbaru dengan benar.

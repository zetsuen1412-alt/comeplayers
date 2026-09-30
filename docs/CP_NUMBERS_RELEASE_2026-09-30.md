# Nomor CP permanen — 30 September 2026

Source: commit `6dbd199c87ff4493e472eb8ca3f7d8b5f40efbdc`, PR [#31](https://github.com/zetsuen1412-alt/comeplayers/pull/31).

## Perilaku
- Semua akun memperoleh identitas teks sepanjang 13 digit: `008` + 10 digit acak. Generator memakai pgcrypto dan rejection sampling; constraint unik serta retry menangani tabrakan.
- Nomor diberikan saat signup dan dipertahankan saat profil dibuat ulang. Ledger privat menyimpan reservasi sesudah akun dihapus; nomor tidak didaur ulang.
- API pengaturan menolak perubahan nomor; trigger database menolak perubahan/null/pertukaran ID akun. Login dan kontak pemulihan tetap terpisah.
- Pencarian CP harus lengkap, dapat memakai spasi atau tanda hubung. Pencarian nomor HP/email tidak tersedia. Username numerik memakai awalan @. Blokir kedua arah, akun anonim, dan rate limit tetap berlaku.
- Profil website/Android menampilkan kartu CP baca-saja dengan salin; website juga menyediakan bagikan.

## Nomor khusus admin
Sepuluh nomor berikut dikecualikan dari alokasi acak, belum diberikan kepada akun mana pun:

```
008 00000 00000
008 11111 11111
008 22222 22222
008 33333 33333
008 44444 44444
008 55555 55555
008 66666 66666
008 77777 77777
008 88888 88888
008 99999 99999
```

Pengguna akan menentukan akun admin penerima kemudian. Pekerjaan ini tidak mengubah nomor akun yang sudah terbit.

## Database dan validasi
- Migrasi `20260930020736_permanent_cp_account_numbers.sql` dan `20260930021543_reserve_admin_cp_numbers.sql` diterapkan ke proyek `uyehruetoxedmookyfcd`.
- Hasil remote: 100 profil, 100 nomor valid dan unik, 10 nomor admin dicadangkan, 0 nomor admin terpakai.
- 43 tes terfokus database/kontak/API lulus, termasuk 20 tes database yang memaksa setiap nomor khusus muncul dari generator dan memastikan dilewati.
- SQL integrasi signup, format, keunikan, ID/nomor permanen, pembuatan ulang profil, dan akses ledger lulus pada database aktual; seluruh fixture di-rollback.
- TypeScript website/mobile dan lint terfokus lulus. Tes mobile CP/profil 18/18; regresi keyboard/chat/notifikasi juga lulus.
- Advisor Supabase memberi INFO RLS tanpa policy untuk kedua tabel privat: ini deny-all yang disengaja, semua hak client/service-role dicabut. [Penjelasan advisor](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

## Rilis
- Website aktif: `dpl_F4Kt6Yn4voAoT3d3fcjnoXt4QH23`, kandidat `evo-gaming-ifdczegba-ilham-evogaming-s-projects.vercel.app`; lookup `www.comeplayers.com` menunjuk ID yang sama dan READY.
- Browser login: kartu CP muncul, tombol salin berhasil, pencarian nomor lengkap dengan spasi mengembalikan akun yang tepat. Tidak ada chat/panggilan uji dikirim. Console error/warning kosong. API kontak tanpa login memberi 401 dan cache-control no-store.
- Bukti lokal: `C:/Comeplayers-new/output/cp-numbers-20260930/cp-number-live.png`.
- Android 0.16.4 / build 32: EAS `97bd90f0-e67a-4c63-817a-249e8db10892`, source commit di atas, FINISHED pada 2026-09-30T02:32:15Z. AAB 87.9 MB diunggah dan diterbitkan pada internal Play release5 sekitar 2026-09-30T03:00Z. Play Console menampilkan Active, Latest release 0.16.4 - Nomor CP dan notifikasi, Available to internal testers. Build32 menggantikan29; perangkat didukung tidak berkurang. Estimasi unduhan Play untuk instalasi baru 33.4 MB.
- Link tester: https://play.google.com/apps/internaltest/4701728206334114354. Google menyatakan pembaruan biasanya muncul dalam1jam, kadang lebih lama. Ini rilis internal, bukan production publik; nama sementara com.comeplayers.app (unreviewed) masih berlaku sampai setup/review aplikasi selesai.
- Peringatan nonblocking Google Play: belum ada file deobfuscation R8/ProGuard untuk diagnostik crash; tidak ada error penghalang rilis. Bukti lokal: `C:/Comeplayers-new/output/cp-numbers-20260930/play-build32-live.png`.
- AAB lokal: `C:/Comeplayers-new/output/cp-numbers-20260930/ComePlayers-0.16.4-32.aab`; SHA256 `F21BDE6A4576CC835AAB8E6963A9719475EB27D8054594975B26686A46E73714`. Arsip memuat JS bundle, manifest, Clipboard provider, dan kedua suara notifikasi/panggilan.
- Build31 (0.16.3) sudah selesai tetapi digantikan kandidat32 untuk menyertakan CP. Belum diunggah.
- Windows1.0.1 tetap ditunda sesuai pilihan pengguna; web di dalam aplikasi dapat menerima perubahan website. Batas verifikasi perangkat/notifikasi terdokumentasi di CHAT_NOTIFICATIONS_RELEASE_2026-09-29.md.

## Cakupan identitas
Nomor CP adalah identitas akun ComePlayers yang dapat digunakan pengguna dari berbagai negara. Ini bukan alokasi nomor telepon internasional E.164 atau pengakuan resmi regulator/ITU. [ITU E.164](https://www.itu.int/rec/T-REC-E.164).

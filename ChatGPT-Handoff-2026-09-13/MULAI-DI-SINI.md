# Serah terima ComePlayers ke ChatGPT

Snapshot: 13 September 2026. Workspace asli: `C:\Comeplayers-new`.

Dokumen ini membantu melanjutkan proyek melalui repository GitHub privat `zetsuen1412-alt/comeplayers`, tanpa mengunggah seluruh workspace ke chat. Repository memuat sumber dan aset proyek yang relevan; dependency terpasang, hasil build, cache, dan kredensial tetap lokal.

## Cara mulai

1. Bila koneksi GitHub tersedia di ChatGPT Anda, hubungkan akun dan beri akses hanya ke repository privat `zetsuen1412-alt/comeplayers`.
2. Mulai percakapan atau Project ComePlayers. Minta ChatGPT membaca `README.md`, lalu dokumen ini pada branch `main`.
3. Jika koneksi belum tersedia atau repository belum terbaca, unggah dokumen ini dan file sumber tertentu dari GitHub secara manual. Tidak perlu mengunggah semua aset.
4. Minta perubahan satu fitur per percakapan. Simpan hasil sebagai patch atau file pengganti dengan path yang jelas, lalu terapkan dan uji pada proyek asli. Koneksi membaca repository tidak dengan sendirinya berarti chat dapat menjalankan build atau menulis ke produksi.

ChatGPT biasa tidak otomatis memperoleh akses ke folder lokal, sesi Codex, Vercel, Supabase, R2, atau rahasia yang ada di komputer ini. Berikan hanya sumber dan alat yang diperlukan. Jangan menempelkan password, token, recovery key, atau isi `.env` ke percakapan.

Dokumentasi resmi Projects: https://learn.chatgpt.com/docs/projects

## Prompt yang bisa ditempel

> Saya melanjutkan proyek ComePlayers dari Codex. Gunakan repository GitHub zetsuen1412-alt/comeplayers, branch main. Baca README.md dan ChatGPT-Handoff-2026-09-13/MULAI-DI-SINI.md terlebih dahulu. Pekerjaan terbaru adalah pemulihan E2EE lewat passkey serta persiapan satu perangkat aktif. Bedakan fitur yang sudah dirilis, yang baru disiapkan, dan yang belum diuji. Pertahankan kompatibilitas dengan riwayat terenkripsi dan identitas pengguna lama. Sebutkan file yang perlu diubah dan berikan patch/perubahan konkret beserta pengujian yang relevan. Bila repository belum dapat dibaca, katakan dan minta path file tertentu. Jangan menganggap Anda memiliki akses atau izin menjalankan migrasi produksi. Jangan mengklaim deployment atau pengujian telah dilakukan tanpa bukti.

## Produk dan keputusan pengguna

- ComePlayers memiliki website marketplace, Community, Messages pribadi, profil/pengaturan, serta aplikasi Android dan Windows. Ada fitur payroll yang hanya boleh dibuka admin.
- Messages pribadi dan panggilan suara/video dipisahkan dari Community.
- Pengguna meminta pesan, lampiran, dan panggilan pribadi memakai E2EE. Penyimpanan dan pemulihan tidak boleh menyimpan private key plaintext di server.
- Login saat ini melalui Google/Gmail atau email + password. Login/verifikasi telepon ditunda karena tidak ada anggaran OTP. Field nomor telepon dan status verifikasi tetap disiapkan; jangan menjadikan OTP berbayar sebagai syarat akses sekarang.
- Permintaan terbaru: pemulihan riwayat saat pindah perangkat tanpa menyalin recovery key, dan perangkat lama otomatis logout ketika perangkat lain login.
- Solusi pemulihan yang telah diterapkan menggunakan passkey tersinkron. Login mengenali akun; passkey membuka kunci E2EE secara lokal. Login Google/email saja tidak dapat menciptakan kembali encryption key yang sudah hilang.

## Status terakhir yang terverifikasi

### Sudah diterbitkan

- Website produksi: https://www.comeplayers.com
- Halaman aktivasi pemulihan akun lama: https://www.comeplayers.com/account/security
- Android 0.13.0, versionCode 15, runtime 0.13.0.
- APK: https://www.comeplayers.com/api/downloads/android/ComePlayers_0.13.0_android.apk
- Ukuran APK 107.716.792 byte; SHA256 `d4dba4b9863239d50d3221dd4ecb8b134efce45a604176077c72f100c1193133`.
- Tanda tangan APK cocok dengan 0.12.1. Pengguna dapat memasang sebagai update; jangan meminta uninstall atau menghapus data aplikasi.
- Deployment Vercel: `dpl_E1tVvDpiaswFdmiqviY1MKkMmj75`, READY dan terhubung ke domain produksi.
- Perbaikan jalur koneksi login mobile sudah diterbitkan. Endpoint relay hanya mengizinkan operasi Auth yang ditentukan, tidak mengekspos endpoint admin.
- Recovery passkey tersedia pada web dan APK baru. Akun lama mengaktifkannya dari perangkat terverifikasi yang masih memiliki root key, atau memulihkan sekali dengan recovery key yang sudah dimiliki.
- Recovery key lama tetap valid untuk cadangan lama. Jangan membuang atau mengganti root identity pengguna saat menambahkan passkey.

### Disiapkan, BELUM aktif

- Logout otomatis perangkat lama: kode client, endpoint server, dan SQL migrasi telah disiapkan.
- `SINGLE_DEVICE_SESSIONS_ENABLED` tidak diaktifkan. Produksi `/api/account/session` terakhir mengembalikan `{ "enabled": false }`.
- Migrasi: `website/supabase/migrations/20260912215632_account_single_device_sessions.sql`.
- Migrasi tersebut menambah tabel sesi privat, pemeriksaan global Data API, dan pembatasan sesi lama pada tabel publik serta Storage. Review persetujuan otomatis menolak penerapannya karena dampak akses produksi yang luas. Persetujuan spesifik masih tertunda; kata "lanjut" saja sebelumnya ditolak review sebagai tidak cukup spesifik.
- Jangan menjalankan migrasi ini, mengaktifkan flag, atau mencari cara melewati penolakan sebelum persetujuan spesifik diperoleh. Tinjauan kode dan pengujian lokal boleh dilanjutkan. Ini adalah catatan batas pekerjaan yang belum selesai, bukan pernyataan bahwa logout sudah aktif.

### Batas pengujian

- 29 uji web/auth/protokol/passkey dan 25 uji mobile/recovery/backup/Drive lulus pada rangkaian terakhir.
- Uji browser memakai WebAuthn PRF dengan authenticator virtual. Alur UI membuat passkey, mengirim ciphertext, menghapus hanya vault akun uji, lalu memulihkan pesan berhasil.
- APK berhasil dipasang sebagai update di emulator QA dan membuka halaman login tanpa error startup. Tidak ada data aplikasi pengguna yang dihapus.
- Asosiasi Android `/.well-known/assetlinks.json` merespons 200 tanpa redirect dan cocok dengan sertifikat APK. Seluruh unduhan publik APK cocok dengan hash lokal.
- Sinkronisasi passkey pada dua perangkat fisik dan transfer Drive dengan akun Google nyata belum diuji.
- E2EE yang ada memakai HPKE/account root/conversation epochs. Belum menggunakan Signal Double Ratchet dan belum diaudit independen; jangan menyamakannya dengan jaminan protokol WhatsApp.

## Arsitektur pemulihan

- Setiap akun memiliki root identity dan setiap perangkat memiliki key pair sendiri.
- Cadangan terenkripsi akun tersimpan dalam `cp_secure_accounts.encrypted_backup`. Envelope passkey opsional ditandatangani root; tidak memerlukan migrasi skema baru.
- WebAuthn PRF menghasilkan secret di perangkat. HKDF-SHA256 mengikat hasilnya ke akun, credential, RP, dan salt sebelum dipakai untuk membuka cadangan root.
- PRF output, private key, dan secret turunan tidak dikirim ke server. Server menyimpan ciphertext dan metadata publik yang ditandatangani.
- RP ID tepat: `www.comeplayers.com`. Passkey memerlukan verifikasi pengguna, dukungan PRF, serta status backed-up. Provider tanpa dukungan tersebut menggunakan jalur recovery key alternatif.
- Riwayat terenkripsi yang tersedia di sinkronisasi/cadangan dapat dipulihkan setelah kunci berhasil dibuka. Data lokal yang belum tersinkron tidak otomatis tersedia pada perangkat lain.
- Modul native baru `react-native-passkey@3.6.2` membutuhkan APK 0.13.0. Jangan mengirim bundle baru ini melalui OTA runtime 0.12.0. APK 0.12.1 lama memakai runtime 0.12.0.

## Peta sumber

| Area | Path |
| --- | --- |
| Website Next.js 16.2.6 / React 19 | `website/` |
| Web Auth / sesi | `website/lib/auth/`, `website/lib/serverSupabase.ts`, `website/app/api/account/session/` |
| Web E2EE / passkey | `website/lib/e2ee/`, `website/lib/secureAccountProtocol.ts` |
| API riwayat dan recovery | `website/app/api/messages/secure/` |
| UI Messages web | `website/components/messages/SecureDirectConversation.tsx` |
| UI pengaturan recovery web | `website/components/account/PasskeyRecoverySettings.tsx` |
| Android React Native / Expo | `comeplayers-apps/apps/mobile/` |
| Mobile E2EE | `comeplayers-apps/apps/mobile/src/secure/` |
| Mobile pengaturan | `comeplayers-apps/apps/mobile/src/screens/` |
| Shared chat package | `comeplayers-apps/packages/chat-core/` |
| Windows Tauri | `comeplayers-apps/apps/desktop/` |
| SQL versi skema | `website/supabase/migrations/` |
| Uji web | `website/tests/` |
| Uji mobile/protokol | `comeplayers-apps/tests/` |
| Manifest unduhan | `website/lib/appReleases.ts` |

## Menjalankan pemeriksaan di proyek asli

Website:

```powershell
Set-Location C:\Comeplayers-new\website
npm run typecheck
npx tsx --test tests/passkeyRecovery.test.ts tests/secureAccountProtocol.test.ts tests/auth/accountSessionMonitor.test.ts
npm run build
```

Mobile:

```powershell
Set-Location C:\Comeplayers-new\comeplayers-apps
npm run typecheck --workspace @comeplayers/mobile
```

Website memiliki AGENTS.md yang meminta membaca panduan Next.js terpasang sebelum mengubah API/framework. Pertahankan versi dependency terkunci. Gunakan sumber terbaru pada branch main; jangan menimpa proyek dengan arsip lama Juli 2026.

## Isi repository dan yang tetap lokal

- Website, mobile, desktop, shared package, konfigurasi publik, tes, migrasi, dan sumber game ComePlayersMarble tersedia sebagai file biasa. Folder aplikasi dahulu hanya berupa gitlink tanpa remote; metadata Git lamanya disimpan di workspace lokal dan sumbernya kini dikelola repository utama.
- `game-services/` dan aset website yang sudah ada tetap dipertahankan. ComePlayersMarble memuat sumber/aset authoring; cache editor, hasil build, serta video referensi lokal tidak diperlukan untuk pembahasan kode.
- Tidak menambahkan dependency terpasang, `.next`, SDK/JDK, Gradle cache, installer APK/AAB/EXE, kredensial, `.env`, signing keys, data pengguna, atau backup percakapan.
- Bukti pemeriksaan terbaru yang sudah dibersihkan tersedia di `docs/verification/2026-09-13/`. Screenshot pribadi dan recovery key pengguna tidak disertakan.
- Mendorong kode SQL ke GitHub tidak menerapkan migrasi tersebut ke Supabase. Batas persetujuan migrasi satu perangkat di atas tetap berlaku.

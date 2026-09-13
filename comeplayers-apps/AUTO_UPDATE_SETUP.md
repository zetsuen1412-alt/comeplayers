# Konfigurasi auto update ComePlayers

## Android dan iOS

Android dan iOS memakai antarmuka React Native native serta EAS Update. Keduanya berbagi backend dengan website, bukan membuka website di WebView. Android juga memiliki Google Play In-App Updates.

### 1. Backend dan website Vercel

Aplikasi mobile mengakses API produksi, autentikasi, katalog, dan chat ComePlayers melalui koneksi HTTPS. Deployment website tidak mengubah tampilan native secara otomatis; perubahan antarmuka mobile dikirim melalui EAS Update atau rilis store baru.

### 2. Google Play In-App Updates (Android)

Saat startup, aplikasi meminta status versi terbaru dari Google Play.

- Update biasa memakai alur fleksibel.
- Update prioritas tinggi atau yang sudah tersedia setidaknya tujuh hari memakai alur immediate bila diizinkan Google Play.
- Update fleksibel diselesaikan otomatis setelah unduhan selesai.
- Fitur ini hanya bekerja jika aplikasi dipasang dari Google Play dan versi baru tersedia pada track yang dapat diakses pengguna.
- Preview APK atau sideload akan melewati pemeriksaan Play tanpa menghalangi startup.

### 3. EAS Update (Android dan iOS)

Setelah pemeriksaan Play, aplikasi memeriksa update JavaScript/asset tanpa menahan layar utama. Update yang diunduh di latar depan dipakai saat aplikasi dibuka kembali. Pemeriksaan memiliki timeout agar aplikasi tetap terbuka saat jaringan bermasalah.

Android memakai runtime eksplisit `0.12.0`, sesuai nilai `expo_runtime_version` yang benar-benar tertanam pada APK 0.12.0 dan 0.12.1. Nomor versi aplikasi dan runtime tidak selalu sama. iOS tetap memakai kebijakan `appVersion`. Setiap perubahan dependency native, permission, SDK, atau modul native harus menaikkan runtime Android sekaligus membuat APK/AAB baru; jangan mengirim JavaScript yang membutuhkan modul baru ke runtime lama. Sebelum publikasi, cocokkan runtime konfigurasi Expo dengan resource APK menggunakan `aapt2 dump resources`.

Environment produksi EAS harus memiliki konfigurasi publik login yang diperlukan. Jika belum, ekspor lokal dengan environment yang benar, verifikasi bundle, lalu publikasikan direktori ekspor tersebut memakai `eas update --skip-bundler --input-dir <direktori> --environment production`. Jangan mengirim ulang hasil rebuild EAS yang kehilangan pengaturan Supabase atau Google.

Preview update otomatis dibuat dari push ke branch `main` atau `master`:

```text
apps/mobile/.eas/workflows/send-preview-update.yml
```

Production update Android dan iOS dilakukan secara manual dengan rollout bertahap:

```powershell
cd apps/mobile
npx eas-cli@latest workflow:run .eas/workflows/send-updates.yml
```

Atau:

```powershell
npm run mobile:update -- -Message "Perbaikan Messages" -Channel production
```

Perintah tersebut memakai rollout awal 25% untuk channel production (100% untuk development/preview). Nilai dapat ditentukan sendiri dengan `-RolloutPercentage`, lalu ditingkatkan hanya setelah hasil stabil.

Perubahan dependency native, permission, SDK, package/bundle identifier, local Expo module, atau konfigurasi native wajib dibuat sebagai AAB dan/atau archive iOS baru:

```powershell
npm run android:aab
npm run ios:archive
```

Pengiriman iOS ke App Store Connect:

```powershell
npm run ios:submit
```

## Windows

Tauri memeriksa endpoint berikut saat startup:

```text
https://comeplayers.com/api/desktop/update/{{target}}/{{arch}}/{{current_version}}
```

Siapkan rilis:

```powershell
npm run desktop:update:prepare -- -Version 0.5.3 -DownloadUrl https://downloads.comeplayers.com/desktop/ComePlayers_0.5.3_x64-setup.exe
```

Script tersebut:

1. menyelaraskan versi package, Tauri, Cargo, dan lock file;
2. membangun installer NSIS;
3. menolak installer jika ProductVersion atau nama file tidak cocok;
4. membuat signature updater;
5. membuat `latest.json`, `SHA256SUMS.txt`, dan file environment website.

Upload installer ke URL yang ditentukan. Setelah itu, salin nilai dari:

```text
release/desktop/VERSION/vercel-updater-environment.txt
```

ke environment deployment website, lalu deploy website. Jika endpoint tidak dikonfigurasi atau sedang gagal, aplikasi tetap dibuka dan mencoba lagi pada startup berikutnya.

Private key updater berada di:

```text
%USERPROFILE%\.comeplayers\desktop-update.key
```

Jangan commit atau membagikan private key tersebut.

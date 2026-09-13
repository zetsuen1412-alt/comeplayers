# ComePlayers Messages untuk Android dan Windows

Proyek ini menyediakan klien ComePlayers mandiri untuk:

- aplikasi Android dan iOS Expo/React Native untuk Google Play dan App Store;
- aplikasi desktop Windows Tauri dengan installer NSIS;
- pemeriksaan update otomatis setiap kali aplikasi dibuka.

Kode aplikasi berada di folder `comeplayers-apps`. Website dan API utama tetap berada di proyek `website`.

## Yang sudah tersedia

- Android package dan iOS bundle identifier: `com.comeplayers.app`.
- Android production menghasilkan Android App Bundle (`.aab`).
- Android preview menghasilkan APK untuk pengujian internal.
- Android memeriksa:
  - update biner resmi melalui Google Play In-App Updates;
  - update JavaScript dan asset melalui EAS Update.
- Windows memeriksa installer baru melalui Tauri Updater, memasang, lalu membuka ulang aplikasi.
- Home, Community, Marketplace, Messages, percakapan, autentikasi, dan profil memakai layar React Native native; website ComePlayers tidak dibungkus sebagai WebView.
- Browser sistem hanya boleh dipakai untuk alur eksternal yang memang memerlukannya, seperti pembayaran aman atau OAuth, lalu pengguna dikembalikan ke aplikasi.
- Izin kamera, mikrofon, dan screen capture yang tidak dipakai sudah dihapus.

## Persiapan

```powershell
cd C:\Comeplayers-new\comeplayers-apps
npm install
npm run typecheck
```

Buat file environment dari contoh:

```text
apps/mobile/.env.example  -> apps/mobile/.env
apps/desktop/.env.example -> apps/desktop/.env
```

## Menjalankan

Desktop:

```powershell
npm run desktop:dev
```

Android development build:

```powershell
npm run mobile:start
```

iOS development build (memerlukan macOS/Xcode):

```powershell
npm run mobile:ios
```

Modul Google Play In-App Updates tidak tersedia di Expo Go. Gunakan development build atau APK preview untuk pengujian native.

## Membuat rilis

APK preview:

```powershell
npm run android:apk
```

AAB Google Play:

```powershell
npm run android:aab
```

iOS preview dan App Store archive melalui EAS cloud:

```powershell
npm run ios:preview
npm run ios:archive
npm run ios:submit
```

Upload build terbaru ke track internal Google Play:

```powershell
npm run android:submit -- -Latest
```

Installer Windows:

```powershell
npm run desktop:windows
```

Rilis updater Windows:

```powershell
npm run desktop:update:prepare -- -Version 0.5.3 -DownloadUrl https://downloads.comeplayers.com/desktop/ComePlayers_0.5.3_x64-setup.exe
```

Lihat `GOOGLE_PLAY_RELEASE.md` dan `AUTO_UPDATE_SETUP.md` sebelum publikasi.

Website dan aplikasi mobile memakai akun, API, katalog, turnamen, dan data chat yang sama, tetapi antarmukanya merupakan klien terpisah. Perubahan website dirilis melalui Vercel; perubahan aplikasi dirilis melalui Google Play, App Store, atau EAS Update.

## Keamanan

- Jangan masukkan Supabase service-role key, secret pembayaran, private updater key, atau Google service-account JSON ke source.
- Aplikasi hanya membutuhkan URL publik website ComePlayers.
- Private key updater Windows tetap disimpan di luar repository.

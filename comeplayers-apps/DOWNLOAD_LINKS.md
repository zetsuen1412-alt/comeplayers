# Link download resmi

## Wajib untuk semua aplikasi

1. Node.js LTS: https://nodejs.org/en/download
2. Git for Windows: https://git-scm.com/download/win
3. Visual Studio Code (opsional tetapi disarankan): https://code.visualstudio.com/Download

## Tambahan untuk aplikasi Windows dengan Tauri

1. Microsoft C++ Build Tools: https://visualstudio.microsoft.com/visual-cpp-build-tools/
   - Saat instalasi pilih **Desktop development with C++**.
2. Rustup: https://rustup.rs/
3. Microsoft Edge WebView2 Runtime: https://developer.microsoft.com/en-us/microsoft-edge/webview2/
   - Windows 10/11 biasanya sudah memilikinya.

## Tambahan untuk Android

1. Buat akun Expo: https://expo.dev/signup
2. Gunakan APK preview atau development build pada HP asli.

Expo Go tidak memuat modul native Google Play In-App Updates milik proyek ini.

Untuk emulator Android dan build lokal:

1. Android Studio: https://developer.android.com/studio

Untuk build APK/AAB melalui cloud Expo, Android Studio tidak wajib. Gunakan EAS CLI:

```powershell
npm install --global eas-cli
eas login
```

## Akun distribusi (baru diperlukan saat publikasi)

- Google Play Console: https://play.google.com/console/
- Microsoft Partner Center: https://partner.microsoft.com/dashboard/
- Apple Developer Program: https://developer.apple.com/programs/
- App Store Connect: https://appstoreconnect.apple.com/

Jangan membeli akun store sebelum versi aplikasi internal berhasil diuji.

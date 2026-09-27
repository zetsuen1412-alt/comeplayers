# Rilis ComePlayers ke Google Play

Android **0.15.0 (22) sudah diterbitkan ke internal testing Google Play**; daftar 13 tester sudah diaktifkan dan track berstatus `Active`. Tester perlu bergabung melalui [tautan opt-in internal](https://play.google.com/apps/internaltest/4701728206334114354) menggunakan akun Google yang terdaftar. Belum ada rilis production publik; pengujian internal tidak memulai persyaratan closed testing 14 hari. Website juga sudah dirilis. Lihat [hasil rilis 27 September 2026](play-store/RELEASE-2026-09-27.md) untuk identitas AAB, verifikasi, dan pekerjaan yang masih diperlukan. [Catatan kesiapan](play-store/READINESS-2026-09-27.md) menyimpan status sebelum persetujuan pemilik. Draf listing Indonesia tersedia di [listing-id-ID.json](play-store/listing-id-ID.json).

## Identitas tetap

- Nama aplikasi: ComePlayers
- Android package: `com.comeplayers.app`
- Format production: Android App Bundle (`.aab`)
- Target SDK: API 36 melalui Expo SDK 57
- Privacy policy: `https://comeplayers.com/privacy`
- Account/privacy controls: `https://comeplayers.com/account/privacy`

Jangan mengganti package ID setelah aplikasi pertama kali dibuat di Play Console.

## 1. Pemeriksaan lokal

```powershell
cd C:\Comeplayers-new\comeplayers-apps
npm install
npm run typecheck
npm run mobile:doctor
```

Semua pemeriksaan harus lulus sebelum build.

## 2. Siapkan Google Play dan EAS

1. Buat aplikasi `ComePlayers` di Google Play Console.
2. Aktifkan Play App Signing dengan key yang dikelola Google.
3. Buat Google service account untuk EAS Submit.
4. Upload JSON service account ke EAS Credentials. Jangan simpan file JSON tersebut di repository.
5. Lengkapi internal tester list.
6. Hubungkan repository GitHub ke proyek EAS bila workflow preview otomatis dari push ingin digunakan.

## 3. Build AAB

```powershell
npm run android:aab
```

Profil production:

- membangun `.aab`;
- memakai channel `production`;
- menaikkan versionCode secara otomatis;
- memakai credential signing yang disimpan EAS.

## 4. Upload ke internal testing

```powershell
cd apps/mobile
npx eas-cli@24.5.0 submit --platform android --profile production --id <BUILD_ID_TERVERIFIKASI>
```

Ganti placeholder dengan ID build final yang sudah diverifikasi. Jangan menggunakan `--latest`, karena dapat memilih AAB lama atau build dari pekerjaan lain. Profil submit mengarah ke track `internal`, bukan rilis publik production. Uji setidaknya:

- login, logout, dan pemulihan sesi;
- daftar room, membuka room, mengirim dan menerima pesan;
- attachment/download yang tersedia;
- tombol back Android;
- link marketplace terbuka di browser luar;
- startup tanpa internet tetap menampilkan tombol coba lagi;
- OTA update;
- Google Play flexible/immediate update dari versi N ke N+1.

## 5. Lengkapi listing dan kebijakan

Play Console masih membutuhkan keputusan pemilik akun untuk:

- deskripsi singkat/panjang dan kategori;
- icon, feature graphic, screenshot ponsel/tablet;
- email support;
- Data Safety sesuai data nyata yang diproses backend;
- content rating;
- ads declaration;
- target audience;
- reviewer test account bila login diwajibkan;
- deklarasi account deletion;
- closed testing bila diwajibkan untuk jenis akun developer.

Jangan menyatakan data tidak dikumpulkan sebelum alur akun, pesan, attachment, telemetry, dan backend benar-benar diaudit.

## 6. Promosi

Promosikan internal -> closed/open testing -> production setelah hasil stabil. Gunakan staged rollout, bukan langsung 100%.

## Cara kerja update

- JS/style/asset: EAS Update, diperiksa otomatis saat startup.
- Native SDK/dependency/permission: AAB baru melalui Google Play.
- Saat AAB baru tersedia, aplikasi otomatis memulai Google Play In-App Updates. Google Play tetap menampilkan persetujuan pengguna; instalasi diam-diam tidak diperbolehkan.

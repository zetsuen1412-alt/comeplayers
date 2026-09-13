# ComePlayers Desktop (Windows)

Aplikasi Windows mandiri berbasis Tauri/WebView2 untuk seluruh layanan ComePlayers. Build produksi membuka `https://www.comeplayers.com` langsung di jendela aplikasi, tanpa CMD, localhost, address bar, atau browser eksternal. Perubahan website dimuat langsung; Tauri Updater menangani perubahan binary native.

## Development

```powershell
npm run desktop:dev
```

## Installer

```powershell
npm run desktop:windows
```

Build publik wajib ditandatangani dengan sertifikat Windows Code Signing tepercaya. Pipeline mendukung dua metode:

1. Azure Artifact Signing melalui `COMEPLAYERS_SIGNING_ENDPOINT`, `COMEPLAYERS_SIGNING_ACCOUNT`, dan `COMEPLAYERS_SIGNING_PROFILE`.
2. Sertifikat OV/EV yang sudah terpasang di Windows Certificate Store melalui `COMEPLAYERS_WINDOWS_CERTIFICATE_THUMBPRINT` dan `COMEPLAYERS_WINDOWS_TIMESTAMP_URL`.

Build lokal tanpa tanda tangan hanya untuk pengujian dan harus dijalankan dengan `COMEPLAYERS_ALLOW_UNSIGNED_WINDOWS_BUILD=1`. Installer tersebut tidak boleh dipublikasikan.

Output berada di:

```text
apps/desktop/src-tauri/target/release/bundle/nsis/
```

## Updater release

```powershell
npm run desktop:update:prepare -- -Version 0.5.4 -DownloadUrl https://downloads.comeplayers.com/desktop/ComePlayers_0.5.4_x64-setup.exe
```

Script memvalidasi versi installer, signature, URL, dan checksum sebelum menyiapkan folder `release/desktop/VERSION`.

Gunakan rilis `0.5.2` atau yang lebih baru. Folder lama `release/desktop/0.5.1` tidak boleh dipublikasikan karena installer di dalamnya masih berversi `0.4.0`.

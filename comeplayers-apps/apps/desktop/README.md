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
npm run desktop:update:prepare -- -Version 1.0.1 -DownloadUrl https://downloads.comeplayers.com/desktop/ComePlayers_1.0.1_x64-setup.exe
```

Script memvalidasi versi installer, signature, URL, dan checksum sebelum menyiapkan folder `release/desktop/VERSION`.

Gunakan rilis `0.5.2` atau yang lebih baru. Folder lama `release/desktop/0.5.1` tidak boleh dipublikasikan karena installer di dalamnya masih berversi `0.4.0`.

## Notifikasi versi 1.0.1

Pusat notifikasi tersedia di `/notifications`. Pengguna dapat mengaktifkan notifikasi Windows dan memilih suara pesan/nada dering. Izin Windows yang diblokir harus diubah melalui Windows Settings. Notifikasi sistem menggunakan identitas paket MSIX yang dikembalikan Windows; build NSIS menggunakan identifier aplikasi yang terpasang.

Notifikasi pesan dan panggilan tetap berjalan saat aplikasi terbuka atau diminimalkan. Menutup proses aplikasi menghentikan penerimaan; versi ini belum memasang layanan push Windows untuk proses yang sudah ditutup. Browser juga harus tetap terbuka. Nada dering berhenti saat dijawab, ditolak, disenyapkan, kedaluwarsa, atau pengguna keluar. Notifikasi tidak memindahkan percakapan secara otomatis.

Pemeriksaan perangkat sebelum publikasi: instal paket, login, aktifkan notifikasi, minimalkan jendela, kirim pesan dan panggilan dari akun kedua, lalu jawab/tolak dan pastikan suara berhenti. Ulangi dengan chat dibisukan dan notifikasi akun dimatikan. Kompilasi/unit test tidak menggantikan pemeriksaan notifikasi Windows pada paket terpasang.

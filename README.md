# ComePlayers

Repository sumber ComePlayers: website marketplace dan Community, Messages pribadi dengan E2EE, aplikasi Android/Windows, serta sumber game terkait.

**Mulai melanjutkan pekerjaan dari [panduan serah terima](ChatGPT-Handoff-2026-09-13/MULAI-DI-SINI.md).** Dokumen itu merangkum keputusan pengguna, arsitektur, file penting, hasil pengujian, dan pekerjaan yang belum aktif.

Pembaruan 14 September: [integrasi payroll final v0.15.5](docs/PAYROLL_FINAL_INTEGRATION_2026-09-14.md) menggantikan halaman admin/payroll menggunakan sumber `EvoCP_Payroll/` dan penyimpanan database khusus admin.

## Sumber

| Folder | Isi |
| --- | --- |
| `website/` | Next.js, API, marketplace, Messages, admin/payroll, serta migrasi Supabase |
| `comeplayers-apps/apps/mobile/` | Aplikasi React Native / Expo |
| `comeplayers-apps/apps/desktop/` | Aplikasi Windows Tauri |
| `comeplayers-apps/packages/chat-core/` | Tipe dan kode chat bersama |
| `ComePlayersMarble/` | Sumber dan aset authoring game Cocos Creator |
| `Crazy-Rich-World-Tour-Unity-28.0/` | [Crazy Rich: World Tour Unity 28.0](Crazy-Rich-World-Tour-Unity-28.0/README_ID.md), source client Unity 6 dan aset, dengan referensi Legacy Web 27 |
| `game-services/` | Layanan game terkait |
| `docs/verification/2026-09-13/` | Bukti verifikasi rilis dan pengujian terpilih |

`comeplayers-apps/` adalah direktori sumber biasa dalam repository ini, bukan submodule yang memerlukan repository lain.

## Status 13 September 2026

- Website: https://www.comeplayers.com
- Android 0.13.0: [unduh APK](https://www.comeplayers.com/api/downloads/android/ComePlayers_0.13.0_android.apk).
- Pemulihan E2EE lewat passkey telah diterbitkan. Akun lama perlu mengaktifkan passkey dari perangkat yang masih memiliki kunci chat.
- Login menggunakan Google/Gmail atau email dan password. OTP telepon ditunda.
- **Logout otomatis perangkat lama belum aktif.** SQL dan kode sudah disiapkan, tetapi migrasi produksi masih menunggu persetujuan spesifik. Jangan mengaktifkan `SINGLE_DEVICE_SESSIONS_ENABLED` sebelum migrasi disetujui, diterapkan, dan diverifikasi.
- E2EE belum memakai Signal Double Ratchet dan belum diaudit independen. Sinkronisasi passkey pada dua perangkat fisik belum diuji.

Rincian rilis: [account recovery follow-up](comeplayers-apps/ACCOUNT_RECOVERY_FOLLOWUP_2026-09-13.md).

## Bekerja dengan kode

Website dijalankan dari `website/`; workspace aplikasi dari `comeplayers-apps/`. Masing-masing memiliki `package.json` dan lockfile sendiri. Baca README dan AGENTS.md yang berlaku sebelum mengubah kode. Simpan konfigurasi rahasia secara lokal atau pada penyedia deployment; jangan memasukkannya ke Git.

Dependency terpasang, cache, hasil build, installer, private key dan konfigurasi produksi tidak disertakan. Gunakan contoh environment yang tersedia dan konfigurasi milik Anda sendiri. Source game yang ikut disimpan pada pembaruan repository ini tidak berarti game tersebut baru dibangun atau diterbitkan ulang.

# CP Boost Monitor — Aplikasi Android Terintegrasi Payroll (v1.1)

Aplikasi Android (Java, SQLite) untuk memantau kesiapan tim boosting, dengan **nama/kode/divisi karyawan otomatis diambil dari Payroll ComePlayers**. Source of truth daftar karyawan ada di **website Payroll ComePlayers** (`www.comeplayers.com`), yang menerima roster dari Sheet `PAYROLL-1` / `PAYROLL-2` / `PAYROLL-3`.

## Integrasi payroll website

- Login memakai email dan kata sandi akun ComePlayers yang **sudah diberi akses Payroll** (admin atau anggota yang diizinkan di `cp_payroll_access`). Tidak menggunakan token admin maupun service-role key dalam APK.
- Setelah login, APK membaca endpoint terbatas `GET /api/admin/payroll/mobile/roster` dengan Bearer token Supabase. Endpoint hanya mengirim **ID, kode, nama, divisi, workforceStatus, active**. Data gaji, kasbon, order, dan detail spreadsheet **tidak dikirim**.
- APK menyinkronkan roster otomatis saat dibuka dan setiap ±2 menit **selama aplikasi aktif**, juga lewat tombol **Sinkronkan Nama Sekarang**. Sinkronisasi Sheet → website tetap mengikuti mekanisme payroll website yang sudah ada; bila sinkronisasi Sheet belum berjalan, data APK mengikuti snapshot terakhir di website.
- **Pencocokan menggunakan ID payroll** (bukan nama). Perubahan nama, kode, dan divisi dari website tidak menghapus status boosting, tugas, ataupun riwayat lokal. Migrasi baris manual di HP dicoba hanya jika kombinasi nama + divisi cocok tunggal; apabila ambigu dibuat identitas payroll baru (lebih aman daripada salah menggabungkan orang).
- Karyawan `RESIGN`, hilang dari roster Sheet, atau terhapus dari workspace **disembunyikan** pada daftar aktif APK, tanpa menghapus riwayat dan data lokal. Ketika kembali dengan ID sama, status yang pernah tercatat tetap tersimpan.
- Jika jaringan, akses, atau server gagal, data roster terakhir di perangkat tetap dapat ditampilkan; pesan dan waktu keberhasilan sinkron terakhir terlihat di dashboard. Sync yang gagal tidak menghapus data lokal.
- Nama/divisi karyawan payroll **tidak bisa diedit atau dihapus di APK**; lakukan di website. Status boosting, durasi tidur, tugas, dan catatan status masih disimpan **lokal di HP** — belum sinkron antar-HP maupun ke database payroll website.
- Sesi access/refresh token disimpan terenkripsi AES-GCM dengan Android Keystore, tidak menyimpan kata sandi. Hanya HTTPS, dan logout membuat aplikasi terhubung meminta login ulang. Status lokal tetap terlindungi dalam sandbox aplikasi, tetapi backup CSV/JSON adalah berkas biasa yang perlu disimpan dengan aman.

## Fitur utama

- Dashboard jumlah **Ready Boosting**, **Menganggur**, **Tidur**, **Tidur Terlalu Lama**, **Sedang Bekerja**.
- Durasi status dihitung dari perubahan terakhir. Batas tidur lama default 120 menit (bisa disesuaikan 1–10080 menit).
- Pencarian dan filter karyawan, ganti status, tugas/order, catatan, serta histori waktu perubahan.
- Ekspor CSV dan backup/restore JSON schema 2 (mendukung pemulihan backup schema 1).
- Fallback mode lokal bila belum menghubungkan payroll.

## Prasyarat rilis

1. Merge/deploy **endpoint website** dalam PR yang sama lebih dahulu atau bersamaan dengan APK (`website/app/api/admin/payroll/mobile/{session,roster}/route.ts`). Tanpa deploy, login APK akan gagal (404).
2. Website memiliki variabel environment Supabase existing (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) dan tabel `cp_payroll_workspace`, `cp_payroll_access`, `profiles` seperti payroll aktif. Tidak memerlukan migrasi tabel baru untuk roster read-only.
3. Akun payroll harus memiliki email/password Supabase. Login SSO-only atau MFA aktif mungkin memerlukan alur masuk mobile tambahan; **jangan** melonggarkan otorisasi payroll. Jika kebijakan **satu perangkat** aktif, login APK akan mengklaim sesi baru sesuai aturan website, sehingga sesi website pada perangkat lain dapat terputus.
4. Website harus sudah menerima data Sheet sehingga `workspaceKeys.employees` ada. APK tidak membaca Google Sheet langsung; ini sengaja agar kontrol hak akses tetap berada di website.
5. Uji integrasi akun yang benar, perubahan nama/divisi, resign, karyawan hilang, pemulihan akses, dan data offline di staging sebelum menyebarkan APK ke seluruh tim.

## Build debug APK

Dari GitHub Actions jalankan workflow **Build CP Boost Monitor APK** dan unduh artifact `CP-BoostMonitor-debug-APK` (berisi `app-debug.apk`). Atau buka folder `CP-BoostMonitor-Android` dengan Android Studio, JDK 17, Android SDK 35, kemudian **Build > Build APK(s)**. Debug APK hanya untuk pengujian internal; untuk distribusi resmi gunakan APK release yang ditandatangani oleh perusahaan.

## Catatan privasi dan alur

**Sinkronisasi yang dibuat pada v1.1 adalah satu arah untuk daftar karyawan, dari website menuju APK.** Status Ready/Tidur/Bekerja belum terlihat otomatis di website atau HP lain. Tidak ada GPS, mikrofon, ataupun deteksi orang benar-benar tidur; status dipilih manual.

## Kode

- `EmployeeDb.java`: SQLite v2, roster merge atomik berdasarkan ID, status dan history tetap lokal.
- `PayrollSync.java`: HTTPS autentikasi dan sinkronisasi roster.
- `SecureSession.java`: penyimpanan token terenkripsi dengan Android Keystore.
- `MainActivity.java`: dashboard, tombol login/sync, kontrol nama karyawan payroll, status dan backup.
- `website/app/api/admin/payroll/mobile/`: API sesi dan roster yang menggunakan validasi izin payroll website yang telah ada.
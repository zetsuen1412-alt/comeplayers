# CP Boost Monitor — Aplikasi Status Karyawan Android

Aplikasi Android native **offline** (Java + SQLite) untuk mendata dan memantau karyawan tim boosting. Tidak butuh server, login, koneksi internet, atau langganan.

## Fitur versi 1.0

- Dashboard jumlah karyawan **Ready Boosting**, **Menganggur**, **Tidur**, **Tidur Terlalu Lama**, dan **Sedang Bekerja**.
- Waktu mulai status dan durasinya diperbarui di tampilan secara berkala (sekitar 1 menit).
- **Tidur Terlalu Lama** dihitung otomatis dari status `Tidur`, bukan status yang ditulis manual. Default 120 menit dan bisa diatur 1–10080 menit. Pada ringkasan, Tidur = belum lewat batas; Tidur Lama = melewati batas.
- Tambah, cari, filter, edit, dan hapus karyawan; catat jabatan, tugas/order, dan catatan.
- Ubah status dengan log tanggal, jam, status lama, status baru, dan keterangan.
- Riwayat 1500 perubahan terakhir di layar; cadangan JSON mengekspor **semua** riwayat.
- Ekspor CSV untuk Excel/Google Sheets; backup dan restore JSON untuk memindahkan data manual.
- Data SQLite disimpan hanya di perangkat. Riwayat tetap ada ketika data karyawan dihapus.

## Build APK

**Cara mudah dengan GitHub Actions:** Buka tab `Actions`, jalankan workflow **Build CP Boost Monitor APK** / tunggu proses otomatis setelah push, lalu unduh artifact **CP-BoostMonitor-debug-APK**. Ekstrak ZIP artifact, install `app-debug.apk` ke HP Android. Android dapat meminta izin *Install unknown apps*.

**Android Studio:** Buka folder `CP-BoostMonitor-Android`, biarkan Gradle sync (Android SDK 35, JDK 17, Android Gradle Plugin 8.7.3), pilih **Build > Build APK(s)**. APK terletak di `app/build/outputs/apk/debug/app-debug.apk`.

**CLI:** Pastikan Android SDK, platform 35, Java 17, dan Gradle 8.10.2 tersedia. Jalankan `gradle assembleDebug` dari folder proyek.

`debug APK` dapat langsung dipasang untuk pengujian/internal tim. Untuk rilis publik jangka panjang gunakan APK release yang ditandatangani dengan kunci milik perusahaan; jangan membagikan keystore atau password.

## Catatan penting

- **Offline / satu perangkat:** perubahan **tidak otomatis sinkron** ke HP karyawan/manajer lain. Untuk mode real-time multi-perangkat perlu backend, autentikasi/otorisasi, kebijakan data, dan mekanisme sinkronisasi.
- **Tidak mendeteksi orang benar-benar tidur.** Status dipilih manual oleh operator; label Tidur Lama hanya berdasarkan selisih waktu sejak status dipasang. Tidak ada GPS/mikrofon/pelacakan aktivitas.
- **Restore mengganti data yang ada.** Lakukan backup sebelum restore; backup JSON menyertakan nama karyawan dan sebaiknya disimpan secara aman.
- Pada versi ini tidak ada login, multi-user, dan notifikasi push; penggunaan yang direkomendasikan untuk admin pada satu HP.

## Struktur

- `app/src/main/java/id/comeplayers/boostmonitor/MainActivity.java` — tampilan dashboard, manajemen karyawan, riwayat, setting, CSV/JSON.
- `app/src/main/java/id/comeplayers/boostmonitor/EmployeeDb.java` — SQLite, transaksi, perubahan status, audit history, backup/restore.
- `app/src/main/AndroidManifest.xml`, `app/src/main/res/values/styles.xml` — deklarasi aplikasi & tema.

Lisensi: dibuat sebagai kode awal untuk penggunaan internal CP. Sesuaikan persyaratan operasional dan keamanan sebelum dipakai untuk data personal skala besar.

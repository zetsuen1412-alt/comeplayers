# ComePlayers 0.16.1 — ikon dan avatar grup

Status: sumber disiapkan; AAB baru belum dibangun atau diterbitkan ke Google Play.

- Ikon aplikasi Android dan iOS menggunakan logo baru yang diberikan pemilik. Aset iOS 1024×1024 berlatar opak; Android menggunakan foreground adaptif 1024×1024 dengan sudut transparan.
- Grup tanpa foto profil akan menampilkan logo ComePlayers sebagai avatar bawaan; foto grup yang sudah ada tetap ditampilkan.
- Versi aplikasi dan runtime Android dinaikkan ke `0.16.1` karena ikon instalasi memerlukan build native. Identitas paket tetap `com.comeplayers.app` dan proyek EAS tetap `a663aa70-99b7-4c8f-93ea-5f8637baa2df`.
- EAS memakai versioning remote dengan `autoIncrement`. Saat persiapan, versionCode remote `24`, sama dengan rilis internal terakhir. `android.versionCode` pada sumber sengaja tidak diubah; nomor final harus diperiksa pada AAB baru dan harus lebih tinggi dari `24`.

Sebelum penerbitan, verifikasi build production memakai kredensial signing yang sudah ada, manifest paket/versi, sertifikat upload, tampilan ikon pada Android, serta penggantian avatar hanya untuk grup tanpa foto. Setelah itu unggah AAB terverifikasi ke track internal Google Play.

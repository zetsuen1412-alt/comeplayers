# CP Boost Monitor Android v1.2 — nama karyawan otomatis dari Payroll ComePlayers

**Sumber daftar karyawan:** menu [Payroll → Karyawan](https://www.comeplayers.com/admin/payroll/employees)
di website. APK hanya membaca ID, kode, nama, FH/divisi, workforceStatus dan aktif/nonaktif.
Tidak mengambil gaji, kasbon, mutasi, order ataupun spreadsheet mentah.

## Cara pakai
1. Instal APK dari halaman [APK Karyawan](https://www.comeplayers.com/admin/payroll/boost-monitor).
2. Pilih **Login & Ambil Karyawan dari Website** saat pertama dibuka.
3. Masuk dengan email/password akun ComePlayers yang memiliki izin Payroll.
4. Aplikasi harus menerima daftar nama **sebelum** membuka halaman Karyawan.
5. Daftar diperbarui ketika APK dibuka dan setiap ±2 menit selama aktif; tersedia tombol
   **Ambil Nama Terbaru** untuk memperbarui manual.
6. Nama/kode/FH diedit di website. Di HP cukup ubah Ready/Menganggur/Tidur/Bekerja.

Data lokal manual lama tidak dicampur dengan daftar karyawan payroll.
Data roster digabung berdasarkan ID payroll, sehingga perubahan nama tidak mereset
status boosting, waktu tidur, pekerjaan atau riwayat. Resign/hilang dari Sheet
disembunyikan; histori lokal tidak dihapus.

API payroll memerlukan login akun berizin dan menyimpan sesi ter-enkripsi dengan
Android Keystore. Jika offline, data karyawan terakhir yang sudah tersimpan tetap ada.
Status boosting **belum** tersinkron antar-HP atau kembali ke payroll website.

**Peringatan versi debug:** jika Android menolak memperbarui APK lama karena tanda
tangan debug berbeda, backup JSON sebelum uninstall. Gunakan keystore release
stabil untuk distribusi aplikasi resmi. Login SSO-only/MFA khusus belum didukung
tanpa alur login mobile tambahan yang mempertahankan kebijakan keamanan.

## Build
JDK 17, Android SDK 35: `gradle -p CP-BoostMonitor-Android assembleDebug`.
Workflow GitHub menghasilkan APK/ZIP dan memeriksa signature dan checksum.
Sinkronisasi akun nyata perlu uji login di HP berizin.

# QA perangkat fisik EVOGAMING Monitor — 25 Oktober 2026

Status: **rencana uji, belum dieksekusi pada perangkat fisik**.

## Acuan dan batas perubahan

- Repository: `zetsuen1412-alt/comeplayers`.
- Baseline branch `main` pada awal pekerjaan: `84d5f4017c4193a94a31d6081ecdc111b8e0c12c` (25 Oktober 2026).
- Windows produksi: **2.0.2**; Android produksi: **1.7.0**, aplikasi terpisah dari versi lama.
- PR #93, #94, #95 telah digabung. Jangan mengulang migrasi atau deployment yang sudah dinyatakan diterapkan oleh pemilik.
- Sumber order valid: posting langsung **@evogamings** di grup Telegram **FH3** yang terverifikasi. Sinkronisasi masuk Google Sheets tetap **mati**.
- **Jangan** mengubah Payroll lama, gaji, karyawan, Closing lama, atau Data Tutup Buku. Buku Monitor terpisah; snapshot yang sudah ditutup bersifat immutable.
- Semua tahap pada dokumen ini adalah observasi atau penggunaan aplikasi yang sah oleh akun berwenang. **Dilarang membuat order produksi palsu**, mengirim foto START/DONE palsu, mencoba kembali pengiriman Telegram yang statusnya tidak pasti, atau memodifikasi data riil hanya untuk test.
- Merge, deploy, serta migrasi produksi baru memerlukan persetujuan pemilik. Panduan ini tidak memberi izin tindakan tersebut.

Referensi implementasi:
- [Panduan akun, arsip, upah, TTS, dan Tutup Buku](monitor-accounts-closing-2026-10-24.md)
- [README Windows](../CP-BoostMonitor-Windows/README.md)
- [README Android](../CP-BoostMonitor-Android/README.md)
- `CP-BoostMonitor-Windows/NewOrderTracker.cs`, `OrderAlerts.cs`
- `CP-BoostMonitor-Android/app/src/main/AndroidManifest.xml`

## Prasyarat dan pencatatan bukti

Gunakan satu PC Windows 10/11 x64 dan satu perangkat Android 13+ (izin notifikasi runtime); tambahan Android 12 atau lebih lama opsional. Pakai akun admin dan akun karyawan **yang sudah resmi diberi binding Monitor**. Jangan membagikan kata sandi, token sesi, nama/credential pelanggan, atau file `.env`.

Catat untuk setiap perangkat:
- OS/build, merek/model (tanpa serial/IMEI), waktu dan zona waktu.
- Versi aplikasi serta sumber installer dari menu `/admin/payroll/boost-monitor`.
- Android 1.7.0: package `id.comeplayers.boostmonitor.fh3.accounts`; sertifikat release SHA-256 yang diharapkan `6082eb26895e4cecaf6cc68b68217613e2c08bcd278f2f3f257a0fa0a512278e`.
- Windows 2.0.2: unduhan EXE/ZIP dari website, SHA-256 cocok dengan metadata publik `/downloads/evogaming-monitor-windows.json`. Jangan mengasumsikan hash tetap bila ada build baru.
- Jenis koneksi (Wi-Fi/seluler), mode baterai, status izin notifikasi dan opsi suara.
- Untuk setiap skenario: hasil `PASS`, `FAIL`, `BLOCKED`, atau `NOT RUN`, waktu, versi, dan deskripsi bukti tanpa data rahasia.

Pembuktian unduhan Windows (opsional, read-only):

```powershell
Get-FileHash -Algorithm SHA256 .\EVOGAMINGMonitor.exe
Get-FileHash -Algorithm SHA256 .\EVOGAMING-Monitor-Windows-v2.0.2-x64.zip
```

Bandingkan hasilnya dengan `exeSha256` dan `zipSha256` pada metadata situs. Periksa sumber dan identitas APK melalui alat Android SDK bila tersedia. APK debug branch **bukan** rilis produksi.

## Matriks uji observasional

| ID | Perangkat / kasus | Langkah terkontrol | Hasil yang diharapkan |
| --- | --- | --- | --- |
| WIN-01 | Windows — startup, akun | Jalankan rilis 2.0.2; login admin, kemudian logout dan login karyawan | Aplikasi terbuka tanpa crash; UI/aksi admin tidak diberikan kepada karyawan |
| WIN-02 | Windows — baseline notifikasi | Pada instalasi/profil yang belum pernah mencatat order, buka daftar order yang sudah ada | Daftar awal tidak membunyikan TTS; baseline dianggap sudah dilihat |
| WIN-03 | Windows — order valid baru | Dengan Monitor berjalan, amati order **riil** yang baru diposting @evogamings; tunggu siklus pembacaan ±30 detik (bukan jaminan SLA) | Order baru masuk antrean, tray/teks muncul dan TTS membacakan “SAYA AKAN LAWAN!!” jika suara aktif |
| WIN-04 | Windows — dedupe dan restart | Setelah WIN-03, segarkan layar, pindah tab, restart aplikasi, dan observasi order yang sama tanpa mengubah order | Referensi lama tidak mengeluarkan alert berulang |
| WIN-05 | Windows — background | Minimalkan aplikasi ke tray saat pengamatan order sah berikutnya | Alert tetap terdeteksi saat app masih berjalan; bila aplikasi ditutup penuh, jangan mengharapkan pemantauan |
| WIN-06 | Windows — suara nonaktif/fallback | Nonaktifkan suara; amati alert berikutnya. Periksa TTS sistem secara lokal bila suara tidak keluar | UI/tray tetap bekerja saat suara mati; bila SAPI tidak tersedia, bunyi sistem menjadi fallback, bukan jaminan suara bahasa Indonesia |
| AND-01 | Android — instal berdampingan | Pasang rilis 1.7.0 pada perangkat yang masih memiliki APK lama | Dua aplikasi tetap terpasang, data APK lama tidak dicopot/dihapus, aplikasi baru meminta login |
| AND-02 | Android — izin & baseline | Login, pilih izin notifikasi, aktifkan pemantauan; amati daftar awal | Izin jelas, foreground service memiliki notifikasi tetap, order awal tidak dibacakan ulang |
| AND-03 | Android — notif + TTS | Dengan izin diizinkan, app berjalan/pemantauan aktif; tunggu **order FH3 riil baru** | Notifikasi baru tampil; TTS membacakan frasa bila suara aktif dan mesin TTS tersedia |
| AND-04 | Android — pindah latar | Minimalkan aplikasi tanpa force-stop selama pengamatan order sah berikutnya | Foreground service berlanjut sesuai izin dan kebijakan OS; catat hasil tiap vendor/versi OS |
| AND-05 | Android — pembatasan OS | Uji izin notifikasi ditolak, mode baterai terbatas, dan force-stop **tanpa** menyentuh tugas pelanggan | Batasan OS didokumentasikan dengan akurat; jangan menandai kegagalan tanpa membedakan kondisi perangkat |
| AND-06 | Android — dedupe, logout | Amati order lama, refresh/restart; logout | Tidak ada alert ganda; pemantauan dan service berhenti setelah logout |
| ROLE-01 | Admin vs karyawan | Periksa halaman order, penghasilan tim dan tombol manajemen memakai dua role sah | Penghasilan tim yang diizinkan tetap terbaca; karyawan hanya dapat mengambil/mengelola pekerjaannya, tanpa hak admin atau Payroll Website |
| ARC-01 | Arsip order baru/aktif | Pada **order riil yang memang disetujui untuk ditangani**, uji arsip dengan alasan; periksa restore | Tombol Hapus Order hanya admin; histori tidak terhapus; item tersembunyi selama arsip; pulih setelah restore |
| DATA-01 | Regresi data historis | Bandingkan daftar/read-only Payroll, karyawan, upah/gaji dan Closing sebelum/sesudah proses di atas | Tidak ada pembaruan tak disengaja; sinkronisasi Google Sheets masuk tetap tidak aktif |

**Catatan:** beberapa skenario butuh kedatangan order nyata baru. Jika belum ada, beri status `BLOCKED` dan lanjutkan setelah ada order sah; **jangan** membuat order palsu atau memakai data pelanggan sebagai fixture. Setiap TAKE/START/DONE pada order aktif hanya boleh dilakukan oleh petugas yang berwenang dalam pekerjaan sebenarnya, mengikuti instruksi order asli. Jika delivery Telegram berstatus `sending`/`unknown`, hentikan tindakan lanjutan dan rekonsiliasi manual di grup sebelum retry.

## Pemeriksaan penutupan / regresi (tanpa perubahan data)

1. Verifikasi antarmuka menampilkan **Order Baru**, **Tugas Aktif**, **Order Selesai**, **Kelola Order** dan **Data Tutup Buku** sesuai role.
2. Verifikasi arsip adalah soft-delete yang bisa dipulihkan; untuk order yang sudah ditutup, snapshot dan histori TAKE/START/DONE tidak berubah.
3. Tinjau bahwa Google Sheets **tidak** menjadi sumber masuk order Monitor dan order X yang hanya muncul pada Payroll lama tidak otomatis masuk antrean FH3.
4. Cek fungsi **Tutup Buku manual** dan keterbacaan penghasilan untuk anggota Monitor aktif; jangan menutup ulang buku lama atau mengubah upah hanya demi uji.
5. Catat hasil pengamatan keamanan: kegagalan otorisasi, kehilangan data, notifikasi berulang, atau perubahan pada Payroll lama adalah **release blocker**.

## Template laporan hasil

```text
Tanggal/jam WIB:
Perangkat dan OS:
Aplikasi / versi / paket:
Akun uji (hanya peran: admin/karyawan, tanpa identitas/password):
Skenario ID:
Status: PASS / FAIL / BLOCKED / NOT RUN
Langkah aktual dan hasil:
Kondisi izin, baterai, jaringan, suara:
Waktu diterima order -> waktu alert (bila tersedia):
Bukti aman (nama file/screenshot tanpa data sensitif):
Nomor isu/PR untuk tindak lanjut:
```

## Keputusan rilis / tindak lanjut

- Tidak boleh mengklaim **notifikasi perangkat fisik lulus** hanya dari pengujian unit, emulator, preview, checksum, atau CI.
- Bila ada kegagalan, buat perbaikan **pada branch terpisah**, mulai dengan reproduksi dan tes regresi; jangan langsung mengganti binary Windows 2.0.2 atau APK Android 1.7.0.
- PR lama #70, #71, #80, #82 perlu direview terhadap `main` terbaru sebelum dipakai. Jangan merge desain/penanganan order historis yang berisiko mengembalikan sumber Payroll lama atau membatalkan perbaikan yang sudah digabung.
- Perlu pertimbangan terpisah untuk mengaktifkan **branch protection** pada `main` (terdeteksi belum terlindungi pada 25 Oktober 2026). Jangan ubah pengaturan repository tanpa persetujuan pemilik.
- Akhiri QA dengan daftar PASS/FAIL/BLOCKED, daftar masalah terurut, dan keputusan pemilik tentang PR/deploy/migrasi berikutnya.

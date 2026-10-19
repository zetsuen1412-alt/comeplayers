# CP Boost Monitor — Windows v1.2.0 (Native .NET 8)

CP Boost Monitor untuk Windows 10/11 (64-bit). Aplikasi native **WinForms** dengan UI desktop; tidak memakai browser atau layanan desktop terpisah.

## Fungsi
- Login admin Payroll ComePlayers, menggunakan endpoint `/api/admin/payroll/mobile/session` yang sama dengan Android; token disimpan dalam file terenkripsi **Windows DPAPI (CurrentUser)**, password tidak disimpan.
- Dashboard jumlah order baru/tugas aktif/karyawan FH3.
- Order Baru: baca langsung dari **Payroll Website**, pilih karyawan FH3 aktif, klik **Tugaskan karyawan**; website melakukan penugasan atomik.
- Tugas Aktif: **START + Screenshot**, **DONE + Screenshot** untuk order satu pekerja FH3, foto PNG/JPEG sampai **7 MB**, diambil dari file atau clipboard Windows (**Win+Shift+S** → pilih opsi Clipboard).
- Telegram: foto otomatis dikirim backend ComePlayers ke grup **🔥 EVO🔥 Ilham FH3**. Pesan seperti `x4671/mulyana/start` dan `x4671/mulyana/done` berasal dari nama roster server, bukan input pengguna.
- **Periksa grup FH3** memvalidasi Telegram secara read-only tanpa mengirim foto.
- Karyawan: status lokal **Ready Boosting/Farming/Tidur/Sedang Bekerja** yang disimpan di PC, dilengkapi Riwayat dan ekspor CSV. Status lokal tidak mengubah status Payroll/Android.
- Auto-poll setiap **30 detik** selama aplikasi aktif, dengan notifikasi Windows untuk order baru setelah pembacaan pertama. Tidak ada retry otomatis pada upload foto untuk menghindari pesan duplikat di Telegram.

## Keamanan
- Service-role Supabase dan token bot Telegram **tidak disertakan** dalam aplikasi; hanya backend website yang mengetahui.
- Endpoint yang diakses memakai URL HTTPS tetap `https://www.comeplayers.com/api/admin/payroll/mobile/`; HTTP redirects tidak diikuti.
- Access & refresh tokens disimpan dengan Windows DPAPI untuk **akun Windows saat ini** di `%LOCALAPPDATA%\ComePlayers\CPBoostMonitor\session.dat`.
- File screenshot tidak dikopi permanen ke aplikasi: konten dibaca ke memori dan dikirim ke website. Foto/dokumen tidak disimpan di status lokal.
- Gambar START/DONE tidak pernah diulang otomatis setelah timeout; admin wajib cek Telegram apabila respons tidak jelas.
- Status lokal tersimpan `%LOCALAPPDATA%\ComePlayers\CPBoostMonitor\local-status.json`, terpisah dari data Android.

## Unduh / pasang
1. Pada GitHub Releases proyek ComePlayers, buka **CP Boost Monitor Windows v1.2 — PREVIEW**.
2. Unduh `CP-Boost-Monitor-Windows-v1.2.0-x64.zip` atau `CPBoostMonitor-Windows-v1.2.0-PREVIEW.exe`.
3. Ekstrak ZIP, lalu jalankan `CPBoostMonitor.exe`. Tidak perlu memasang .NET secara terpisah karena dipaketkan *self-contained*. Untuk versi .exe preview, jalankan langsung.
4. Login memakai akun admin Payroll, klik **Tugas Aktif → Periksa grup FH3**, kemudian baru uji menggunakan **order khusus percobaan**.
5. Tidak ada installer MSIX/certificate code-signing pada rilis pertama. Windows SmartScreen dapat menampilkan peringatan untuk file belum ditandatangani; jangan menonaktifkan keamanan Windows. Periksa asal berkas GitHub dan hash SHA-256 dari build resmi.

## Compile sendiri (Windows dengan .NET SDK 8)
```powershell
dotnet restore .\CP-BoostMonitor-Windows\CPBoostMonitor.Windows.csproj -r win-x64
dotnet publish .\CP-BoostMonitor-Windows\CPBoostMonitor.Windows.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:PublishTrimmed=false -o .\dist\windows
```
Hasil: `dist\windows\CPBoostMonitor.exe`. GitHub Actions `.github/workflows/cp-boost-monitor-windows.yml` membangun Windows x64 secara otomatis dan memasukkan file ZIP/EXE preview ke GitHub Release.

## Ruang lingkup v1
Khusus FH3, order Boosting/Item non-DAY, satu pekerja per order dan admin yang memiliki izin Payroll. Tidak ada sinkronisasi status lokal Android↔PC, belum ada offline queue, dan belum ada auto-update. Perubahan order/START/DONE selalu online melalui website. Aplikasi Windows **tidak** menggantikan Payroll Website atau Telegram.

## Perubahan v1.2
- Pencarian order baru langsung pada tabel: kode order, game, buyer, jenis order dan TASK.
- Pencarian tugas aktif: kode, nama/kode karyawan, status, game dan TASK, ditambah filter **Semua Status / assigned / in_progress / on_hold**.
- Pencarian karyawan menurut nama, kode, divisi dan status lokal.
- **Preview screenshot sebelum pengiriman**: gambar file/clipboard muncul pada layar konfirmasi. Admin harus menekan tombol **Kirim Foto START/DONE** sebelum backend dihubungi. Foto tidak disimpan oleh aplikasi.
- Pencarian tidak mempengaruhi data Payroll atau sinkronisasi berkala dan tidak mengubah urutan tugas.
- Test filter dapat dijalankan tanpa akses ke data pelanggan: `dotnet run --project CP-BoostMonitor-Windows.Tests/CPBoostMonitor.Windows.Tests.csproj -c Release`.
- GitHub Actions Windows menjalankan tes tersebut sebelum menghasilkan EXE/ZIP v1.2.

Catatan: aplikasi Windows tetap memerlukan login admin untuk menugaskan dan mengirim bukti Telegram. Build CI belum menggantikan pemeriksaan pada PC sungguhan. Screenshot yang dipilih pengguna dikirim hanya setelah konfirmasi.


## Executive Dark Luxury v1.2
Tampilan desktop memakai palet bersama Android: charcoal #0B101A, panel #192437, champagne gold #D4AF37, border halus dan tekstur warna gelap bertingkat. Dashboard baru memiliki hero status Payroll, tiga KPI live (Order Baru, Tugas Aktif, Karyawan FH3), quick actions serta langkah operasional. Sidebar, tabel dan tombol memakai komponen native WinForms bergaya premium. Dialog screenshot tetap mengharuskan konfirmasi sebelum mengirim foto ke grup FH3.

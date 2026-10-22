# EVOGAMING Monitor — Windows v1.8 (Native .NET 8)

Current behavior and installation: [Completed orders + dimensional UI](../docs/monitor-completed-orders-3d-2026-10-22.md).
Only verified @evogamings FH3 posts supply orders/TASK. Unpriced orders can be
taken into a separate operational journal; TAKE/START/DONE reports go to Telegram.
The Order Selesai menu replaces Payroll: per-employee counts and lists include
only confirmed Telegram DONE reports from Monitor. This client no longer requests
salary data. Existing website financial data and local status/session files remain.

The following sections document earlier versions; the current guide supersedes
their old Payroll-only source, missing salary view, and versioned download links.

EVOGAMING Monitor untuk Windows 10/11 (64-bit). Aplikasi native **WinForms** dengan UI desktop; tidak memakai browser atau layanan desktop terpisah.

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
1. Pada GitHub Releases proyek ComePlayers, buka **EVOGAMING Monitor Windows v1.3.0 — PREVIEW**.
2. Unduh `EVOGAMING-Monitor-Windows-v1.3.0-x64.zip` atau `CPBoostMonitor-Windows-v1.3.0-PREVIEW.exe`.
3. Ekstrak ZIP, lalu jalankan `EVOGAMINGMonitor.exe`. Tidak perlu memasang .NET secara terpisah karena dipaketkan *self-contained*. Untuk versi .exe preview, jalankan langsung.
4. Login memakai akun admin Payroll, klik **Tugas Aktif → Periksa grup FH3**, kemudian baru uji menggunakan **order khusus percobaan**.
5. Tidak ada installer MSIX/certificate code-signing pada rilis pertama. Windows SmartScreen dapat menampilkan peringatan untuk file belum ditandatangani; jangan menonaktifkan keamanan Windows. Periksa asal berkas GitHub dan hash SHA-256 dari build resmi.

## Compile sendiri (Windows dengan .NET SDK 8)
```powershell
dotnet restore .\CP-BoostMonitor-Windows\CPBoostMonitor.Windows.csproj -r win-x64
dotnet publish .\CP-BoostMonitor-Windows\CPBoostMonitor.Windows.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:PublishTrimmed=false -o .\dist\windows
```
Hasil: `dist\windows\EVOGAMINGMonitor.exe`. GitHub Actions `.github/workflows/cp-boost-monitor-windows.yml` membangun Windows x64 secara otomatis dan memasukkan file ZIP/EXE preview ke GitHub Release.

## Ruang lingkup v1
Khusus FH3, order Boosting/Item non-DAY, satu pekerja per order dan admin yang memiliki izin Payroll. Tidak ada sinkronisasi status lokal Android↔PC, belum ada offline queue, dan belum ada auto-update. Perubahan order/START/DONE selalu online melalui website. Aplikasi Windows **tidak** menggantikan Payroll Website atau Telegram.

## Perubahan v1.3.0
- Pencarian order baru langsung pada tabel: kode order, game, buyer, jenis order dan TASK.
- Pencarian tugas aktif: kode, nama/kode karyawan, status, game dan TASK, ditambah filter **Semua Status / assigned / in_progress / on_hold**.
- Pencarian karyawan menurut nama, kode, divisi dan status lokal.
- **Preview screenshot sebelum pengiriman**: gambar file/clipboard muncul pada layar konfirmasi. Admin harus menekan tombol **Kirim Foto START/DONE** sebelum backend dihubungi. Foto tidak disimpan oleh aplikasi.
- Pencarian tidak mempengaruhi data Payroll atau sinkronisasi berkala dan tidak mengubah urutan tugas.
- Test filter dapat dijalankan tanpa akses ke data pelanggan: `dotnet run --project CP-BoostMonitor-Windows.Tests/CPBoostMonitor.Windows.Tests.csproj -c Release`.
- GitHub Actions Windows menjalankan tes tersebut sebelum menghasilkan EXE/ZIP v1.3.0.

Catatan: aplikasi Windows tetap memerlukan login admin untuk menugaskan dan mengirim bukti Telegram. Build CI belum menggantikan pemeriksaan pada PC sungguhan. Screenshot yang dipilih pengguna dikirim hanya setelah konfirmasi.


## Future Silver & Ice Blue v1.3.0
Tampilan desktop memakai palet bersama Android: charcoal #0B101A, panel #192437, champagne gold #D4AF37, border halus dan tekstur warna gelap bertingkat. Dashboard baru memiliki hero status Payroll, tiga KPI live (Order Baru, Tugas Aktif, Karyawan FH3), quick actions serta langkah operasional. Sidebar, tabel dan tombol memakai komponen native WinForms bergaya premium. Dialog screenshot tetap mengharuskan konfirmasi sebelum mengirim foto ke grup FH3.

## EVOGAMING Monitor v1.3 • Future Silver
Identitas baru **EVOGAMING Monitor** dengan palet silver #EEF4FA, putih #F8FBFF, biru muda #8FD3FF, teks navy #18324A. Tampilan login yang lebih lega, tombol gradasi, sidebar dan tabel elegan, serta titlebar silver pada Windows 11 yang mendukungnya. Endpoint tetap menggunakan ComePlayers Payroll, tidak mengubah database, token, status order, atau Telegram.

## EVOGAMING Monitor Windows v1.4 — Take Order Workspace
Tema utama adalah **Dark Soft Blue** (background #111827, sidebar #0F172A, panel #1E293B, aksen #60A5FA). Menggantikan dashboard silver terang dan hero/KPI yang melelahkan mata.

**Halaman pertama setelah login: Take Order.** Karyawan FH3 ditampilkan di **kolom kiri (40%)** dan order baru Payroll Website di **kolom kanan (60%)**, tanpa KPI atau blok dashboard. Masing-masing memiliki pencarian; kolom karyawan punya filter status lokal. Admin klik satu baris karyawan dan satu baris order, lalu tombol **TAKE ORDER** di panel bawah aktif. Penugasan tetap melalui RPC Payroll website, perlu konfirmasi final, tidak mengirim bukti Telegram sampai operator melakukan START di menu Tugas Aktif.

Pilihan yang menghilang dari pembaruan Payroll atau disembunyikan melalui filter dibersihkan otomatis agar tidak salah menugaskan order. Setelah sukses, pilihan dikosongkan, order diperbarui, dan admin dapat membuka Tugas Aktif untuk mengirim screenshot START/DONE seperti sebelumnya.

**Cara uji:** pilih karyawan dan order uji yang benar-benar diizinkan. Tidak ada assignment saat sekadar memilih atau memfilter baris. Gunakan tombol konfirmasi TAKE ORDER untuk menulis ke backend. Jangan gunakan order pelanggan sebagai percobaan. Menu Tugas Aktif, Karyawan, Riwayat dan Pengaturan tetap tersedia.

Rilis pratinjau: https://github.com/zetsuen1412-alt/comeplayers/releases/tag/evogaming-monitor-windows-v1.4-take-order-preview. Berkas ZIP berisi `EVOGAMINGMonitor.exe`; EXE self-contained tidak perlu instal .NET. Belum code-signed dan tidak mengubah website/Android produksi.

## v1.5 — Semua Operasional dalam Satu Halaman

Setelah login, halaman utama **Take Order** memperlihatkan tiga panel sekaligus:

- **Kiri (40%)**: daftar karyawan FH3, pencarian, filter status, **ubah status karyawan langsung**.
- **Kanan atas**: Order Baru, pencarian dan pilihan order.
- **Kanan bawah**: Tugas Aktif, pilih tugas → **START + Foto** / **DONE + Foto**.
- **Bawah**: ringkasan karyawan+order pilihan dan tombol **TAKE ORDER**. Pemilihan baris saja tidak mengirim perintah; operator harus menekan dan mengonfirmasi TAKE ORDER.

Menu kiri disederhanakan menjadi **Take Order / Riwayat / Pengaturan**. Seluruh data order dan tugas tetap bersumber dari Payroll Website; bukti screenshot tetap menggunakan endpoint resmi ke Telegram FH3. TAKE ORDER tidak mengirim foto START secara otomatis.

### Status karyawan dan durasi Tidur

Pilih satu karyawan pada panel kiri, pilih **Ready Boosting / Sedang Bekerja / Tidur / Farming / Istirahat / Offline**, lalu tekan **Ubah Status**. Untuk status Tidur, pilih durasi **30 menit, 1 jam, 2 jam, 4 jam, atau Custom (1–1440 menit)** serta centang atau nonaktifkan **Otomatis kembali ke Ready Boosting**.

Tabel menampilkan sisa durasi, contohnya **Tidur • 52m lagi**, dengan pembaruan hitung mundur berkala. Jika auto Ready diaktifkan, karyawan kembali Ready setelah batas waktu, juga bila aplikasi baru dinyalakan setelah waktu habis. Jika auto Ready tidak diaktifkan, status tetap **Tidur • durasi habis** sampai operator mengubahnya. Perubahan otomatis dicatat pada riwayat lokal.

**PENTING:** Status, countdown dan histori ini disimpan pada **PC Windows ini saja** (file lokal lama kompatibel). Saat ini **tidak disinkronkan** ke Payroll Website, Android, atau Windows PC lain. Status tidak mengubah penugasan order yang sudah berjalan. Untuk mencegah salah penugasan, karyawan berstatus Tidur, Istirahat atau Offline diminta diubah ke Ready sebelum TAKE ORDER.

Uji otomatis di `CP-BoostMonitor-Windows.Tests` mencakup jadwal tidur, expiry, auto-ready, manual, batas 1–1440 menit, persistensi/restart dan pembacaan status lokal versi sebelumnya.

Unduh preview v1.5 setelah Windows CI lulus: https://github.com/zetsuen1412-alt/comeplayers/releases/tag/evogaming-monitor-windows-v1.5-one-page-preview. Tidak memutakhirkan aplikasi produksi.


## v1.6 — TAKE → START → DONE
Klik **TAKE ORDER** mengirim pesan Telegram teks `x4671/mulyana/take` melalui API Payroll setelah penugasan tersimpan. Screenshot START dan DONE tetap dikirim manual. Jika penugasan tersimpan tetapi pesan TAKE belum terkonfirmasi, periksa grup lalu gunakan tombol **Kirim/Cek TAKE** pada panel Tugas Aktif. Tombol ini tidak akan mengirim duplikat setelah TAKE tercatat sukses. START membutuhkan TAKE terkonfirmasi.

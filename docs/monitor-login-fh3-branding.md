# Login lambat dan logo FH3

Windows 2.1.1 dan Android 1.8.1 (code 15), package dan sertifikat Android tetap sama.

## Bukti gangguan

Pemilik melaporkan Windows gagal login sementara website bisa login. Pada
2026-10-27 sekitar 11:53–12:00 Asia/Bangkok, log Vercel menunjukkan timeout 300
detik pada mobile/session dan beberapa endpoint lain. Log Auth juga memuat 504.
Pemeriksaan sekali memakai token refresh sintetis ditolak 401 dalam 2,48 detik;
login dengan username sintetis yang tidak memiliki akun ditolak 401 dalam
20,50 detik. Tidak ada password pemilik dipakai atau akun uji produksi dibuat.

Windows sebelumnya memberi 25 detik untuk login, lalu 20 detik untuk memeriksa
roster; Android memberi 65 detik untuk POST. Temuan ini menunjukkan batas Windows
mudah terlewati saat layanan melambat, tetapi tidak membuktikan satu penyebab
infrastruktur yang permanen. Tidak ada restart proyek, pembelian layanan atau
perubahan konfigurasi produksi dalam perbaikan ini.

## Perbaikan

- Windows memberi 65 detik untuk autentikasi, refresh dan pemeriksaan akses awal.
  GET berkala tetap 20 detik. Login/refresh serta laporan pekerjaan tidak diulang
  otomatis. Pesan membedakan waktu tunggu habis dan koneksi terputus.
- Android juga memberi waktu autentikasi untuk roster pertama setelah login.
- Endpoint sesi memiliki satu batas 50 detik dan membatalkan fetch Supabase
  pada setiap tahap. Batas fungsi 60 detik berada di bawah waktu tunggu aplikasi.
  Gangguan Auth/database dilaporkan 503, bukan password salah atau izin ditolak.
  Log diagnostik hanya berisi tahap tetap dan waktu, tanpa kredensial/identitas.
- Otorisasi akun, MFA, binding karyawan, sesi akun bersama dan pembatasan login
  tetap diperiksa. Token tidak dikembalikan sebelum pemeriksaan akses berhasil.
- Logo FH3 asli ditampilkan di Windows (sidebar, judul/taskbar, tray, popup),
  header Android, serta launcher Android dengan ikon adaptive dan fallback.
  Lihat `assets/monitor/README.md` untuk sumber dan konversi format ikon.

Tidak ada migrasi, perubahan data Payroll/gaji/Closing atau perubahan Telegram.
Sinkronisasi Sheets tetap dinonaktifkan.

## Validasi dan penerapan

Tes mencakup login lebih lambat dari batas GET, login macet, penyimpanan sesi
terverifikasi, pembatalan request, isolasi antar login perangkat, penolakan akses,
serta resource dan render logo Android 15/Windows. Build dan paket harus diverifikasi
sebelum publikasi. Hasil uji lokal dan manifest kandidat disimpan di folder outputs
task. Login akun pemilik dan HP fisik masih memerlukan pemeriksaan pemilik.

PR disiapkan pada branch terpisah. Merge, deploy backend dan penggantian paket
unduhan produksi memerlukan persetujuan pemilik sesuai batasan proyek.

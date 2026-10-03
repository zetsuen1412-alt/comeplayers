# ComePlayers Lowongan — browser bridge v1.3.4

Ekstensi ini dipakai bersama `https://www.comeplayers.com/admin/lowongan`. Ia memakai tab Facebook yang sudah login dan tidak meminta password atau cookie Facebook.

## Alur sederhana

1. Chrome/Edge → Extensions → Developer mode → Load unpacked → pilih folder ekstensi ini.
2. Login Facebook seperti biasa dan buka salah satu grup yang mengizinkan lowongan.
3. Klik ikon ComePlayers Lowongan → **Hubungkan tab Facebook ini**.
4. Di Admin Lowongan, pilih banner dan tempel daftar grup.
5. Klik **SCAN SEMUA POSTINGAN**. Ekstensi berpindah melalui daftar grup dan mengumpulkan posting/status yang ditemukan pada sesi scan.
6. Hasil scan ditandai semua secara default. Admin dapat membatalkan tanda pada posting tertentu.
7. Klik **KIRIM KOMENTAR**. Hanya posting yang masih ditandai yang masuk antrean.
8. Tekan **STOP** kapan saja untuk membatalkan tugas yang belum dikirim.

Scan bersifat read-only: tidak ada komentar yang dikirim sebelum admin menekan KIRIM KOMENTAR. Satu posting dideduplikasi dalam kampanye yang sama. Jika Facebook menampilkan checkpoint/pembatasan atau hasil pengiriman tidak dapat diverifikasi, sistem meminta pemeriksaan dan tidak melakukan retry buta.

Foto lowongan dapat berukuran sampai 5 MB (PNG/JPG/WebP).

## Pemeriksaan versi dan pengiriman

Setelah memuat ulang ekstensi, muat ulang halaman Admin Lowongan. Status Facebook harus menampilkan **ekstensi v1.3.4**. Jika masih versi lama, pastikan hanya satu salinan ComePlayers Lowongan yang aktif dan folder yang dimuat adalah folder versi ini.

Uji satu postingan biasa terlebih dahulu, lalu satu postingan modal. Pastikan komentar gambar tetap terlihat setelah memuat ulang post sebelum mencoba batch kecil 2–3 postingan. Jangan mengirim ulang tugas berstatus **perlu diperiksa** sampai hasil sebelumnya diperiksa langsung di Facebook.

Composer bertuliskan `Tulis jawaban...` hanya boleh dipakai jika struktur halaman menunjukkan composer milik post. Composer balasan di dalam komentar ditolak. Riwayat menampilkan tahap terakhir tanpa menyimpan isi post atau identitas Facebook. Target yang tidak mendukung komentar gambar dilewati sebelum kirim; hasil ambigu sesudah kirim menghentikan batch untuk diperiksa.

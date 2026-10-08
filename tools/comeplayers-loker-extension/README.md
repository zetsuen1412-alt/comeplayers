# ComePlayers Lowongan — browser bridge v1.3.7

## Perbaikan scan v1.3.7 — 8 Oktober 2026

Scan menunggu hingga 45 detik untuk postingan pertama dan tautan waktunya.
Pada v1.3.6, lima pemeriksaan kosong dapat mengakhiri scan dalam sekitar
4,5 detik meskipun feed masih memuat. Setelah menemukan postingan, scan tetap
berhenti ketika tidak ada hasil baru dalam lima pemeriksaan berturut-turut.
STOP tetap menghentikan scan; perubahan tujuan atau pemeriksaan keamanan
Facebook menghentikannya dengan pesan yang sesuai. Jika feed belum terbaca,
Admin menampilkan pesan yang dapat ditindaklanjuti.

Muat folder v1.3.7 melalui Load unpacked, pastikan hanya satu salinan ekstensi
aktif, hubungkan tab grup Facebook dan muat ulang Admin Lowongan. Periksa
status **ekstensi v1.3.7**, lalu scan kembali. Komentar tetap memerlukan
pemeriksaan daftar dan klik KIRIM KOMENTAR.

Paket ini berisi perbaikan lokal dari commit v1.3.6
`6f27b29ddb75579fd75e167e66aaaf73a2fe612d`.
Pengujian scan menggunakan DOM sintetis dengan jaringan diblokir, bukan
bukti bahwa postingan atau komentar berhasil pada akun Facebook nyata.

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

Setelah memuat ulang ekstensi, muat ulang halaman Admin Lowongan. Status Facebook harus menampilkan **ekstensi v1.3.7**. Jika masih versi lama, pastikan hanya satu salinan ComePlayers Lowongan yang aktif dan folder yang dimuat adalah folder versi ini.

Versi 1.3.6 juga mengenali postingan feed dalam container DIV biasa, apabila ada penanda isi postingan dan tautan header yang jelas. Tautan komentar/balasan dan tautan yang hanya disebut di isi postingan tidak digunakan sebagai bukti target. Untuk postingan yang disetujui, ekstensi dapat memakai feed grup yang sudah terbuka jika hanya ada satu postingan dengan tautan target dan kolom komentar utama yang cocok. Jika pemeriksaan ini tidak terpenuhi, ekstensi membuka tautan postingan secara langsung seperti sebelumnya.

STOP tetap diperiksa sebelum dan setelah pemeriksaan feed serta sebelum klik kirim. Foto milik tugas yang belum dikirim dapat dibersihkan di feed yang sama; apabila tautan target berubah atau kepemilikan draf tidak jelas, sistem meminta pemeriksaan.

Uji satu postingan biasa terlebih dahulu, lalu satu postingan modal. Pastikan komentar gambar tetap terlihat setelah memuat ulang post sebelum mencoba batch kecil 2–3 postingan. Jangan mengirim ulang tugas berstatus **perlu diperiksa** sampai hasil sebelumnya diperiksa langsung di Facebook.

Composer bertuliskan `Tulis jawaban...` hanya boleh dipakai jika struktur halaman menunjukkan composer milik post. Composer balasan di dalam komentar ditolak. Riwayat menampilkan tahap terakhir tanpa menyimpan isi post atau identitas Facebook. Target yang tidak mendukung komentar gambar dilewati sebelum kirim; hasil ambigu sesudah kirim menghentikan batch untuk diperiksa.

Preview kecil di samping form dideteksi dalam container composer yang sama. Jika tugas berhenti sebelum kirim, ekstensi menghapus hanya foto yang baru dipasangnya sendiri. Draf yang sudah ada atau foto yang tidak terbukti bersih menghentikan antrean agar tidak meninggalkan draf saat pindah post.

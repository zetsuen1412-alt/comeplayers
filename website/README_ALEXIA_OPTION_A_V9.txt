COMEPLAYERS — ALEXIA OPTION A V9
================================

IMPLEMENTASI
- Homepage stabil memakai satu gambar dasar agar panel tidak bergeser.
- Alexia memakai overlay ber-mask untuk idle, senyum, arah Chat, dan arah Marketplace.
- Kedipan hanya diterapkan pada area wajah agar tidak terjadi pergantian seluruh gambar.
- Gerakan cursor menggunakan requestAnimationFrame dan smoothing, bukan React re-render per frame.
- Parallax kamera, breathing lembut, partikel, scanline, cursor aura, dan panel glow.
- Transisi klik bergaya game sebelum membuka halaman.
- Header/footer lama tertutup oleh homepage full-screen.
- Route /marketplace TIDAK dimodifikasi.
- Tanpa dependency baru.

CARA PASANG
1. Stop server dengan Ctrl+C.
2. Extract seluruh isi ZIP langsung ke folder website, contoh:
   C:\Comeplayers-new\website
3. Pastikan file INSTALL_ALEXIA_OPTION_A_V9.bat berada di folder yang sama dengan package.json.
4. Klik dua kali INSTALL_ALEXIA_OPTION_A_V9.bat.
5. Jalankan npm run dev.
6. Buka http://localhost:3000 lalu tekan Ctrl+F5.

KONTROL
- Gerakkan cursor untuk parallax dan arah kepala halus.
- Hover panel kiri untuk state Chat.
- Hover panel kanan untuk state Marketplace.
- Tab + Enter dapat digunakan melalui keyboard.

CATATAN 60 FPS
Animasi dijalankan dengan requestAnimationFrame dan transform/opacity berbasis compositor,
sehingga browser menargetkan refresh layar hingga 60 FPS. Ini bukan video 60-frame asli;
gerakan karakter dibuat dari layered state dan crossfade yang stabil.

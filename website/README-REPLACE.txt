COMEPLAYERS HEADER + SERVER PATCH

Cara pasang:
1. Tutup server development terlebih dahulu.
2. Ekstrak isi ZIP ini langsung ke folder: C:\Comeplayers-new\website
3. Pilih Replace/Replace all ketika Windows menanyakan file yang sama.
4. Jalankan: npm run build
5. Jika berhasil, jalankan/deploy seperti biasa.

Perubahan:
- Header utama memakai logo simbol saja.
- Header Messages memakai logo simbol saja dan dibuat lebih ringkas.
- Tombol Sell With Us dan pencarian Marketplace di header utama dihapus.
- Seller Center di menu Create halaman Messages dihapus.
- Istilah tampilan Group/Community di Messages diubah menjadi Server.
- Sidebar server, ganti ikon server, dan link invite permanen tetap memakai sistem yang sudah ada.

Catatan:
- Nama tabel, route /api/messages/groups, dan room_type=group sengaja tidak diubah agar database lama tetap kompatibel.

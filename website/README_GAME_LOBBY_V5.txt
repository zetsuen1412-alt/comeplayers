COMEPLAYERS GAME LOBBY V5 - PIXIJS

HASIL V5
- Homepage full-screen bergaya menu/lobby game.
- PixiJS merender scene di canvas WebGL.
- Alexia memiliki gerakan idle/breathing halus.
- Kamera dan scene mengikuti cursor dengan parallax lembut.
- Partikel emas bergerak real-time.
- Hover Chat membuat Alexia melihat kiri dan panel Chat menyala.
- Hover Marketplace membuat Alexia melihat kanan dan panel Marketplace menyala.
- Perpindahan state memakai crossfade halus.
- Klik menu menjalankan suara confirm dan transisi scene.
- Header/footer website otomatis disembunyikan hanya di homepage.
- Halaman lain tetap menggunakan header/footer lama.
- Mobile mendapatkan dua tombol pilihan yang mudah disentuh.

CARA INSTALL
1. Hentikan server dengan Ctrl+C.
2. Extract SEMUA isi ZIP langsung ke:
   C:\Comeplayers-new\website
3. Pastikan file ini ada:
   C:\Comeplayers-new\website\INSTALL_GAME_LOBBY_V5.bat
4. Klik dua kali INSTALL_GAME_LOBBY_V5.bat
   ATAU jalankan dari PowerShell:
   powershell -ExecutionPolicy Bypass -File .\APPLY_GAME_LOBBY_V5.ps1
5. Installer akan memasang pixi.js@8.14.3 bila belum ada.
6. Jalankan:
   npm run dev
7. Buka http://localhost:3000 dan tekan Ctrl+F5.
8. Pastikan badge "GAME LOBBY V5 · PIXIJS" terlihat di kanan bawah.

CATATAN
- Internet diperlukan satu kali ketika npm memasang PixiJS.
- Installer membuat backup otomatis sebelum mengganti file.
- Link kiri membuka /messages.
- Link kanan membuka /marketplace.

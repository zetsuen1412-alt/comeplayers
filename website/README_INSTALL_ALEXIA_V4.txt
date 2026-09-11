COMEPLAYERS ALEXIA HOME V4 SMOOTH

PERUBAHAN V4
- Pergerakan cursor memakai requestAnimationFrame + spring, bukan render React setiap mousemove.
- Perpindahan idle, Chat, dan Marketplace memakai crossfade halus.
- Alexia memiliki efek bernapas lembut.
- Rambut memiliki sway halus.
- Kepala dan mata mengikuti cursor secara lebih lembut pada posisi idle.
- Hover panel mempunyai glow bertahap dan pulse lembut.
- Tidak menambah package/dependency baru.

CARA INSTALL
1. Hentikan server dengan Ctrl+C.
2. Extract SEMUA isi ZIP langsung ke folder:
   C:\Comeplayers-new\website
3. Klik dua kali INSTALL_ALEXIA_V4.bat
   ATAU jalankan:
   powershell -ExecutionPolicy Bypass -File .\APPLY_ALEXIA_HOME_V4.ps1
4. Jalankan:
   npm run dev
5. Buka http://localhost:3000 lalu tekan Ctrl+F5.
6. Pastikan badge "ALEXIA HOME V4 · SMOOTH" terlihat di kanan bawah.

CATATAN
V4 membuat gambar statis terasa lebih natural, tetapi belum setara rig Live2D penuh.
File app/page.tsx lama dibackup otomatis sebelum diganti.

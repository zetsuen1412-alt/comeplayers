COMEPLAYERS ALEXIA HOME V3

1. Tutup server dengan Ctrl+C.
2. Extract SEMUA isi ZIP langsung ke folder:
   C:\Comeplayers-new\website
3. Klik dua kali INSTALL_ALEXIA_V3.bat
   ATAU jalankan:
   powershell -ExecutionPolicy Bypass -File .\APPLY_ALEXIA_HOME_V3.ps1
4. Jalankan npm run dev
5. Buka http://localhost:3000 lalu Ctrl+F5
6. Pastikan muncul badge kecil "ALEXIA HOME V3" di kanan bawah.

Patch ini memaksa app/page.tsx memakai app/AlexiaHomeV3.tsx.
Homepage lama tidak lagi dipakai oleh route /.
File lama app/page.tsx dibackup otomatis.

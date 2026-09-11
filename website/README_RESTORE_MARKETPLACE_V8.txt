COMEPLAYERS MARKETPLACE RESTORE V8

Patch ini hanya mengembalikan route /marketplace ke halaman marketplace asli.
Homepage / dengan Game Lobby Cyberpunk tetap dipertahankan.

CARA PASANG:
1. Hentikan npm run dev dengan Ctrl+C.
2. Extract seluruh isi ZIP langsung ke C:\Comeplayers-new\website
3. Pilih Replace/Timpa semua file.
4. Jalankan INSTALL_RESTORE_MARKETPLACE_V8.bat
5. Jalankan npm run dev
6. Buka http://localhost:3000/marketplace lalu tekan Ctrl+F5.

FILE YANG DIUBAH:
- app/marketplace/page.tsx
- app/marketplace/MarketplaceClient.tsx

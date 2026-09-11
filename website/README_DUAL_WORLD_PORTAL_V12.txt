ComePlayers Dual World Portal V12

Cara pasang:
1. Hentikan server dengan Ctrl+C.
2. Extract seluruh isi ZIP ini langsung ke folder website proyek:
   C:\Comeplayers-new\website
3. Pilih Replace / Timpa semua file.
4. Jalankan INSTALL_DUAL_WORLD_PORTAL_V12.bat
5. Jalankan kembali npm run dev lalu buka http://localhost:3000

Catatan:
- Homepage / akan berubah ke desain Dual World Portal.
- Route /marketplace tidak diubah.
- Untuk tombol download, atur file .env.local:
  NEXT_PUBLIC_COMEPLAYERS_PC_URL=https://alamat-download-pc
  NEXT_PUBLIC_COMEPLAYERS_ANDROID_URL=https://alamat-download-android

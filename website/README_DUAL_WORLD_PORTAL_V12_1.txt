ComePlayers Dual World Portal V12.1 (Corrected)

Versi ini memakai desain referensi Dual World Portal secara langsung supaya hasil visual sama dengan contoh pilihan.

Cara pasang:
1. Hentikan server: Ctrl+C
2. Extract seluruh isi ZIP langsung ke:
   C:\Comeplayers-new\website
3. Pilih Replace / Timpa semua file.
4. Jalankan INSTALL_DUAL_WORLD_PORTAL_V12_1.bat
5. Jalankan npm run dev
6. Buka http://localhost:3000 lalu tekan Ctrl+F5

Route /marketplace tidak diubah.

Untuk tombol download, isi .env.local:
NEXT_PUBLIC_COMEPLAYERS_PC_URL=https://alamat-download-pc
NEXT_PUBLIC_COMEPLAYERS_ANDROID_URL=https://alamat-download-android

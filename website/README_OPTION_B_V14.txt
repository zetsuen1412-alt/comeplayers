ComePlayers Dual World Portal - Option B V14

Isi:
- Tampilan mengikuti mockup final Option B.
- Tombol dibuat sebagai HTML/CSS asli dan terpisah dari gambar.
- Chat menuju /messages.
- Marketplace menuju /marketplace.
- Tombol pendukung membuka modal atau email.
- Tombol Windows/Android membaca URL dari .env.local.
- Portal glow, gerakan karakter ringan, parallax cursor, ambience, hover sound, dan click sound.
- Route /marketplace tidak diubah.

Cara pasang:
1. Hentikan server dengan Ctrl+C.
2. Extract seluruh isi ZIP langsung ke C:\Comeplayers-new\website
3. Pilih Replace / Timpa semua file.
4. Jalankan INSTALL_OPTION_B_V14.bat
5. Jalankan npm run dev
6. Buka http://localhost:3000 lalu tekan Ctrl+F5

Konfigurasi opsional di .env.local:
NEXT_PUBLIC_COMEPLAYERS_PC_URL=https://alamat-download-windows
NEXT_PUBLIC_COMEPLAYERS_ANDROID_URL=https://alamat-download-android
NEXT_PUBLIC_SUPPORT_EMAIL=support@comeplayers.com

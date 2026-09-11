ComePlayers Messages Chat Loader V17 - Full Ready Gate

Tujuan:
- Loader muncul segera saat route /messages dibuka melalui app/messages/loading.tsx.
- Loader tetap menutupi seluruh halaman selama proses data Messages masih berjalan.
- Progress tidak pernah mencapai 100% sebelum loading data asli selesai.
- Setelah data selesai, loader menunggu font dan dua frame browser agar UI benar-benar siap ditampilkan.
- Progress mencapai 100%, ditahan sebentar, lalu halaman Messages muncul.

Cara pasang:
1. Hentikan npm run dev dengan Ctrl+C.
2. Extract seluruh isi ZIP langsung ke C:\Comeplayers-new\website.
3. Pilih Replace / Timpa semua file.
4. Jalankan INSTALL_MESSAGES_CHAT_LOADER_V17.bat.
5. Jalankan npm run dev.
6. Buka http://localhost:3000/messages lalu Ctrl+F5.

Patch hanya menyentuh loader Messages dan membuat backup page.tsx.

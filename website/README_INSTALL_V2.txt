COMEPLAYERS ALEXIA INTERACTIVE HOME - WEBSITE ROOT V2

PENTING:
ZIP ini harus diekstrak LANGSUNG ke folder website yang berisi package.json.
Jangan ekstrak ke folder di atasnya dan jangan ekstrak dari dalam website jika ZIP masih punya folder Comeplayers-new.
Versi V2 ini sudah dibuat tanpa folder pembungkus Comeplayers-new/website.

LANGKAH:
1. Hentikan npm run dev dengan Ctrl+C.
2. Buka folder proyek: Comeplayers-new\website
3. Extract semua isi ZIP ini ke folder website tersebut.
4. Pilih Replace/Timpa semua file.
5. Di PowerShell yang sudah berada di folder website, jalankan:

   powershell -ExecutionPolicy Bypass -File .\APPLY_ALEXIA_HOME_V2.ps1

6. Jalankan:

   npm run dev

7. Buka http://localhost:3000 dan tekan Ctrl+F5.

VERIFIKASI:
- File app\HomeClient.tsx harus memuat teks: Gerakkan cursor untuk melihat Alexia mengikuti arahmu
- Folder public\alexia harus berisi idle.webp, chat-hover.webp, marketplace-hover.webp
- File ALEXIA_HOME_V2_MARKER.txt harus ada di folder website

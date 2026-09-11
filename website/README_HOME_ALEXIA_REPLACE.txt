COMEPLAYERS — ALEXIA INTERACTIVE HOME V1
========================================

ISI PATCH
---------
1. Halaman utama / diganti menjadi hero Alexia full screen.
2. Header dan footer disembunyikan hanya pada halaman utama /.
3. Marketplace lama dipindahkan ke /marketplace.
4. Chat & Messages membuka /messages.
5. Cursor memberi efek parallax, kepala, dan mata mengikuti arah cursor.
6. Hover menu mengganti ekspresi Alexia dan membuat panel terkait bercahaya.
7. Tampilan mobile menyediakan dua tombol utama di bagian bawah.

CARA PASANG PALING MUDAH
------------------------
1. Tutup server npm run dev.
2. Extract ZIP ini di folder yang berisi folder Comeplayers-new.
3. Pilih Merge/Replace/Timpa semua file ketika Windows meminta konfirmasi.
4. Buka terminal di:
   Comeplayers-new\website
5. Jalankan:
   npm run dev
6. Buka:
   http://localhost:3000

ALAMAT HALAMAN
--------------
Halaman utama : http://localhost:3000/
Chat          : http://localhost:3000/messages
Marketplace   : http://localhost:3000/marketplace

FILE YANG DITAMBAHKAN / DIGANTI
-------------------------------
app/HomeClient.tsx
app/home.module.css
app/components/MainHeader.tsx
app/marketplace/page.tsx
app/marketplace/MarketplaceHomeClient.tsx
components/layout/SiteFooter.tsx
public/alexia/idle.webp
public/alexia/chat-hover.webp
public/alexia/marketplace-hover.webp

CATATAN
-------
Versi ini adalah implementasi 2.5D siap pakai dengan tiga state visual dan
lapisan mask kepala/mata. Gerakan dibuat halus supaya tidak merusak ilustrasi.
Untuk rig mata dan rambut yang benar-benar terpisah, diperlukan PSD Alexia
berlayer sebagai tahap lanjutan.

COMEPLAYERS MESSAGES & CHAT - DISCORD-STYLE PROFILE MENU V59
===========================================================

Perubahan ini khusus untuk halaman Chat & Message (/messages).

FITUR
- Kartu profil besar bergaya Discord.
- Banner Alexia/ComePlayers di bagian atas.
- Avatar besar yang menimpa banner dan indikator status.
- Nama, username/email, status kustom, kartu perks, Shop, dan Game Collection.
- Menu Edit Profile, Security, Connections, My Orders, dan Sign Out.
- Status Online, Idle, Invisible, dan Offline terhubung ke API presence ComePlayers.
- Tata letak responsif untuk desktop, layar pendek, dan mobile.

CARA OTOMATIS
1. Ekstrak ZIP patch ini.
2. Letakkan folder hasil ekstrak di mana saja.
3. Jalankan INSTALL_V59.bat.
4. Saat diminta, masukkan lokasi folder proyek Comeplayers-new.

CARA MANUAL
Salin dan replace dua file berikut ke proyek utama:
- patch/website/app/messages/page.tsx
- patch/website/app/messages/messages.module.css

Target:
- Comeplayers-new/website/app/messages/page.tsx
- Comeplayers-new/website/app/messages/messages.module.css

Setelah pemasangan:
1. Buka terminal pada Comeplayers-new/website.
2. Jalankan npm run dev.
3. Buka /messages, lalu klik profil pengguna di kiri bawah.

Installer otomatis membuat file backup bertanggal sebelum mengganti file.

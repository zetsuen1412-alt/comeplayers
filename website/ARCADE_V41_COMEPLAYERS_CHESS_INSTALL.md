# ComePlayers Arcade V41 — CP Chess

Patch ini menambahkan mini-game **CP Chess** bertema ComePlayers ke mini-window Arcade pada halaman `/messages`.

## Fitur

- Papan dan bidak bertema **CP Gold vs Cyber Cyan**.
- Mode offline melawan **Alexia NPC**.
- Tiga tingkat NPC: Rookie, Tactical, dan Commander.
- Mode online realtime menggunakan kode room.
- Dua user harus login ke akun ComePlayers yang berbeda.
- Mendukung mouse, layar sentuh, promosi bidak, rokade, en passant, check, checkmate, stalemate, dan draw 50 langkah.
- Game tetap terbuka di atas halaman Chat & Messages.

## Instalasi file

Ekstrak ZIP ke folder utama proyek:

```text
C:\Comeplayers-new
```

Pilih **Replace files**.

## Wajib untuk mode online

Jalankan migration berikut melalui Supabase SQL Editor atau Supabase CLI:

```text
website/supabase/migrations/20260713224500_arcade_comeplayers_chess_v41.sql
```

Mode **Alexia NPC** tetap dapat dimainkan walaupun migration belum dijalankan.

## Build

```powershell
cd C:\Comeplayers-new\website
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
npm run build
npm run dev
```

## Tes online

1. Login menggunakan akun pertama, buka **Games → CP Chess → Create Online Room**.
2. Salin kode room.
3. Buka browser Incognito atau perangkat lain dan login menggunakan akun kedua.
4. Buka **Games → CP Chess**, masukkan kode, lalu pilih **Join Online Duel**.

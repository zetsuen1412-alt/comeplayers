# ComePlayers Arcade V43 — CP Monopoly

## Isi pembaruan

- Mini-game **CP Monopoly** terbuka di mini-window Chat & Messages.
- Papan 40 petak bertema ComePlayers.
- Offline melawan 1–3 Alexia NPC.
- Online 2–4 pemain menggunakan daftar public room tanpa kode.
- Global matchmaking dua pemain untuk mode Blitz.
- Rumah, hotel, grup warna, rent, transit, utility, pajak, kartu Loot Drop dan Squad Chest.
- Auction, mortgage/unmortgage, jual bangunan, trade uang/properti, jail, bankruptcy, Free Parking jackpot, dan autosave offline.
- Efek suara dan musik original dibuat secara real-time menggunakan Web Audio API, sehingga tidak ada file MP3 tambahan dan tetap ringan di desktop/Android.

## Instalasi file

Ekstrak ZIP ke:

```text
C:\Comeplayers-new
```

Pilih **Replace files**.

## Aktifkan mode online

Buka Supabase SQL Editor lalu jalankan seluruh isi:

```text
website/supabase/migrations/20260713234500_arcade_cp_monopoly_v43.sql
```

Mode offline tetap dapat digunakan tanpa migration.

## Build

```powershell
cd C:\Comeplayers-new\website
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
npm run build
npm run dev
```

## Pengujian online

- Gunakan dua sampai empat akun ComePlayers berbeda.
- Buat public room dari akun pertama.
- Akun lain membuka Games > CP Monopoly dan menekan Join pada daftar room.
- Host menekan Start Economy setelah minimal dua pemain masuk.

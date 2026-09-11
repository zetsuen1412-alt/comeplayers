# ComePlayers Marketplace Flow V36

## Alur pengguna

1. `/categories/game-coins` menampilkan landing kategori dan grid game populer.
2. Klik game Koin Game membuka `/games/[slug]?category=coin`.
3. Halaman game menampilkan empat kategori: Koin Game, Jasa Joki, Item, dan Akun Game.
4. Koin Game menampilkan pilihan server yang dipisahkan oleh server + region + faction + platform.
5. Klik server membuka `/games/[slug]/offers?category=coin&server=...&region=...&faction=...`.
6. Halaman tersebut menampilkan daftar seller berbentuk baris serta sorting Direkomendasikan/Harga Terendah.
7. Jasa Joki, Item, dan Akun Game langsung menampilkan grid penawaran.

## Instalasi copy-replace

1. Backup proyek lama.
2. Ekstrak `Comeplayers-v36-marketplace-patch.zip`.
3. Salin isi folder patch ke root proyek ComePlayers lama.
4. Pilih **Replace files in destination**.
5. Jangan mengganti atau menghapus `website/.env.local`.
6. Buka Supabase SQL Editor dan jalankan:

   `website/supabase/migrations/20260711223000_marketplace_offer_faction_v36.sql`

7. Dari folder `website`, jalankan:

```powershell
Remove-Item .next -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item node_modules -Recurse -Force -ErrorAction SilentlyContinue
npm.cmd ci
npm.cmd run typecheck
npm.cmd test
npm.cmd run dev
```

## Data faction seller

Form seller sekarang memiliki field `Faction / Side`. Contoh:

- Alliance
- Horde
- Team A
- Team B

Nilai disimpan pada `products.offer_faction`. Variants tetap dapat menggunakan `attributes.faction`, `attributes.side`, atau `attributes.team`.

## Pengujian manual

- Buka `/categories/game-coins`.
- Klik satu game.
- Pastikan halaman menampilkan empat kategori.
- Pada Koin Game, pilih server/faction.
- Pastikan daftar seller hanya menampilkan penawaran yang cocok.
- Pilih Harga Terendah dan pastikan harga ascending.
- Aktifkan Penjual Online.
- Pindah ke Jasa Joki, Item, dan Akun Game; pastikan muncul grid produk.

## Hasil pemeriksaan

- TypeScript website: lulus.
- TypeScript E2E: lulus.
- Test: 160/160 lulus.
- ESLint: 0 error; 106 warning lama pada bagian proyek lain.

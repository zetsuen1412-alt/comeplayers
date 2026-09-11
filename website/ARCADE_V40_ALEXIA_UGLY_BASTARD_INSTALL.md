# ComePlayers Arcade V40 — Alexia vs Ugly Bastards

Patch ini memperbarui game **Alexia Dash** di mini-window Chat & Messages.

## Perubahan

- Kotak huruf `A` diganti menjadi sprite karakter Alexia.
- Rintangan balok diganti menjadi 3 variasi musuh kartun **Ugly Bastard**.
- Arena diubah menjadi jalan kota neon bergaya ComePlayers.
- Collision dan ukuran lompatan disesuaikan untuk sprite karakter baru.
- Tetap berjalan di mini-window `/messages`, tanpa pindah halaman.
- Mendukung Space, Arrow Up, klik, dan tap.

## Instalasi

Ekstrak ZIP ke folder utama:

```text
C:\Comeplayers-new
```

Pilih **Replace files**, lalu jalankan:

```powershell
cd C:\Comeplayers-new\website
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
npm run build
npm run dev
```

Tidak memerlukan migrasi Supabase atau paket npm tambahan.

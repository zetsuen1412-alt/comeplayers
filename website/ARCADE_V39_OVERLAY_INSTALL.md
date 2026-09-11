# ComePlayers Arcade V39 - In-App Game Window

Versi ini mengubah seluruh menu **Games** di halaman **Chat & Messages** agar tidak lagi membuka `/arcade` atau berpindah halaman.

## Perubahan utama

- Semua 10 game terbuka langsung sebagai window di atas halaman Chat & Messages.
- Chat, server, voice lobby, dan panel lain tetap berada di halaman yang sama.
- Tombol **View All** membuka library game di dalam window.
- Bisa berpindah game tanpa menutup window.
- Desktop: tersedia tombol minimize, maximize/restore, dan close.
- Android/mobile: window otomatis memenuhi hampir seluruh layar dan tetap touch-friendly.
- High score tetap tersimpan di localStorage perangkat.
- Tidak memerlukan migrasi database atau paket npm baru.

## Instalasi

1. Ekstrak ZIP ke folder root project:

   `C:\Comeplayers-new`

2. Izinkan **Replace files**.

3. Jalankan:

```powershell
cd C:\Comeplayers-new\website
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
npm run build
npm run dev
```

4. Buka halaman `/messages`, klik menu **Games**, lalu pilih salah satu game.

## Catatan

Halaman `/arcade` lama tidak dihapus, tetapi menu Games di Chat & Messages tidak lagi mengarah ke halaman tersebut.

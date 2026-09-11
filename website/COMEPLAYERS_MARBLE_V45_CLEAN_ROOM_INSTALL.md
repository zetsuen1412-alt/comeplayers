# ComePlayers Marble V45 — Clean-Room Rebuild

## Tujuan

Versi ini membangun ulang pengalaman game papan kota bergaya marble sebagai produk asli ComePlayers. Arsip client Netmarble hanya digunakan untuk memahami kategori fitur dan alur permainan. Tidak ada executable, DLL, sprite, musik, suara, logo, nama karakter, atau aset Netmarble yang disalin ke proyek.

## Fitur yang diterapkan

- Mode Cepat: 8 putaran.
- Mode Klasik: 15 putaran.
- Empat karakter ComePlayers dengan kemampuan pasif berbeda.
- Dua dadu animasi dan giliran tambahan ketika memperoleh dadu kembar.
- Pembelian kota langsung pada level Tanah, Rumah, Hotel, atau Landmark.
- Bonus kepemilikan satu grup warna.
- Pengambilalihan kota lawan sebelum kota menjadi Landmark.
- Pulau Santai yang melewatkan satu giliran.
- Tur Dunia untuk memilih kota tujuan.
- Kartu Kejutan, pajak, bonus festival, dan bonus START.
- Kebangkrutan dan pengalihan aset kepada kreditur.
- Kondisi kemenangan Triple Color Monopoly, World Tour Monopoly, Line Monopoly, Last Player Standing, atau total aset tertinggi.
- Tetap dapat dimainkan dari halaman website maupun iframe Messages & Chat.

## File utama yang diubah

```text
website/app/games/monopoly/ComePlayersMarbleGame.tsx
website/app/games/monopoly/monopoly.module.css
website/app/games/monopoly/page.tsx
```

## Menjalankan

```powershell
cd C:\Comeplayers-new\website
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
npm install
npm run dev
```

Buka:

```text
http://localhost:3000/games/monopoly
```

## Pemeriksaan yang telah dilakukan

- ESLint file game: lulus tanpa error atau warning.
- TypeScript terarah untuk route game: lulus.
- Next.js development compilation untuk `/games/monopoly`: berhasil, HTTP 200.
- Build produksi seluruh repository sempat dijalankan, tetapi repository penuh sangat besar dan melampaui batas waktu lingkungan pemeriksaan. Tidak ditemukan error pada file game sebelum batas waktu tersebut.

## Catatan legal

Gunakan hanya aset ComePlayers dan aset yang Anda miliki atau berlisensi. Jangan memasukkan kembali file `.exe`, `.dll`, `.spr`, `.net`, `.bmp`, musik, suara, atau data proprietary dari client Netmarble ke distribusi ComePlayers.

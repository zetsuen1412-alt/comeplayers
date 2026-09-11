# ComePlayers Marble World V22

Patch ini menggantikan modul game monopoli V21 dan mempertahankan route:

- `/games/monopoly`

## Perubahan V22

- Papan isometrik lebih dekat dengan nuansa game marble klasik di video referensi.
- Empat kartu pemain lengkap dengan avatar, tim, peringkat, kas, dan total aset.
- Uang bertumpuk di empat sisi papan dan dua deck kartu di area tengah.
- Pergerakan pion berlangsung petak demi petak, bukan teleport.
- Dadu memiliki animasi, hasil total, efek bunyi sederhana, dan timer giliran.
- Dialog pembelian berbentuk clipboard dengan pilihan Tanah, Rumah, Hotel, atau Landmark.
- Sistem bonus sewa ketika satu grup warna dikuasai pemain yang sama.
- Tur Dunia memungkinkan pemain memilih kota tujuan.
- Intro penentuan urutan pemain dan layar pemenang yang diperbarui.
- Tombol reset, suara, fullscreen, dan responsive layout.

## Pemasangan

Salin folder `Comeplayers-new` dari patch ini ke folder proyek utama lalu pilih **Replace/Merge**.

Jalankan:

```bash
cd C:\Comeplayers-new\website
npm run dev
```

Buka:

```text
http://localhost:3000/games/monopoly
```

## Pemeriksaan

File game V22 telah diperiksa dengan TypeScript scoped configuration dan lolos tanpa error.

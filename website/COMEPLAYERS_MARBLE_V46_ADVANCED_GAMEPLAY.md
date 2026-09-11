# ComePlayers Marble V46 — Advanced Gameplay

V46 melanjutkan clean-room rebuild ComePlayers Marble tanpa menyalin source code, executable, sprite, musik, suara, logo, atau aset Netmarble.

## Fitur baru

- Kontrol Dadu Alexia dengan target 4, 6, 8, 10, atau 12 langkah.
- Tingkat keberhasilan Kontrol Dadu 82% dan dua energi awal.
- Energi Kontrol Dadu terisi kembali ketika melewati START.
- AI menilai peluang menyelesaikan grup warna dan memblokir monopoly lawan.
- AI Tur Dunia memilih kota berdasarkan nilai strategis.
- Likuidasi otomatis: aset termurah dan non-monopoly dijual lebih dahulu sebesar 70% nilai untuk membayar sewa, pajak, atau kartu negatif.
- Panduan permainan dapat dibuka dari toolbar.
- Ringkasan hasil pertandingan berisi klasemen, kekayaan, jumlah kota, status bangkrut, dan riwayat likuidasi.

## Lokasi game

`/games/monopoly`

Mode embed Messages & Chat tetap tersedia:

`/games/monopoly?embed=messages`

## Instalasi patch

Salin folder `website/app/games/monopoly` dari paket replace ke folder proyek ComePlayers dengan struktur yang sama, lalu jalankan:

```powershell
cd website
npm install
npm run dev
```

Buka `http://localhost:3000/games/monopoly`.

## Validasi

- TypeScript khusus route game: lulus.
- ESLint khusus route game: lulus.
- Next.js selective production compile: lulus.
- Route development `/games/monopoly`: HTTP 200.

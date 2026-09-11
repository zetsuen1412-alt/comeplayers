# Audit Referensi Client Modoo Marble Lama

Arsip yang dianalisis adalah client Windows terkompilasi, bukan source project.

## Ringkasan teknis

- 1.799 file.
- Sekitar 891 MB setelah diekstrak.
- 660 paket `.spr`.
- 677 paket `.net` untuk musik/suara atau data proprietary.
- 403 bitmap `.bmp`.
- 35 tabel `.dat`.
- Dua executable Windows dan beberapa DLL native/.NET.
- Tidak ditemukan source C++, C#, JavaScript, TypeScript, atau project engine yang dapat langsung diedit.

## Kategori fitur yang dipetakan

- Area dan harga kota.
- Golden Key / kartu kejutan.
- Karakter dan kartu karakter.
- Dadu dan variasi item dadu.
- Landmark dan level bangunan.
- Pulau, perjalanan udara, festival, dan pajak.
- Misi, aksesori, guild, teman, toko, dan event.
- Varian papan Korea, Space, dan CEO.

## Keputusan implementasi

ComePlayers Marble dibuat secara clean-room dengan logika dan visual milik ComePlayers. Struktur binary, protokol jaringan, dan format asset proprietary tidak dimasukkan ke source baru.

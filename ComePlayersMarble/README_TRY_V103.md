# ComePlayers Marble V103 — Classic Comfort Camera

V103 memperbaiki kamera pertandingan berdasarkan pola kamera pada client PC marble klasik di arsip `NetmarbleModuMarble(1).zip`.

## Perubahan utama

- Kamera default memakai framing isometrik stabil dan mempertahankan seluruh papan di layar.
- FOV diturunkan menjadi 24 agar perspektif lebih tenang dan mendekati tampilan 2.5D klasik.
- Kamera tidak lagi mengejar pion pada setiap kotak selama pergerakan.
- Sebelum pion bergerak, kamera hanya melakukan satu framing ringan menuju area tujuan.
- Fokus dadu, properti, kartu, dan pendaratan memakai zoom kecil; tidak ada close-up ekstrem.
- Landing camera tetap mempunyai dua tahap, tetapi seluruh papan masih terbaca.
- Camera shake dikurangi secara signifikan untuk kenyamanan mata.
- Kamera local match dan authoritative online match memakai preset yang sama.
- Opsi Reduce Camera Motion tetap tersedia dan kini bekerja di atas preset kamera klasik yang stabil.

## Cara mencoba

1. Ekstrak proyek ke folder kosong baru.
2. Jangan menimpa folder V102.
3. Pastikan `library`, `temp`, `build`, dan `.creator` tidak terbawa dari proyek lama.
4. Buka proyek dengan Cocos Creator 3.8.8.
5. Jalankan scene utama.
6. Lobby yang benar menampilkan `V103 COMFORT CAMERA`.
7. Saat pertandingan dimulai, seluruh papan harus tetap terlihat ketika pion bergerak.

## Catatan build

Source dan seluruh pengujian statis sudah diverifikasi. Build Web Desktop belum dibuat karena executable Cocos Creator 3.8.8 tidak tersedia pada lingkungan pengerjaan ini.

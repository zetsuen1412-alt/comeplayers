# ComePlayers Arcade V42 — CP Chess Lobby & Matchmaking

## Perubahan

- Sistem memasukkan kode room dihapus dari antarmuka.
- Room online sekarang memiliki nama yang dibuat oleh host.
- Semua room publik yang masih aktif tampil dalam daftar dan dapat langsung di-join.
- Global Matchmaking mencari lawan dari seluruh akun ComePlayers yang sedang masuk antrean CP Chess, tanpa batas server/community.
- Room yang ditinggalkan atau tidak lagi aktif otomatis hilang dari daftar setelah heartbeat berakhir.
- Nama pemain ditampilkan pada CP Gold dan Cyber Cyan.
- Mode Alexia NPC tetap dapat dimainkan tanpa Supabase.

## Instalasi

1. Ekstrak ZIP ke folder utama proyek, misalnya `C:\Comeplayers-new`.
2. Izinkan Windows mengganti file yang sama.
3. Buka Supabase SQL Editor.
4. Salin seluruh isi file berikut dan klik **Run**:

   `website/supabase/migrations/20260713231500_arcade_chess_room_browser_matchmaking_v42.sql`

   Migration V41/V41.1 harus sudah dijalankan lebih dahulu.

5. Jalankan:

```powershell
cd C:\Comeplayers-new\website
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
npm run build
npm run dev
```

## Cara mengetes

- Akun pertama: buka `/messages` → Games → CP Chess → buat room bernama.
- Akun kedua: buka CP Chess dan tekan **Join Room** dari daftar.
- Untuk matchmaking, kedua akun menekan **Global Matchmaking**. Akun pertama menunggu, akun kedua otomatis dipasangkan.

Matchmaking hanya memasukkan user yang menekan tombol Global Matchmaking, sehingga user yang sekadar membuka Chat & Messages tidak dipaksa masuk pertandingan.

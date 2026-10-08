# Crazy Rich: World Tour — Web 30.0 QA (2026-10-04)

## Kelanjutan pertandingan
- Offline: test actual inline Engine, OfflineSave dan App dalam Node VM.
- Roundtrip stok kartu yang telah dipakai dan bonus Double Roll aktif lulus.
- Import lama memakai stok awal; modern autosave tidak mengambil kids.v7 lama.
- Import tidak valid/dibatalkan menjaga engine, kartu, timer dan storage.
- Winner/phase tidak konsisten serta format/version tidak dikenal ditolak.
- Browser localhost: Guest > Practice > match lokal > reload > resume lulus.
- Pengaturan bisa dibuka melalui tombol baru ketika match sedang aktif.
- Kontrol Ekspor/Impor save terlihat pada desktop dan viewport 390×844.
- Tidak ada console error/warning pada flow lokal yang diperiksa.
- Ekspor Blob JSON diuji dengan fungsi App aktual di VM. Event unduhan pada
  in-app browser tidak menghasilkan receipt; file unduhan UI belum diverifikasi.
- Online: tes fixture RPC untuk resume existing match, token handshake dan
  race pembukaan frame; bukan pertandingan multiakun langsung di produksi.
- Source dan embedded launcher dibuat dari runtime yang sama; mirror website
  serta inventaris checkpoint diverifikasi oleh workflow CI.

## Bukti historis Online 27.0

Bagian berikut mencatat QA sebelumnya, bukan pengujian backend baru pada
checkpoint gameplay-continuity ini.

# Crazy Rich: World Tour — Online 27.0 QA

## Backend QA — LULUS
- Match Tokyo Rush dibuat dan dimulai melalui backend yang sama dengan 26.0.
- Match dipaksa finish dengan Last Player Standing / bankruptcy dan tetap menghasilkan winner server-side.
- `crwt_match_result_v27` berhasil membaca final standings/reward participant.
- `crwt_vote_rematch_v27` berhasil membuat rematch session.
- Skenario 1 human + 1 bot: vote human langsung memenuhi semua human vote dan membuat room rematch baru.
- Room rematch mempertahankan map `tokyo_rush`, mode Classic, jumlah/seat pemain, serta bot.
- Bot pada room rematch selalu `is_host=false`.
- Rematch dibuat Casual (`is_ranked=false`) agar ranked rating tidak mudah difarming.
- RLS aktif untuk tabel rematch dan RPC 27.0 tidak executable oleh role `anon`.
- Seluruh data QA room/match/rematch/profile dibersihkan kembali.

## UI QA — LULUS
- JavaScript syntax check (`node --check`) lulus untuk launcher dan online renderer.
- Desktop Chromium 1366×768: launcher Guest → Lobby lulus tanpa console/page error.
- Match intro tampil dengan map + character entrance.
- Intro → countdown 3/2/1/GO → controls unlock berhasil.
- Turn transition banner muncul ketika `turn_seat` berubah.
- Active → finished menampilkan Victory cinematic.
- Setelah Victory, podium/result screen terbuka otomatis.
- Final standings + Gold/EXP/Mastery reward dari RPC server tampil.
- Tombol REMATCH mengirim vote dan menampilkan status vote.
- Mobile 390×844 + Reduced Motion: controls dapat dipakai dan tidak ada horizontal page overflow.

## Authority
Presentation 27.0 tidak menghitung dice, cash, property, card, skill, auction, takeover, liquidation, bankruptcy, reward, ranked result, atau winner. Semua state pertandingan dan result berasal dari backend.

## Rules locked
- Last Player Standing / bankruptcy only.
- Tidak ada batas ronde sebagai win condition.
- Pendant / Artifact tidak ada.

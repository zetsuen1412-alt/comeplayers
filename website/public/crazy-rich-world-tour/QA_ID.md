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

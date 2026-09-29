# Crazy Rich: World Tour 29.0 — Zero Dice System

Dikembangkan dari source Unity 28.0, memakai backend Supabase yang sama (`uyehruetoxedmookyfcd`). Nama folder tetap `Crazy-Rich-World-Tour-Unity-28.0` agar path proyek tidak berubah; versi aplikasi sekarang **29.0**. Source asli 28.0 tersimpan pada commit `ac93c986`.

## Dadu 29.0
- Dua dadu: masing-masing **0–6**, total **0–12**. Hasil hanya berasal dari RPC Supabase `crwt_v18_roll` → `crwt_v18_roll_core`.
- Desain **Starwheel**: token fantasi dengan tujuh kelopak, warna enamel ungu/merah muda, tepi emas, wajah angka besar. Bukan kubus enam sisi. Angka nol memakai halo mint dan tujuh bintang.
- Animasi `Idle → Throw → Spin → Bounce → Reveal / ZeroReveal`. Selama menunggu jaringan, wajah menampilkan `?`; Unity tidak membuat hasil RNG, termasuk pada demo visual.
- Satu nol menampilkan `[0] + [5] / TOTAL 5`, lalu pion bergerak mengikuti posisi server.
- `0 + 0`: `ZERO ROLL!`, reaksi miring singkat pada karakter, posisi tetap. Tidak ada tile decision atau pemrosesan tile ulang. Nol tetap doubles; tombol ROLL kembali setelah cinematic jika server masih memberi giliran.
- Dice Focus GANJIL/GENAP dapat dipilih dari tombol SKILL Kairo. Nol termasuk genap. Rejection sampling server tidak memakai batas percobaan yang bisa meloloskan paritas salah.
- Snapshot lama/duplikat tidak mengulang cinematic; `last_roll.roll_id` membedakan dua ZERO ROLL berurutan. Reconnect hanya menampilkan state terakhir.
- Kontrol ROLL memakai uGUI Button yang sama untuk mouse dan touch. Panel dadu hanya tampil selama animasi, tanpa UI besar permanen tambahan.

## Backend dan pengujian
Migrasi `supabase/migrations/20260929144722_crwt_zero_dice_v29.sql` sudah diterapkan ke proyek tersebut. Migrasi memodifikasi fungsi inti yang ada, bukan mengganti arsitektur. Bot, timeout tick, dan cron memakai inti roll yang sama. RPC pembungkus tetap authenticated-only; roll core dan timeout apply tidak dapat dipanggil client.

Jalankan dari folder ini:
```powershell
npm ci --ignore-scripts
npm test
pwsh -NoProfile -File tests/check-client.ps1
```
Tes SQL berjalan di PostgreSQL PGlite lokal dengan source fungsi server yang diekspor dan katalog lima map. Tidak memodifikasi pertandingan produksi. Lihat [QA 29.0](QA_29_ID.md) untuk cakupan, hasil, dan batas verifikasi. Jangan menjalankan fixture pengujian pada Supabase produksi.

Last Player Standing, properti House/Tower/Hotel/Landmark, auction, takeover, liquidation, bankruptcy, Cards, Character Skills, ranked normalization, multi-map, Festival, World Travel, spectator, replay, social, tournament foundation, dan rematch tetap memakai sistem yang ada. Tidak ada round-limit victory, Pendant, atau Artifact baru.

## Cara membuka
1. Install Unity Hub dan Unity 6, dengan modul Windows Build Support dan/atau Android Build Support.
2. `Add project from disk` lalu pilih folder ini.
3. Tunggu Package Manager selesai memasang `uGUI` dan `Newtonsoft JSON`.
4. Script `CrwtProjectSetup` otomatis membuat empat scene: `CRWT_Bootstrap`, `CRWT_Login`, `CRWT_Lobby`, `CRWT_Match`.
5. Buka `Assets/CRWT/Scenes/CRWT_Bootstrap.unity` lalu tekan Play.

Jika scene belum dibuat otomatis, pilih menu **Crazy Rich > 29.0 > Setup Project**. Pemeriksaan protokol tersedia di **Crazy Rich > 29.0 > Check Dice Protocol**.

## Yang sudah dipindahkan
- Supabase email/password auth + signup.
- Progression bootstrap.
- Create room, join room, quick match, ready, bot, start match, resume room.
- Polling snapshot server-authoritative.
- Roll, buy, upgrade, takeover, auction, liquidation, travel, festival, skill, timeout/bot hooks.
- Result + rematch v27.
- Papan 32 tile 3D Unity procedural, pion 3D, property/building visualization dari server state, orbit camera, HUD responsive.
- Offline 3D visual demo untuk membuka client tanpa akun.

## Penting
Unity client **tidak menghitung RNG, cash, rent, ownership, bankruptcy, atau winner** saat online. Semua keputusan gameplay tetap berasal dari RPC server. Demo offline hanya untuk melihat renderer/UI.

## Asset
Model GLB karakter v23 disimpan di `Assets/StreamingAssets/Characters`. Unity project ini belum memuat GLB tersebut ke rig final; 28.0 memakai pawn procedural sebagai fallback yang langsung dapat dijalankan. Tahap berikutnya mengganti pawn dengan FBX/GLTF runtime/import pipeline final.

## Legacy Web
Folder `LegacyWeb27` mempertahankan client 27.0 sebagai referensi/fallback QA selama migrasi Unity berlangsung.

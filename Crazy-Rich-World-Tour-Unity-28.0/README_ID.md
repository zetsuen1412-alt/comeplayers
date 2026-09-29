# Crazy Rich: World Tour 30.0 — Chibi World

Dikembangkan dari source Unity 28.0 dan Zero Dice 29.0, memakai backend Supabase yang sama (`uyehruetoxedmookyfcd`). Nama folder tetap `Crazy-Rich-World-Tour-Unity-28.0` agar path proyek tidak berubah; versi aplikasi sekarang **30.0**. Source asli 28.0 tersimpan pada commit `ac93c986`, source 29.0 pada `54fc69b9`.

**Status: kompilasi Editor, Play Mode, build Windows, dan APK Android ARM64/IL2CPP sudah lulus pada Unity 6000.0.84f1.** Pengujian runtime di AMD Radeon 780M memuat enam GLB, menjalankan enam state dadu, memastikan ZERO tidak bergerak, mengembalikan ROLL, dan memeriksa 0+5 tepat lima langkah tanpa replay snapshot duplikat. Paket ini untuk pengujian; gameplay multiplayer end-to-end dan perangkat Android fisik belum diverifikasi. Lihat [QA 30.0](QA_30_ID.md).

## Pembaruan 30.0 dan perbaikan 29.1

- Papan 32 tile unik, tanpa tile sudut bertumpuk. Nama kota, simbol tile khusus, warna distrik, ring pemilik/giliran/Festival; katalog tampilan mencakup lima map / 160 tile.
- House, Tower, Hotel, dan Landmark memiliki bentuk berbeda; upgrade memakai animasi singkat. World Tour mempunyai plaza globe dan miniatur menara.
- Enam GLB yang sudah ada dimuat melalui Unity glTFast 6.14.1; Idle/Walk/Jump/Skill/Win/Lose terhubung ke presentasi. Model ini masih prototipe sederhana; fallback chibi dipakai jika pemuatan gagal. ZERO hanya memiringkan visual karakter di tempat.
- Portrait Alexia/Rindi, ilustrasi login/lobby, HUD giliran ringkas, drawer pemain, dan lembar pilihan yang bisa di-scroll. Ketuk tile untuk melihat detail, geser untuk memutar, cubit/scroll untuk zoom.
- World Travel memilih kota/resort; Festival memilih seluruh distrik map; lelang mengikuti `eligible`, `passed`, `min_bid`, `current_bid`, dan `high_seat` server. Peserta lelang tidak dibatasi ke pemilik giliran.
- Pilih aset likuidasi, konfirmasi penjualan/bangkrut, serta kartu dan targetnya. Tidak ada keputusan ekonomi yang dihitung oleh animasi.
- Suara original untuk throw/reveal/zero, langkah, transaksi, pembangunan, kemenangan. Opsi mute, reduced motion, dan target 30/60 FPS.
- Safe area untuk layar berponi; refresh sesi bersama; pemulihan koneksi/fokus; permintaan bot, timeout, hasil, dan rematch tidak berjalan berulang bersamaan.
- Setup Editor mempertahankan scene yang belum disimpan; build menghasilkan laporan gagal/lulus yang eksplisit. Shader karakter runtime disertakan dan dependency dipin.

Perbaikan fondasi yang direncanakan sebagai 29.1 digabung dalam source 30.0 ini. Backend tidak diubah pada pembaruan ini. [Aset dan prompt gambar](ART_ASSETS_30.md) mendokumentasikan hasil `image_gen` yang benar-benar dipakai UI.

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
1. Install Unity Hub dan Unity **6000.0.84f1**, lalu aktifkan lisensi yang sesuai. Windows Mono tersedia bersama Editor; Android memerlukan Android Build Support, SDK/NDK, dan OpenJDK.
2. `Add project from disk` lalu pilih folder ini.
3. Tunggu Package Manager selesai memasang `uGUI`, `Newtonsoft JSON`, dan `glTFast`.
4. Empat scene sudah disertakan: `CRWT_Bootstrap`, `CRWT_Login`, `CRWT_Lobby`, `CRWT_Match`. Script `CrwtProjectSetup` memvalidasi dan memulihkan scene yang hilang.
5. Buka `Assets/CRWT/Scenes/CRWT_Bootstrap.unity` lalu tekan Play.

Jika scene belum dibuat otomatis, pilih menu **Crazy Rich > 30.0 > Setup Project**. Jalankan **Crazy Rich > 30.0 > Verify Project** sebelum build. Instruksi CLI ada di [panduan Unity](OPEN_IN_UNITY_ID.md).

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
Model GLB karakter v23 disimpan di `Assets/StreamingAssets/Characters` dan dimuat oleh `CrwtCharacterView`. Enam GLB beserta animasinya lulus pemeriksaan struktur dan Play Mode pada Unity; tangkapan render papan ada dalam hasil QA. Model tetap prototipe sederhana. PNG UI berada di `Assets/Resources/CRWT/Art`. Profil landmark JSON warisan masih berupa referensi, bukan 55 model landmark final.

## Legacy Web
Folder `LegacyWeb27` mempertahankan client 27.0 sebagai referensi/fallback QA selama migrasi Unity berlangsung.

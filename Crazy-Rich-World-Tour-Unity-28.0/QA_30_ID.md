# QA 30.0 — Chibi World

## Verifikasi yang dijalankan

- `npm test`: 16 pengujian lulus. Termasuk 10 regresi PostgreSQL nyata dalam PGlite (49 pasangan, 100.000 simulasi, 1.140 kasus anti-farming, bot/timeout/cron, START, focus, idempotency, ACL, Last Player Standing) dan enam pengujian struktur GLB.
- GLB: mesh, skin/joint, vertex color, clip Idle/Walk/Jump/Skill/Win/Lose, waktu keyframe, quaternion, dan tidak ada animasi pada root pion. Bukan pengujian rendering.
- `pwsh -File tests/check-client.ps1`: 66 assertion pada aturan dice/cursor dan deserialisasi DTO aktual.
- `pwsh -File tests/check-actions.ps1`: 40 assertion pada source DTO/helper aktual; peserta non-current-turn boleh menawar, high bidder tidak boleh PASS, passed/spectator/bankrupt diblokir, minimum/current+10/saldo, daftar properti sendiri, tipe tujuan travel, dan target kartu.
- `pwsh -File tests/check-board.ps1`: 2.506 assertion pada geometry/catalog/path aktual; 32 tile unik dan bertetangga, seluruh 160 tile cocok dengan katalog yang diekspor, langkah 0–12 dan relokasi bot yang kembali ke posisi asal.
- `pwsh -File tests/check-csharp-syntax.ps1`: parsing C#9 semua source untuk cabang Editor/Windows dan Android. Ini bukan type-check terhadap API Unity.
- `node tools/verify-release.mjs`: JSON/GLB, metadata/aset, pemeriksaan tidak ada RNG Unity atau secret key tertanam. Checksum source ada di BUILD_SHA256.txt.
- `tools/Invoke-Unity.ps1 -Task Verify` sudah dicoba dan melaporkan `not_available`, exit 2. Tidak dihitung sebagai tes Unity yang lulus.

Pembaruan ini tidak mengubah database produksi. Kontrak RPC lelang, travel, likuidasi, kartu, snapshot, dan timeout diperiksa read-only dari fungsi Supabase yang sudah ada. Fixture SQL tetap hanya untuk database lokal; jangan diimpor ke produksi.

## Verifikasi yang memerlukan Unity Editor dan perangkat

1. Resolusi Package Manager, compile runtime/Editor, kemudian **Crazy Rich > 30.0 > Verify Project**. Pemeriksaan ini termasuk setup dua kali dengan scene uji yang belum disimpan, untuk memastikan scene aktif, dirty state, dan waktu modifikasi scene tidak berubah.
2. Login → lobby → pilih map → create/join/quick match → ready → start → result → rematch. Coba klik ganda dan keluar scene saat request masih berjalan.
3. Periksa 32 tile tidak tumpang tindih; tap detail tanpa menggerakkan kamera, drag tidak membuka detail, scroll/cubit tidak menembus modal.
4. Periksa semua GLB benar-benar tampil, shader tidak pink, Idle/Walk/Skill/Win/Lose, serta fallback ketika asset sengaja tidak tersedia dalam copy pengujian. Portrait hanya Alexia/Rindi; model masih prototipe.
5. Semua 49 hasil pada backend pengujian terisolasi. 0+0: tidak pindah, tidak melompat, tidak memproses tile/pending/bonus, ZERO cinematic sekali, ROLL kembali bila server memberi extra roll. Jangan membuat endpoint forced-roll di produksi.
6. Lelang dari dua client: kedua peserta eligible dapat bid, saldo/minimum divalidasi server, bid kalah saat race ditolak, high bidder tidak dapat PASS. Uji update snapshot ketika nominal sedang diketik.
7. Travel menampilkan seluruh kota/resort; Festival seluruh distrik; liquidation memilih semua properti sendiri; swap/freeze menampilkan lawan aktif. Uji deadline habis ketika sheet terbuka.
8. Putus internet saat lempar dadu: jangan reveal angka sebelum respons; tombol tidak mengirim ulang sebelum sinkronisasi. Reconnect tidak mengulang old roll; timeout diputuskan server.
9. Build Windows dan Android ARM64 IL2CPP lewat script. Periksa gambar, font, skinned mesh, mute/reduced motion, orientasi landscape/safe area, background/resume.
10. Profiling pada perangkat Android sasaran untuk CPU/GPU/memori dan target 30/60 FPS. Angka FPS adalah pengaturan target, belum bukti performa perangkat.

Belum ada screenshot runtime Unity atau APK/EXE yang diverifikasi. Gambar hasil image_gen adalah aset UI; jangan menyebutnya screenshot game.

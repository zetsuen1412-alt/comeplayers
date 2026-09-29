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
- Lanjutan pemasangan: Unity CLI 1.0.0-beta.11 terpasang; unduhan Editor 6000.0.84f1 selesai dan tervalidasi oleh CLI. Installer Hub 3.21.3 lolos SHA-512 manifest resmi dan Authenticode Unity. Seluruh 12 paket Android selesai diunduh dan ukuran cocok dengan manifest. Pemasangan Hub/Editor gagal memperoleh izin administrator Windows (`ELEVATION_FAILED`); tidak ada lisensi aktif. Tidak ada build yang dijalankan dari unduhan saja.
- Script batch kini memeriksa versi Editor sebelum membuka proyek. Pemeriksaan executable yang salah berhasil ditolak; ini tidak dihitung sebagai compile Unity.
- 30 September: Hub 3.21.3 dan Editor 6000.0.84f1 berhasil dipasang, versi executable terverifikasi, dan proyek didaftarkan di Hub. Percobaan Verify kini mencapai Editor lalu keluar dengan 198 (`No valid Unity Editor license found`), sebelum kompilasi proyek. Hambatan UAC sebelumnya sudah teratasi; aktivasi lisensi masih diperlukan.
- Pelaporan `license_required` diuji terhadap respons Editor tersebut: script tetap exit 1 dan menjelaskan aktivasi Hub yang dibutuhkan, tanpa menganggapnya keberhasilan compile.
- Instalasi Android selesai: Build Support, OpenJDK 17.0.18+8, NDK r27c, CMake 3.22.1, SDK Build Tools/Platform Tools 36.0.0, platform API 34/35/36/37, dan Command-line Tools 16.0. Sebelas arsip ZIP serta installer Android divalidasi checksum; executable Java, Clang, CMake, adb, aapt2, Gradle, dan SDK Manager berhasil dijalankan. Daftar modul resmi Hub mengenali Android, OpenJDK, dan SDK/NDK sebagai terpasang.
- SDK Manager 16.0 mengenali platform 34/35/36 serta Build/Platform Tools 36 melalui `--list_installed`. API 37.0 lengkap sesuai arsip resmi tetapi belum terenumerasi oleh versi SDK Manager ini; demikian pula ZIP CMake/Command-line Tools tanpa `package.xml`. Metadata paket tidak direkayasa; kompatibilitas build perlu diuji setelah lisensi Unity aktif.
- Log batch dikosongkan sebelum peluncuran agar pesan lama tidak dipakai untuk diagnosis proses baru. Percobaan ulang terhenti pada timeout/reconnect layanan lisensi dan dihentikan; tidak ada hasil Verify yang lulus. Default ProjectSettings yang dibuat oleh percobaan tanpa lisensi disimpan terpisah di `Logs/unlicensed-first-launch-settings/`, bukan dimasukkan ke source rilis.
- Pemeriksaan API mandiri: 26 file runtime + 6 file Editor, serta source paket resmi uGUI, Mathematics, Burst, Collections, dan glTFast dikompilasi dengan Roslyn terhadap DLL Unity 6000.0.84f1 serta Newtonsoft JSON, tanpa stub. Berhasil dengan warning penyatuan referensi netstandard 2.0/2.1 (CS1701). Ini tidak menjalankan Unity Package Manager, import aset, IL post-processing, Play Mode, atau IL2CPP, sehingga tidak dihitung sebagai build Unity yang lulus. Perintah dan hasil lokal tersimpan di `Logs/api-compile/`.

Pembaruan ini tidak mengubah database produksi. Kontrak RPC lelang, travel, likuidasi, kartu, snapshot, dan timeout diperiksa read-only dari fungsi Supabase yang sudah ada. Fixture SQL tetap hanya untuk database lokal; jangan diimpor ke produksi.

## Verifikasi yang memerlukan Unity Editor dan perangkat

Smoke test otomatis tersedia melalui `tools/Invoke-Unity.ps1 -Task PlayMode`, tetapi **belum dijalankan** karena lisensi belum aktif. Runner Editor-only memakai snapshot deterministik tanpa RPC, menguji pemuatan GLB sebenarnya (fallback tidak dianggap lulus), shader, lifecycle dadu, ZERO tanpa gerakan, 0+5 lima langkah, tombol ROLL, snapshot duplikat, dan cleanup. Laporan JSON/PNG di `Logs/` baru merupakan bukti setelah command benar-benar sukses.

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

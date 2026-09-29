# QA 30.0 — Chibi World

## Verifikasi yang dijalankan

- `npm test`: 16 pengujian lulus. Termasuk 10 regresi PostgreSQL nyata dalam PGlite (49 pasangan, 100.000 simulasi, 1.140 kasus anti-farming, bot/timeout/cron, START, focus, idempotency, ACL, Last Player Standing) dan enam pengujian struktur GLB.
- GLB: mesh, skin/joint, vertex color, clip Idle/Walk/Jump/Skill/Win/Lose, waktu keyframe, quaternion, dan tidak ada animasi pada root pion. Bukan pengujian rendering.
- `pwsh -File tests/check-client.ps1`: 66 assertion pada aturan dice/cursor dan deserialisasi DTO aktual.
- `pwsh -File tests/check-actions.ps1`: 40 assertion pada source DTO/helper aktual; peserta non-current-turn boleh menawar, high bidder tidak boleh PASS, passed/spectator/bankrupt diblokir, minimum/current+10/saldo, daftar properti sendiri, tipe tujuan travel, dan target kartu.
- `pwsh -File tests/check-board.ps1`: 2.506 assertion pada geometry/catalog/path aktual; 32 tile unik dan bertetangga, seluruh 160 tile cocok dengan katalog yang diekspor, langkah 0–12 dan relokasi bot yang kembali ke posisi asal.
- `pwsh -File tests/check-csharp-syntax.ps1`: parsing C#9 semua source untuk cabang Editor/Windows dan Android. Ini bukan type-check terhadap API Unity.
- `node tools/verify-release.mjs`: JSON/GLB, metadata/aset, pemeriksaan tidak ada RNG Unity atau secret key tertanam. Checksum source ada di BUILD_SHA256.txt.
- 30 September: Unity Hub 3.21.3, Editor 6000.0.84f1, dan lisensi Personal aktif. Proses Editor memerlukan akses IPC Windows ke layanan lisensi; lingkungan proses terisolasi sebelumnya menyebabkan koneksi ditolak walaupun Hub sudah aktif.
- `tools/Invoke-Unity.ps1 -Task Verify`: **lulus, exit 0** setelah kompilasi/import Unity sebenarnya. Empat scene, shader/input, protokol dadu, geometri papan, dan pengulangan setup diperiksa. Pembuatan pertama diperbaiki untuk scene startup kosong; scene tanpa nama yang berisi pekerjaan pengguna tidak disimpan atau dibuang. Validasi scene tertutup memakai preview yang selalu dibersihkan.
- `tools/Invoke-Unity.ps1 -Task PlayMode`: **lulus, exit 0**, AMD Radeon 780M Graphics. Enam GLB asli dan clip Idle/Walk/Jump/Skill/Win/Lose, 32 tile, UI/font/safe area, kedua Starwheel, serta seluruh state Idle/Throw/Spin/Bounce/Reveal/ZeroReveal teruji. Wajah dadu tetap `?` sebelum respons; ZERO di START tidak berjalan, reveal sekali, ROLL kembali; 0+5 berjalan tepat lima langkah, snapshot duplikat tidak mengulang. Lifecycle batal/rebuild/destruction juga lulus. Tidak ada error atau warning runtime, tidak ada klien RPC yang dibuat oleh fixture.
- Label papan diperbaiki berdasarkan render Unity: nama kota, nomor, simbol, nomor pemain, dan judul memakai batas ukuran lokal. Play Mode diulang sesudah perubahan dan tetap lulus.
- Build Android pertama dihentikan saat Standard memasukkan 49.152 varian pada satu pass. Material Standard nyata kini disimpan di Resources, divalidasi opaque/instancing, dan diklon oleh papan serta fallback; entri Standard di Always Included dihapus, glTF tetap tersedia. Build akhir menyisakan 96 varian pada pass yang sama. Verify dan Play Mode diulang sesudah perubahan, lulus dengan tampilan papan yang sama. Tidak ada custom shader stripper.
- `tools/Invoke-Unity.ps1 -Task Windows`: **lulus, exit 0**, termasuk material dan label terbaru. EXE akhir menginisialisasi Mono/Direct3D11/input dan tetap hidup selama observasi 687 detik tanpa error startup di log. Pemeriksaan ini tidak menguji interaksi akun atau gameplay multiplayer.
- `tools/Invoke-Unity.ps1 -Task Android`: **lulus, exit 0**, ARM64/IL2CPP dan Gradle `assembleRelease`. Manifest APK: `com.ComePlayers.CrazyRichWorldTour`, versi `30.0`, code `1`, min SDK `23`, target/compile SDK `36`. Signature v1/v2 valid dengan sertifikat Android Debug; APK untuk pengujian/sideload, belum store-signed. Apksigner memberi 35 peringatan cakupan metadata JAR pada META-INF; verifikasi signature tetap lulus.
- Isi paket: keenam GLB identik dengan source, empat scene dan material `CRWT_Standard` tersedia pada Windows serta Android; metadata IL2CPP tersedia pada APK. Semua 227 entry ZIP Windows diperiksa ulang. APK lolos `zipalign -c -P 16 -v 4`; tujuh library ELF AArch64 memiliki alignment segmen PT_LOAD minimal 16 KiB. Ini pemeriksaan statis, belum pengujian runtime Android.
- Toolchain Android resmi: Build Support, OpenJDK 17.0.18+8, NDK r27c, CMake 3.22.1, Build/Platform Tools 36.0.0, platform 34/35/36/37.0, Command-line Tools 16.0, dan Gradle 9.3.1. Checksum unduhan serta executable diperiksa. API 37.0 ada sesuai arsip resmi tetapi tidak terenumerasi SDK Manager 16.0; APK aktual menggunakan target SDK 36.
- Script menolak versi Editor yang berbeda dan hanya menerima laporan hasil dengan runId tugas yang sama. Kondisi `not_available` dan `license_required` telah diuji sebagai kegagalan; log dikosongkan sebelum setiap peluncuran untuk menghindari diagnosis dari pesan lama.
- Pemeriksaan API mandiri sebelum aktivasi juga lulus terhadap DLL asli Unity; hasil kompilasi/import Editor dan Play Mode di atas kini menjadi bukti integrasi yang lebih lengkap. `packages-lock.json`, empat scene, dan ProjectSettings dari setup terverifikasi disertakan dalam source.

Pembaruan ini tidak mengubah database produksi. Kontrak RPC lelang, travel, likuidasi, kartu, snapshot, dan timeout diperiksa read-only dari fungsi Supabase yang sudah ada. Fixture SQL tetap hanya untuk database lokal; jangan diimpor ke produksi.

## Paket pengujian lokal

File ada di `Builds/Distributions/` dan dikecualikan dari Git. [Laporan build portabel](QA/30.0/build-verification.json) menyimpan hasil serta checksum; file `.sha256` juga tersedia di samping paket.

| Paket | Ukuran | SHA256 |
| --- | ---: | --- |
| `Crazy-Rich-World-Tour-30.0-Windows.zip` | 41.722.961 byte | `564668604327ACE2D512383D0BA2553C6E74C8823D77A564D56824B63ACE3410` |
| `Crazy-Rich-World-Tour-30.0-Android.apk` | 41.592.760 byte | `322F0C2C669780C9C5C9A5C22B60B87AA762AE97D5DD631A27E111E0D3196CBD` |

Ekstrak seluruh ZIP Windows sebelum menjalankan `CrazyRichWorldTour.exe`; folder Data, MonoBleedingEdge, dan DLL harus tetap menyertainya. APK memakai sertifikat debug dan belum dijalankan pada ponsel fisik.

## Verifikasi yang memerlukan Unity Editor dan perangkat

Smoke test Editor di atas memakai snapshot deterministik tanpa RPC dan sudah lulus. Salinan [laporan Play Mode](QA/30.0/unity-playmode-smoke.json) dan [render papan](QA/30.0/unity-playmode-board.png) disertakan untuk ditinjau. Fixture tidak dikirim dalam player. Hasil ini belum membuktikan gameplay multiplayer end-to-end atau performa Android fisik.

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

Tangkapan papan berasal dari kamera Unity saat Play Mode. Gambar hasil image_gen tetap merupakan aset UI terpisah. Pengujian perangkat fisik, sentuhan, jaringan, dan dua client masih diperlukan sebelum pelabelan rilis produksi.

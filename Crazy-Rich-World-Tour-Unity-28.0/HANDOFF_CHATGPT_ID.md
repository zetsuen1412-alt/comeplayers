# Handoff Crazy Rich: World Tour

Status 30 September 2026: source versi 30.0 dengan hotfix layar magenta, melanjutkan Zero Dice 29.0 dan Unity 28.0.

## Repository dan proyek

- Repository: `https://github.com/zetsuen1412-alt/comeplayers` (private).
- Branch: `codex/crazy-rich-world-tour`. Gunakan commit terbaru branch ini, bukan hanya default branch.
- Folder Unity: `Crazy-Rich-World-Tour-Unity-28.0`. Nama folder dipertahankan; versi aplikasi adalah 30.0.
- Editor dipin ke **6000.0.84f1**, built-in render pipeline. Jangan menggantinya dengan versi Unity lain tanpa migrasi yang disengaja.
- Unity Hub, Editor, Android Build Support, SDK/NDK, OpenJDK dan lisensi Personal sudah tersedia di komputer pengguna. Aksesnya tidak otomatis tersedia di chat/cloud baru.

## Perbaikan terakhir dan bukti

Player lama memperlihatkan layar magenta penuh. Semua UI dibuat saat runtime; shader `UI/Default` tidak masuk build. Editor/Play Mode dan log startup yang bersih sebelumnya tidak mendeteksi hilangnya shader UI player.

`CrwtProjectSetup` kini menyertakan shader dari `Graphic.defaultGraphicMaterial`. `CrwtRuntimeShaderChecks` memvalidasi UI dan glTF saat Verify maupun semua build melalui `IPreprocessBuildWithReport`. `GraphicsSettings.asset` menyimpan referensi UI tersebut. Material Standard papan tetap melalui Resources agar tidak memasukkan seluruh varian Standard.

Jangan memasukkan shader internal font `GUI/Text Shader` dari `Library/unity default resources` ke Always Included: percobaan lokal ditolak Unity dengan HideFlags.DontSave. Perbaikan final hanya memerlukan retensi UI/Default untuk overlay, beserta glTF yang sudah ada.

Verify, Windows, dan Android ARM64/IL2CPP telah lulus setelah perbaikan. EXE Windows baru benar-benar diperiksa melalui tangkapan jendela: login dengan ilustrasi/teks/tombol → demo offline → lobby → papan dan HUD tampil. Baca `QA/30.0/ui-fix/verification.json` dan tiga JPG di folder itu. Tidak ada pengujian login online atau pertandingan multiplayer pada langkah ini. APK lolos pemeriksaan signature/paket/alignment, tetapi belum dijalankan pada HP.

Paket lokal terbaru di `Builds/Distributions/` bernama `Crazy-Rich-World-Tour-30.0-Windows-UI-Fix.zip` dan `Crazy-Rich-World-Tour-30.0-Android-UI-Fix.apk`. APK debug-signed, min SDK 23, target SDK 36. Build, Library dan Logs dikecualikan dari Git; source, screenshot dan laporan QA ada di repository. Jangan menganggap paket binary ikut terunggah ke GitHub. Ekstrak seluruh ZIP Windows; EXE memerlukan folder Data dan DLL pendampingnya.

## Aturan gameplay yang harus dipertahankan

- Supabase project `uyehruetoxedmookyfcd`; jalur roll `crwt_v18_roll` → `crwt_v18_roll_core`.
- Dua dadu server-authoritative, masing-masing 0–6; total 0–12. Unity hanya presentasi, tidak membuat RNG gameplay.
- 0+0 tetap di tempat, tidak memproses tile/bonus/pembelian/upgrade/rent/Chance/Festival/Travel/Island/START, tanpa decision baru. Nol termasuk genap dan 0+0 termasuk doubles; extra roll tetap ditentukan server.
- `roll_id` mencegah replay cinematic snapshot lama/duplikat. Starwheel mempunyai tujuh hasil, bukan kubus enam sisi.
- Last Player Standing; tidak ada round-limit victory. Sistem ekonomi, kartu, skill, ranked, map, sosial, spectator/replay, tournament dan rematch tetap memakai backend yang ada. Jangan menambah Pendant/Artifact.
- Migrasi 29.0 sudah diterapkan sebelumnya. Hotfix UI ini tidak mengubah database produksi. Fixture SQL hanya untuk pengujian lokal; jangan diimpor ke produksi. Jangan menaruh service_role/private key dalam client atau Git.

## Lanjutan yang diperlukan

1. Baca `README_ID.md`, `CHANGELOG_ID.md`, `QA_30_ID.md` dan laporan hotfix sebelum mengubah source.
2. Uji dua client online: login/lobby/room/roll/auction/travel/timeout/reconnect/result/rematch; belum ada bukti end-to-end lengkap.
3. Uji APK pada Android fisik: gambar/font/material, touch, safe area, background/resume, jaringan dan performa. Siapkan signing rilis secara terpisah sebelum distribusi store.
4. Perbaiki kualitas visual berdasarkan game sebenarnya. Model GLB masih prototipe; portrait baru Alexia/Rindi. Semua placeholder belum merupakan art produksi final.

Perintah dari folder Unity:

```powershell
npm ci --ignore-scripts
npm test
pwsh -NoProfile -File tests/check-client.ps1
pwsh -NoProfile -File tests/check-actions.ps1
pwsh -NoProfile -File tests/check-board.ps1
pwsh -NoProfile -File tests/check-csharp-syntax.ps1
pwsh -NoProfile -File tools/Invoke-Unity.ps1 -Task Verify
pwsh -NoProfile -File tools/Invoke-Unity.ps1 -Task PlayMode
pwsh -NoProfile -File tools/Invoke-Unity.ps1 -Task Windows
pwsh -NoProfile -File tools/Invoke-Unity.ps1 -Task Android
```

Batch Unity perlu akses IPC ke layanan lisensi Hub; sandbox proses terisolasi pernah menolak koneksi walaupun lisensi sudah aktif. Build berhasil setelah akses lokal normal tersedia. Jangan menafsirkan exit proses saja sebagai sukses: runner memeriksa receipt unik per task. Tetap periksa UI EXE/APK sebenarnya karena build sukses tidak menjamin shader tampil.

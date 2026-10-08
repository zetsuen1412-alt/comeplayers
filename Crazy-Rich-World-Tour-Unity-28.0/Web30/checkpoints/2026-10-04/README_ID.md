# Checkpoint Crazy Rich: World Tour — 2026-10-04

Mulai dari file ini ketika melanjutkan di komputer lain. Checkpoint mencakup game, seluruh roster 3D yang sudah tersimpan, referensi, kandidat rebuild, prop, sumber edit arsip, dan bukti QA. Tidak ada generasi mesh, penggantian aset gameplay, pembelian kredit, atau perubahan billing pada checkpoint ini.

- Repository: `zetsuen1412-alt/comeplayers`
- Branch pengembangan: `codex/crazy-rich-web-v30`
- Branch snapshot: `checkpoint/crazy-rich-world-tour-2026-10-04`
- Folder kerja utama: `Crazy-Rich-World-Tour-Unity-28.0/Web30/`
- PR: [#34](https://github.com/zetsuen1412-alt/comeplayers/pull/34), tetap draft.
- Baseline audit sebelum dokumen checkpoint: `758f1cd5faa1f99ff08f97a11e71bba2b8b6af9b`.
- Inventaris lengkap file: [inventory.json](inventory.json). Hash di inventaris memeriksa berkas tersimpan, bukan persetujuan visual.

## Model yang sudah ada

**Alexia, Rindi, Kairo, Luna, Nox, Atlas, Zeno, Yuna, Mochi, Pip sudah memiliki GLB nyata di repository.** Jangan mengatakan roster belum ada atau hanya menyimpan checkpoint Alexia.

Semua path di tabel berikut relatif terhadap folder Web30.

| Kelompok | Lokasi | Versi dan status |
|---|---|---|
| 10 karakter individual | `client/assets/characters/sculpt-v1/models/{id}.glb` | Source revision 10, mesh/material/embedded image/skin dan enam animasi tersimpan; dipreservasi sebagai roster terdahulu. |
| Roster gabungan | `client/assets/characters/sculpt-v1/roster.glb` | 18.583.980 bytes; sepuluh karakter/timeline. |
| Sumber edit | `production/CRWT-Editable-Source.zip` | 7.638.252 bytes; arsip dilacak Git. Isi ZIP belum diperiksa ulang di checkpoint ini. README lama menyebut source.blend; jangan menyatakan standalone .blend ada di tree. |
| Rebuild Alexia paling baru yang berhasil tersimpan | `production/reconstruction/alexia/v11-hunyuan21-diagnostic/alexia-v11-hunyuan21-untextured-diagnostic.glb` | Hunyuan3D-2.1 Standard, 449.582 faces, 224.713 vertices; untextured/unrigged, eligible hanya untuk controlled texture inspection. |
| Koper Alexia | `production/reconstruction/alexia/props/alexia-suitcase-candidate.glb` | Candidate terpisah; belum final/rig/game. |
| Prop Yuna | `production/reconstruction/yuna/props/yuna-palette-source-guided-optimized-candidate.glb` | 2.304 triangles; kandidat revisi, belum visual approval. |
| Enam GLB legacy | `client/assets/characters/glb/` dan Unity StreamingAssets | Alexia/Rindi/Kairo/Luna/Nox/Atlas, sekitar 34–35 KB; versi procedural lama, bukan roster sculpt-v1 atau rebuild V11. |

Hash SHA-256 roster dicatat per karakter pada `client/assets/characters/sculpt-v1/models/asset-validation.json` dan inventaris checkpoint. Animasi: **Idle, Walk, Jump, Skill, Win, Lose**. Penampilan dan kesiapan produksi tetap ditentukan review, bukan keberadaan skin/nama animasi.

Status review tersimpan pada `production/character-visual-rebuild.json`: sculpt-v1 ditolak sebagai hasil visual final dan dipertahankan sebagai backup; `accepted_models_produced=0`. Koreksi pengguna pada 2026-10-04 mengingatkan bahwa Alexia/Rindi/karakter lain sudah ada dalam 3D. Itu mengharuskan seluruh roster dicatat dan dipertahankan, tanpa menafsirkan persetujuan visual baru. Jangan hapus model terdahulu atau memasang kembali model yang ditolak sebagai final.

## Desain dan jalur rebuild

- Alexia aktif **bermata biru**, bukan override crimson lama. Desain: `production/turnarounds/alexia/turnaround-blue-imagegen-v2.png`; master lineup di `production/references/`.
- Rindi turnaround V5 di `production/turnarounds/rindi/`; masih draft menurut review tersimpan.
- Inventaris desain sepuluh karakter serta prompt tubuh/prop tersedia di `production/`.
- V11 GLB SHA-256: `d0a0fea651079aa98d026a1610ef0a9e7f4c14c0c466cb1d949886df45c24a66`. Pertahankan baseline. Hair loops/root silhouette, mata, jari/cuff, komponen kecil dan sisi tersembunyi masih perlu pemeriksaan/revisi.
- Empat Nano Banana body captures berupa JPEG layar 584×584, bukan PNG ekspor asli; belum konsisten multiview. Hanya front dipakai pada V10/V11.
- V12 tekstur ditolak layanan karena requested GPU duration 270 detik; tidak ada GLB/tekstur. V13 berhenti pada preflight texture module unavailable. Jangan retry tanpa perubahan kondisi yang terbukti.
- `production/reconstruction/tools/REPRODUCE-DIAGNOSTICS.txt` memakai layout arsip portable; cocokkan jalur repository sebelum menjalankan.
- Jangan campurkan branch lama anime/Unity ke Web30 hanya karena nama versinya lebih besar; audit menunjukkan branch Web30 menyimpan pekerjaan CRWT paling lengkap.

## Hasil di luar GitHub yang belum dipulihkan

Chat **Lanjutkan Rekonstruksi Alexia** (`6abfc1ce-6418-83ec-9423-e4df870c1465`) mencatat proyek 3D Jutsu **Crazy Rich - Alexia V2 Clean Rebuild**, revision 6, GLB sekitar 5 MB dan sekitar 185 objek Blender, belum rig/animasi atau final. Ekspor binary/project ID/URL tidak tersedia lewat hasil pembacaan chat sesi ini dan belum ditemukan di Git tree. Pulihkan ekspor tersebut dari proyek/chat asal sebelum menimpa atau menyimpulkan versi itu hilang. Ini kandidat terpisah dari V11 Hunyuan.

Chat **Buat game monopoli kompleks** mencatat `Crazy_Rich_World_Tour_Unity_28_0_FULL.zip` dan .sha256 sebagai output lama; file output itu belum tersedia secara lokal. Isi Unity yang dilacak Git ikut snapshot. Checkpoint ini menjamin file yang dilacak Git, bukan output eksternal yang belum diambil atau file lokal komputer lain yang belum dipush.

## Melanjutkan di komputer lain

Masuk GitHub dengan akun yang bisa mengakses repository privat. Gunakan GitHub Desktop atau Git untuk mengunduh snapshot lengkap, termasuk GLB dan arsip sumber:

```bash
git clone --branch checkpoint/crazy-rich-world-tour-2026-10-04 https://github.com/zetsuen1412-alt/comeplayers.git
cd comeplayers
python Crazy-Rich-World-Tour-Unity-28.0/Web30/tools/verify_checkpoint.py
```

Python 3.10+ diperlukan untuk validator; tidak perlu package, GPU, model download atau API key. `python3` atau `py -3` dapat dipakai sesuai instalasi.

Validator memeriksa keberadaan, ukuran, Git blob SHA-1 semua file baseline dalam lingkup checkpoint, dan SHA-256 model yang ada di QA. CRLF file teks Windows ditangani saat hash. Binary tidak dinormalisasi. Validator tidak mengubah file dan tidak melakukan request jaringan.

Jika checkout yang dipakai sudah ada, simpan/commit perubahan lokal dulu. Jalankan `git status --short`, fetch, lalu buka branch snapshot; jangan menggunakan reset --hard atau overwrite hasil lokal. Untuk pekerjaan baru setelah pemulihan, gunakan branch pengembangan yang terbaru atau branch kerja baru dari snapshot, dan simpan snapshot ini sebagai acuan.

Untuk mengecek mirror website dari repository lengkap, jalankan:

```bash
node Crazy-Rich-World-Tour-Unity-28.0/Web30/tools/publish.mjs --check
```

Audit Git tree checkpoint menemukan **147 file source/mirror identik**, tidak ada missing/different/extra pada enam mapping publish. Ini pemeriksaan versi berkas, bukan pengujian ulang browser, database atau deployment. Hasil QA historis tetap disimpan beserta revisinya.

Preview Vercel dan secret Gemini/Supabase berada di layanan/akun masing-masing; secret tidak ikut Git. Key Gemini sudah terpasang pada Preview branch menurut evidence. Verifikasi akses yang tersedia dan jangan membuat/merotasi key hanya karena pindah komputer atau menempel secret ke chat.

## Titik lanjut pekerjaan

1. Baca inventaris roster, progress karakter dan evidence; pulihkan hasil eksternal Jutsu jika tersedia. Pilih kandidat yang benar sebelum generasi/edit.
2. Pertahankan semua binary/arsip lama. Lanjutkan perbaikan kandidat sesuai review, tanpa mengulang metode gagal yang sama.
3. Review geometri/material terhadap desain yang aktif, lalu topology/UV, rig/deformasi dan enam animasi.
4. Integrasi selector/papan memakai GLB dengan SHA-256 yang sama dengan model yang disetujui. Lengkapi 360°, board screenshot, Idle/Walk/Jump/Skill/Win/Lose. Roster demo sendiri bukan bukti pertandingan online.
5. Client utama adalah Web30 browser/PWA Android/PC + backend Supabase bersama. Android/PC PWA dan smoke online dua client masih perlu verifikasi menurut PR.

Saat meminta checkpoint berikutnya, catat branch + commit, inventaris/hash, seluruh perubahan lokal dan hasil eksternal yang belum dipush. Jangan menandai pekerjaan selesai jika binary hasil terbaru masih hanya berada di komputer asal.

# Checkpoint seluruh proyek — 2026-10-04

Baca [CHECKPOINT_LATEST_ID.md](../CHECKPOINT_LATEST_ID.md) untuk pemulihan lintas komputer dan inventaris seluruh model. Selain kandidat rebuild Alexia berikut, **10 model roster 3D sudah tersimpan** di `client/assets/characters/sculpt-v1/models/`, source revision 10, dengan enam animasi dan source ZIP `production/CRWT-Editable-Source.zip`. Seluruhnya dipreservasi beserta status review; sculpt-v1 tetap backup visual yang pernah ditolak sebagai final.

Catatan Alexia Jutsu revision 6 di chat **Lanjutkan Rekonstruksi Alexia** juga dicatat pada checkpoint; binary ekspor belum tersedia di tree. Checkpoint mencakup semua hasil yang sudah dilacak Git dan mencatat hasil eksternal yang belum dipulihkan. Jangan menganggap hanya Alexia yang sudah mempunyai model.

# Catatan jalur repository

Daftar file berikut mengacu pada isi arsip unduhan lokal. Di repository, body/preview Alexia tersedia dalam production/reconstruction/alexia/, prop Yuna dalam production/reconstruction/yuna/props/, dan skrip portable dalam production/reconstruction/tools/. GLB diagnostik gagal V9/V10 hanya disertakan di arsip; repository menyimpan evidence dan contact sheet. Referensi kanonis tersedia dalam production/references/chibi_travel_adventurers_collectible_lineup.png dan production/turnarounds/alexia/turnaround-blue-imagegen-v2.png.

# Crazy Rich: World Tour — paket karakter dan Nano Banana

Mulai dari `nano-banana-character-prompts.md`; JSON pendamping berisi 40 prompt tubuh dan 100 prompt prop siap salin untuk 10 karakter. Referensi lokal tersedia di `references/master-lineup.png` dan `references/alexia-approved-v2-blue.png`. Detail tersembunyi yang belum tampak pada sumber tetap usulan, bukan desain final.

## Hasil yang sudah dibuat

- Inventaris 10 karakter: bentuk, warna, rambut, pakaian, aksesori, prop, kebutuhan rig dan enam animasi.
- Empat raster Nano Banana Alexia kini tersimpan sebagai **capture JPEG layar 584×584**: `alexia/nano-banana-ui-review/nano-banana-{front,back,left,right}-capture.jpg`, dengan screenshot UI dan `capture-provenance.json`. Ini bukan ekspor PNG penuh Gemini; ekspor tersebut belum berhasil. Inspeksi memastikan **left menghadap kanan gambar**, **right menghadap kiri gambar**. Koper/floor/contact shadow tidak terlihat, tetapi skala, background, hair roots dan patch bintang pakaian belum konsisten. Review `multiview-review.json` menetapkan **multiviewApproved=false**. Tampak depan saja dipakai untuk diagnostik V10 dan V11; tidak ada karakter baru siap game.
- Gemini benar-benar dipanggil untuk spesifikasi teknis Alexia dan pemeriksaan gambar mesh. File `gemini-alexia-3d-spec.*` adalah analisis teks; `alexia/gemini-actual-mesh-review.json` adalah pemeriksaan visual tujuh render GLB nyata.
- Body GLB Alexia V8 dan percobaan cleanup tersedia untuk inspeksi. Keduanya **belum lolos**: rambut terfragmentasi, jari/cuff/sepatu lunak, celah artikulasi kurang baik. Tidak dipasang sebagai karakter produksi.
- Alexia V9 adalah diagnostik nyata memakai **front-only dari imagegen**, bukan input Nano Banana. Hunyuan menghasilkan mesh dengan **1.098.020 faces**; hasil review memberi verdict **REBUILD**. Kandidat ini tidak menjadi body final atau aset game.
- Alexia V10 benar-benar direkonstruksi dari **capture tampak depan Nano Banana**, dengan 800.876 faces. Jarak lengan membaik, tetapi rambut tercabik, wires/floaters dan wajah/jari masih kasar; verdict **REBUILD sebelum tekstur atau rig**. Input adalah JPEG layar, termasuk keterbatasan kompresi dan sparkle kecil di sudut latar, bukan PNG asli.
- Alexia V11 memakai gambar depan yang sama pada **Hunyuan3D-2.1 Standard**, menghasilkan GLB nyata **449.582 faces**. Rambut membentuk gumpalan yang lebih menyatu dan relief kostum lebih bersih. Tujuh sisi serta putaran 360° tersedia di `alexia/v11-hunyuan21-diagnostic/mesh-review/`; review independen memberi **textureCandidateEligible=true untuk inspeksi tekstur terbatas saja**. Topology memiliki 0 boundary dan 0 nonmanifold edge, tetapi 10 komponen tertutup; komponen kecil, hair loops, mata dan jari belum lolos untuk rig/game.
- Alexia V12 mencoba satu panggilan tekstur gratis `/generation_all`. Layanan **menolak durasi GPU yang diminta, 270 detik**, sebelum mengembalikan mesh/tekstur. Tidak ada GLB V12, tidak ada retry otomatis, dan tidak ada pembelian PRO/kredit. Sisa kuota tidak diukur. Evidence kegagalan tersedia di `alexia/v12-hunyuan21-texture-diagnostic/reconstruction-evidence.json`; mesh V11 tetap utuh.
- Kandidat Alexia V13 pada Hunyuan3D-2 berhenti pada **preflight, tanpa submit GPU atau GLB baru**: konfigurasi live menyatakan **Texture Generation (Unavailable)**. Deklarasi 90 detik pada source bukan bukti bahwa tekstur tersedia atau akses gratis akan menerima job. Metadata API/config/runtime beserta hash disimpan; evidence tersedia di `alexia/v13-hunyuan2-texture-diagnostic/preflight-evidence.json`. Penyebab kuota tidak disimpulkan, dan mesh V11 tetap utuh.
- Koper Alexia dibuat sebagai prop GLB terpisah: navy, bintang emas pada muka depan, roda, handle, trim, serta material terpisah. Status **candidate**, belum dirig atau dipasang ke game. Preview tujuh sisi dan turntable 360° berasal dari GLB yang disertakan.
- Palette rigid Yuna tersedia sebagai prop terpisah: `props/yuna-palette-source-guided-optimized-candidate.glb`, **2.304 triangles**, turun **77,57%** dari kandidat awal. Tujuh render dan turntable 360° dibuat dari GLB nyata. Outline, lubang jempol tembus dan layout warna kandidat awal bertahan, tetapi faceting paint terlihat dan bentuk/layout smear sumber masih aproksimasi. Status **candidate untuk revisi**; thickness, back, skala dan fit genggaman belum disetujui.
- Hunyuan benar-benar menghasilkan V8 dan diagnostik V9/V10. V11 Standard juga menghasilkan bentuk yang lebih menyatu. Dua endpoint TRELLIS yang dicoba gagal tanpa GLB dan menyembunyikan sebab upstream; penyebab tetap belum diketahui, bukan otomatis kehabisan kuota.
- Connector Gemini v0.2 mendukung input PNG/JPEG/WebP inline, validasi MIME/base64 dan batas ukuran. 16 kelompok pengujian offline lulus; build web dan pemeriksaan CI pada commit kode lulus.

## Sumber gratis yang digunakan dan jalur produksi

| Sumber | Pemakaian/status | Referensi resmi |
|---|---|---|
| Gemini Apps / Nano Banana | Referensi raster melalui aplikasi; memakai akses akun yang tersedia. Tidak mengaktifkan billing, membeli kredit atau langganan. | [Pembuatan gambar di Gemini](https://support.google.com/gemini/answer/14286560) |
| Gemini API | Analisis teks dan gambar melalui connector proyek yang sudah memiliki key. Image API tidak dianggap gratis. | [Pricing resmi](https://ai.google.dev/gemini-api/docs/pricing) |
| Hunyuan3D-2mv di Hugging Face | Rekonstruksi gratis yang menghasilkan V8 serta diagnostik front-only V9/V10; belum menjadi body produksi. | [Source Space resmi](https://huggingface.co/spaces/tencent/Hunyuan3D-2mv/blob/main/gradio_app.py) |
| Hunyuan3D-2.1 di Hugging Face | Standard menghasilkan V11; percobaan tekstur V12 ditolak karena durasi GPU 270 detik melebihi batas akses gratis. Tidak ada pembelian kredit. | [Space resmi](https://huggingface.co/spaces/tencent/Hunyuan3D-2.1), [source aplikasi](https://huggingface.co/spaces/tencent/Hunyuan3D-2.1/blob/main/gradio_app.py) |
| Hugging Face ZeroGPU | Kuota gratis terbatas, antrean dan ketersediaan diperiksa pada layanan; bukan compute tanpa batas. | [Dokumentasi ZeroGPU](https://huggingface.co/docs/hub/main/spaces-zerogpu) |
| Blender / Rigify | Jalur gratis untuk memperbaiki sculpt, retopology, UV, bake dan rig setelah geometri lolos. Belum dijalankan dalam paket ini. | [Lisensi Blender](https://www.blender.org/about/license/), [manual Rigify](https://docs.blender.org/manual/en/latest/addons/rigify/index.html) |
| Mixamo | Alternatif animasi gratis dengan Adobe ID untuk humanoid yang sesuai. Chibi, rambut besar dan prop dapat mengganggu auto-rig; Mochi/Pip memerlukan rig khusus. Belum dipakai. | [FAQ Adobe](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html) |
| Poly Haven | Sumber material/HDRI CC0 bila dibutuhkan, tanpa mengganti desain karakter kanonis. Belum ada asetnya yang diunduh. | [Lisensi aset](https://polyhaven.com/license) |

Audit [jalur tekstur gratis](reconstruction/alexia/v12-hunyuan21-texture-diagnostic/free-texture-path-audit.json) memverifikasi bahwa kode resmi Hunyuan3D-2.1 Paint menerima mesh yang sudah ada beserta gambar referensi. Namun, endpoint hosted gratis untuk memberi tekstur langsung pada GLB V11 belum terverifikasi dalam dua Space resmi yang diperiksa; kompatibilitas GLB V11 serta runtime/GPU lokal juga belum diuji. Remesh dan pemrosesan UV dapat mengubah geometri. Audit ini terbatas pada jalur tersebut; layanan gratis lain belum dinilai, dan belum ada hasil tekstur yang disetujui.

## Syarat sebelum masuk game

Raster Nano Banana perlu konsisten antar sisi sebelum rekonstruksi. Perbaiki body yang gagal, pisahkan prop, buat topology yang dapat dideformasi, UV/material, rig, dan animasi **Idle, Walk, Jump, Skill, Win, Lose**. Mochi memakai rig kitten; Pip memakai rig mekanis case/roda/handle. Koreografi Skill tiap karakter masih perlu desain.

Review GLB nyata dari tujuh sisi dan 360°. Simpan SHA-256 dan gunakan file yang sama pada selector serta papan game; buktikan animasi dan screenshot di papan. Gambar referensi, viewer, atau GLB candidate sendiri belum membuktikan karakter siap dimainkan.

Perubahan tersimpan pada [draft PR #34](https://github.com/zetsuen1412-alt/comeplayers/pull/34), branch `codex/crazy-rich-web-v30`. Tidak ada body gagal yang menggantikan aset game.

## Reproduksi dan paket

Skrip portable dan instruksi tersedia di `tools/REPRODUCE-DIAGNOSTICS.txt`. `--validate-only` pada V10/V11/V12 memeriksa input/hash tanpa submit ke provider. Folder percobaan yang sudah berisi hasil tidak boleh dipakai untuk submit ulang. Renderer tekstur telah diuji dengan fixture UV sintetis; belum ada GLB tekstur V12 untuk dirender. Semua preview body yang disertakan tetap tanpa tekstur/rig.

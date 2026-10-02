# CODEX HANDOFF — Crazy Rich: World Tour — Gemini MCP + Character Rebuild

Tanggal handoff awal: 2026-10-01
Pembaruan untuk melanjutkan di ChatGPT browser: 2026-10-02

## Arahan pengguna terbaru — 2026-10-02

Pengguna meminta melanjutkan **Alexia tanpa mata merah, memakai desain sebelumnya**. Referensi aktif Alexia sekarang adalah figur pertama dari kiri pada baris atas lineup yang sudah disetujui, dengan **mata BIRU**. Pilihan terbaru ini menggantikan override crimson di bawah; gambar crimson yang belum tersedia tidak lagi menjadi prasyarat pekerjaan Alexia.

Pertahankan rambut silver/lavender, headphone dan pakaian hitam/putih/emas, shorts/belt, sepatu tebal, serta koper navy dengan bintang emas dari lineup asli. Perubahan ini tidak mengaktifkan kembali model procedural/sculpt yang ditolak.

Konektor Gemini sudah diperbaiki pada commit `5c562517c44306d46df7fc0134fffce5975f9c64`; Preview lulus build dan enam pemeriksaan MCP. Analisis gambar berhasil. Pemeriksaan generasi gambar Gemini terakhir mencatat kuota free-tier 0, sehingga draft turnaround Rindi dibuat melalui built-in imagegen. Rindi masih menunggu tinjauan visual; instruksi melanjutkan Alexia tidak dianggap sebagai persetujuan otomatis atas draft Rindi.

## Mulai dari sini di ChatGPT browser

Pengguna meminta menyimpan pembaruan ke GitHub untuk melanjutkan pekerjaan di ChatGPT browser. Gunakan repository `zetsuen1412-alt/comeplayers`, branch **`codex/crazy-rich-web-v30`**, dan baca seluruh file ini. **Jangan gunakan `HANDOFF_CHATGPT_ID.md` sebagai handoff proyek ini.** Jika memakai checkout lokal, fetch lalu checkout dan pull branch tersebut dengan mempertahankan perubahan pengguna yang belum di-commit.

Referensi, draft, prompt lengkap, hasil analisis, dan bukti rebuild sudah masuk GitHub pada commit `c7160cef2513474aa822f022d52cf9ce227ac634`. Pembaruan handoff ini menjelaskan titik lanjutnya.

Kandidat aktif adalah **Alexia bermata biru, turnaround V2 enam view**, dibuat melalui built-in imagegen:

- [Master lineup](production/references/chibi_travel_adventurers_collectible_lineup.png): Alexia adalah figur pertama dari kiri pada baris atas. SHA-256 `d3559fe6948cc5a1befffba7f779d46138517394dcb53f2deb0ce0be113c719e`.
- [Turnaround Alexia V2](production/turnarounds/alexia/turnaround-blue-imagegen-v2.png): SHA-256 `935b1f8f7d2be4a6a453a089041844f2cd4470eb64be17d9d72568efb3708933`.
- [Catatan Alexia dan tautan prompt V1/V2](production/turnarounds/alexia/README_ID.md).
- [Bukti dan status tinjauan Alexia](production/turnarounds/alexia/review-2026-10-02.json).
- [Manifest rebuild](production/character-visual-rebuild.json) dan [hasil verifikasi Gemini](integrations/gemini-mcp/VERIFICATION_2026-10-02_ID.md).

Panel turnaround, dari kiri ke kanan: baris atas front / front three-quarter / left; baris bawah right / back three-quarter / back. Koper berada di **kiri anatomis**: kanan gambar depan, kiri gambar belakang. Bintang emas hanya pada muka depan koper. V2 memperbaiki sisi koper pada panel belakang tiga-perempat dan rotasi depan tiga-perempat. Bagian belakang yang tidak terlihat pada master masih merupakan inferensi.

**Status saat pindah chat:** draft ini belum mendapat persetujuan visual pengguna; pertanyaan tinjauan telah ditampilkan di Codex tetapi belum dijawab. Permintaan memperbarui GitHub tidak dianggap sebagai persetujuan desain. Tampilkan master dan V2 di chat browser, lalu lanjutkan berdasarkan penilaian visual pengguna. Pilihan desain lama bermata biru sudah disetujui; jangan meminta ulang pilihan mata atau menunggu binary crimson.

Belum ada mesh baru, rig baru, atau aset game yang diganti. Setelah turnaround disetujui, lanjutkan rekonstruksi volumetric menggunakan view yang disepakati, kemudian uji fidelity, rig/deformasi, dan integrasi GLB yang sama. Kandidat Hunyuan3D-2mv baru ditinjau dokumentasinya; ketersediaan compute dan hasil mesh belum diuji. Riwayat compute: Hugging Face Jobs mengembalikan 402, TRELLIS.2 Space mencapai kuota GPU, dan Higgsfield memiliki 0 kredit. Tidak ada perubahan billing. Jangan mengulang job yang terblokir tanpa perubahan akses/kuota atau menggantinya dengan model procedural yang ditolak.

Draft Rindi V5 dan seluruh iterasinya tetap tersimpan di `production/turnarounds/rindi/`, belum disetujui. Fokus berikutnya tetap Alexia.

## Scope
Proyek ini KHUSUS Crazy Rich: World Tour. Jangan campur dengan ComePlayers Marketplace, CP Empires & Allies, payroll, lowongan, atau proyek lain.

## Repository
- Repo: zetsuen1412-alt/comeplayers
- Branch: codex/crazy-rich-web-v30
- Folder game: Crazy-Rich-World-Tour-Unity-28.0/Web30/
- Website root Vercel: website/

## Status visual karakter
Target akhir tetap 10 playable 3D character units:
Alexia, Rindi, Kairo, Luna, Nox, Atlas, Zeno, Yuna, Mochi, Pip.

Visual reference yang disetujui user:
- anime-chibi collectible-quality 3D
- benar-benar volumetric 360°
- bisa dilihat dari semua sudut di papan
- bukan sprite/billboard
- bukan procedural generic doll
- sample yang ditunjukkan ke user HARUS memakai aset GLB yang sama dengan yang masuk game
- wajib 360° preview + screenshot in-game + sample video Idle/Walk/action

Riwayat override Alexia 2026-10-01 — dinonaktifkan oleh pilihan pengguna 2026-10-02:
- mata MERAH / CRIMSON
- silver/lavender layered hair
- black/white/gold headphones
- black/white jacket with gold details
- black shorts/belt
- chunky black/white/gold sneakers
- navy luggage with gold star

Model procedural/blender lama ditolak user karena sangat berbeda dari visual referensi. Jangan gunakan sebagai final atau bukti kemiripan.

Catatan aturan rebuild ada di:
Crazy-Rich-World-Tour-Unity-28.0/Web30/production/character-visual-rebuild.json

## Gemini cooperation plan
User memilih opsi integrasi langsung Gemini API -> MCP -> ChatGPT.

Connector Gemini sudah dibuat pada branch ini:

- website/app/api/crwt-gemini-mcp/route.ts
- website/app/api/crwt-gemini-mcp/health/route.ts
- Crazy-Rich-World-Tour-Unity-28.0/Web30/integrations/gemini-mcp/README_ID.md

Connector menyediakan tools:
- gemini_status
- gemini_analyze_reference
- gemini_generate_image
- gemini_character_turnaround

Default:
- analysis/text: gemini-3.8-flash
- image: gemini-3.1-flash-image
- optional image quality: gemini-3-pro-image

Latest connector fix commit:
`5c562517c44306d46df7fc0134fffce5975f9c64`.

Perbaikan menerjemahkan aspect ratio dan ukuran gambar dari argumen MCP ke enum Gemini API; opsi tidak valid ditolak sebelum panggilan jaringan. Tiga tes regresi, typecheck, ESLint pada file yang berubah, dan pemeriksaan diff lulus.

Deployment kode perbaikan yang terakhir diverifikasi pada 2026-10-02 pukul 11:28 Asia/Bangkok:

- ID: `dpl_Cdniro9fodWxHUMV9WviEzr6HYWU`
- URL: https://evo-gaming-6f0vhlo5c-ilham-evogaming-s-projects.vercel.app
- Target: Preview; build `READY`; `geminiConfigured=true`.
- Health, initialize, initialized notification, tools/list, ping, dan gemini_status lulus.

Commit artefak/handoff sesudahnya tidak mengubah kode konektor. Verifikasi deployment branch terbaru sebelum memakai endpoint baru; URL di atas mencatat deployment yang benar-benar telah diuji.

## Required user-side secrets
JANGAN meminta user menempel API key di chat.

`GEMINI_API_KEY` **sudah dipasang** sebagai Secret Vercel pada project `evo-gaming`, hanya environment Preview untuk branch `codex/crazy-rich-web-v30`. Key pengganti sudah digunakan setelah key awal dicabut. Nilai key tidak disimpan dalam repository atau handoff. Jangan membuat atau merotasi key lagi hanya untuk melanjutkan chat.

Preview deployment branch Crazy Rich memakai Vercel Authentication, jadi jika akan dipakai sebagai remote MCP dari luar Vercel, buat juga:

- Deployment Protection -> Protection Bypass for Automation
- simpan secret bypass dengan aman

Pengujian sebelumnya memakai akses Preview sementara yang diizinkan; akses ini tidak disimpan dalam repository. Pemasangan endpoint sebagai connector remote di ChatGPT browser belum dibuktikan. Verifikasi akses MCP dan autentikasi pada browser sebelum mengklaim connector sudah dapat dipanggil dari chat. Jangan menampilkan key/bypass di chat atau commit secret ke source.

## Next tasks for Codex

1. Read the latest branch handoff, Alexia review evidence, and manifest; preserve the original blue-eyed design.
2. Show the master and existing Alexia V2 turnaround for user visual review. Compare all views for consistent face, hair, headphones, outfit, proportions, and anatomical suitcase side. Revise only if needed; do not regenerate an already accepted sheet without a reason.
3. For Gemini MCP access in the new browser session, verify the latest branch deployment, `/api/crwt-gemini-mcp/health`, initialize, tools/list, and gemini_status. Use the already installed secret. Prior reference analyses are saved; repeat analysis only when a changed reference or unresolved concern warrants it. Image generation quota last observed was 0; use the documented imagegen fallback while unavailable.
4. Once turnaround is visually approved, verify available authorized compute and create an actual 3D asset guided by all agreed views. Inspect real mesh surfaces from all sides before accepting fidelity. Do not generate another fake/sample 3D if turnaround is inconsistent.
5. Rig and animate only after visual fidelity passes.
6. Integrate the exact reviewed GLB into the board character selector.
7. Store SHA-256 of the reviewed GLB and verify the same GLB is used in-game.
8. Capture:
    - 360 turntable
    - in-game board screenshot
    - Idle
    - Walk on board
    - one action/Win or Skill clip

The manifest also requires the final animation set Idle, Walk, Jump, Skill, Win, and Lose. Do not claim completion while required clips or integration evidence are missing.

## Acceptance gate
Character is NOT final just because:
- GLB exports
- skeleton exists
- animation names exist
- browser loads
- character walks

Final means:
- visually close to approved reference
- correct face, hair, outfit, accessories, proportions
- full 360 coherent geometry
- deformation survives animation
- same model appears in-game
- user approves visual result

## Important
User was very dissatisfied with prior low-fidelity models. Prioritize visual likeness over speed.

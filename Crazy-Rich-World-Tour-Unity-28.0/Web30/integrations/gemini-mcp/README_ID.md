# Crazy Rich: World Tour — Gemini MCP Connector

Connector ini membuat ChatGPT dan Gemini bekerja dalam satu alur Crazy Rich tanpa menaruh API key Gemini di source code.

## Endpoint

Setelah branch/deployment aktif:

```
https://<deployment-domain>/api/crwt-gemini-mcp
```

Health check:

```
https://<deployment-domain>/api/crwt-gemini-mcp/health
```

## Environment variable wajib

Tambahkan di Vercel Project Settings → Environment Variables:

```
GEMINI_API_KEY=<key dari Google AI Studio>
```

Jangan commit atau kirim API key ke chat.

Opsional, untuk mengizinkan host gambar HTTPS tambahan:

```
CRWT_GEMINI_ALLOWED_IMAGE_HOSTS=example.com,cdn.example.com
```

Default host yang diizinkan mencakup host file OpenAI/OAI, Google storage, dan CloudFront referensi Crazy Rich yang sudah digunakan.

## Tools

- `gemini_status` — cek apakah API key sudah terpasang, tanpa membocorkan key.
- `gemini_analyze_reference` — analisis desain/referensi menggunakan Gemini 3.8 Flash.
- `gemini_generate_image` — generasi/edit gambar menggunakan Gemini 3.1 Flash Image atau Gemini 3 Pro Image.
- `gemini_character_turnaround` — membuat turnaround multi-view ketat untuk karakter Crazy Rich.

## Model default

- Text / visual analysis: `gemini-3.8-flash`
- Image generation/editing: `gemini-3.1-flash-image`

## Hubungkan ke ChatGPT

1. Pastikan deployment sudah sehat dan `geminiConfigured: true`.
2. Aktifkan Developer mode / custom MCP app jika tersedia pada plan/workspace ChatGPT.
3. Buat app/plugin MCP baru dan masukkan URL HTTPS endpoint `/api/crwt-gemini-mcp`.
4. Scan tools.
5. Uji `gemini_status` terlebih dahulu.
6. Untuk Alexia, gunakan `gemini_character_turnaround` dengan reference image yang sudah disetujui.

Catatan: ketersediaan custom MCP di UI ChatGPT bergantung pada plan/workspace. Connector ini tetap dapat digunakan oleh client MCP lain yang mendukung Streamable HTTP.

## Keamanan

- GEMINI_API_KEY hanya dibaca di server.
- Reference image harus HTTPS dan host-nya berada dalam allowlist.
- Ukuran reference image dibatasi 15 MB.
- Endpoint tidak pernah menampilkan API key.
- Jangan menambahkan key ke query string atau source code.

## Verifikasi deployment

Jalankan `verify.mjs` dengan origin HTTPS deployment terbaru dari branch ini. Skrip memeriksa protokol dan keberadaan konfigurasi key tanpa memakai kuota Gemini. Untuk Preview terlindungi, secret automation bypass dibaca dari environment `CRWT_VERCEL_AUTOMATION_BYPASS`; nilai secret tidak ditampilkan atau disimpan.

```powershell
node Crazy-Rich-World-Tour-Unity-28.0/Web30/integrations/gemini-mcp/verify.mjs https://<deployment-host>
```

Hasil terbaru 1 Oktober 2026: [laporan](VERIFICATION_2026-10-01_ID.md), [bukti protokol dan konfigurasi](verification-configured-2026-10-01.json), [uji teks upstream](text-smoke-2026-10-01.json), dan [analisis gambar lineup](reference-analysis-flash-lite-2026-10-01.json). Setelah secret dipasang dan Preview di-redeploy, `geminiConfigured=true`, protokol lulus, dan Gemini menjawab `CRWT_READY`. Analisis gambar berhasil melalui `gemini-3.5-flash-lite` sesudah Gemini 3.8 mengalami kepadatan layanan. Langkah 1–5 handoff selesai; turnaround Alexia masih memerlukan binary referensi crimson yang disetujui. [Pemeriksaan awal sebelum key terpasang](verification-2026-10-01.json) disimpan sebagai riwayat.

[Lanjutan 2 Oktober 2026](VERIFICATION_2026-10-02_ID.md): pengguna meminta melewati hambatan referensi Alexia; alur turnaround dilanjutkan dengan Rindi dari lineup yang disetujui. Analisis Rindi berhasil. Konektor diperbaiki agar rasio/resolusi gambar dikirim memakai enum `generateContent` v1; tes regresi, TypeScript, lint, build Preview dan enam pemeriksaan MCP lulus. Generasi gambar Gemini terhambat kuota 0. [Draft Rindi enam view](../../production/turnarounds/rindi/README_ID.md) dibuat dengan built-in imagegen dan menunggu tinjauan visual pengguna; belum ada mesh atau penggantian aset game.

Pilihan pengguna berikutnya: lanjutkan **Alexia versi lama bermata biru**. Override crimson dinonaktifkan; binary crimson tidak lagi diperlukan untuk desain aktif. [Draft Alexia enam view](../../production/turnarounds/alexia/README_ID.md) sudah dibuat dengan built-in imagegen setelah analisis Gemini, dan menunggu tinjauan visual. Laporan 2 Oktober mencatat urutan arahan tersebut.

# Crazy Rich: World Tour — Gemini MCP Connector

Connector ini membuat ChatGPT dan Gemini bekerja dalam satu alur Crazy Rich tanpa menaruh API key Gemini di source code.

## Endpoint

Setelah branch/deployment aktif:

\`\`\`
https://<deployment-domain>/api/crwt-gemini-mcp
\`\`\`

Health check:

\`\`\`
https://<deployment-domain>/api/crwt-gemini-mcp/health
\`\`\`

## Environment variable wajib

Tambahkan di Vercel Project Settings → Environment Variables:

\`\`\`
GEMINI_API_KEY=<key dari Google AI Studio>
\`\`\`

Jangan commit atau kirim API key ke chat.

Opsional, untuk mengizinkan host gambar HTTPS tambahan:

\`\`\`
CRWT_GEMINI_ALLOWED_IMAGE_HOSTS=example.com,cdn.example.com
\`\`\`

Default host yang diizinkan mencakup host file OpenAI/OAI, Google storage, dan CloudFront referensi Crazy Rich yang sudah digunakan.

## Tools

- \`gemini_status\` — cek apakah API key sudah terpasang, tanpa membocorkan key.
- \`gemini_analyze_reference\` — analisis desain/referensi menggunakan Gemini 3.8 Flash.
- \`gemini_generate_image\` — generasi/edit gambar menggunakan Gemini 3.1 Flash Image atau Gemini 3 Pro Image.
- \`gemini_character_turnaround\` — membuat turnaround multi-view ketat untuk karakter Crazy Rich.

## Model default

- Text / visual analysis: \`gemini-3.8-flash\`
- Image generation/editing: \`gemini-3.1-flash-image\`

## Hubungkan ke ChatGPT

1. Pastikan deployment sudah sehat dan \`geminiConfigured: true\`.
2. Aktifkan Developer mode / custom MCP app jika tersedia pada plan/workspace ChatGPT.
3. Buat app/plugin MCP baru dan masukkan URL HTTPS endpoint \`/api/crwt-gemini-mcp\`.
4. Scan tools.
5. Uji \`gemini_status\` terlebih dahulu.
6. Untuk Alexia, gunakan \`gemini_character_turnaround\` dengan reference image yang sudah disetujui.

Catatan: ketersediaan custom MCP di UI ChatGPT bergantung pada plan/workspace. Connector ini tetap dapat digunakan oleh client MCP lain yang mendukung Streamable HTTP.

## Keamanan

- GEMINI_API_KEY hanya dibaca di server.
- Reference image harus HTTPS dan host-nya berada dalam allowlist.
- Ukuran reference image dibatasi 15 MB.
- Endpoint tidak pernah menampilkan API key.
- Jangan menambahkan key ke query string atau source code.

# ComePlayers Messages V31 — Cloudflare R2 Attachments

V31 memindahkan attachment chat baru ke bucket privat Cloudflare R2. Attachment lama yang sudah tersimpan di Supabase Storage tetap dapat dibuka.

## Fitur

- Upload langsung dari browser ke R2 memakai presigned `PUT` URL yang berlaku 90 detik.
- Download memakai presigned `GET` URL yang berlaku 120 detik.
- Credential R2 tetap berada di server dan tidak dikirim ke browser.
- Maksimal 10 MB; tipe yang diizinkan: JPG, PNG, WEBP, dan PDF.
- Setelah upload, server memeriksa ukuran, `Content-Type`, dan signature/magic bytes file.
- Upload dibatasi 12 kali per menit per pengguna melalui Upstash Redis, dengan fallback aman bila Redis tidak tersedia.
- Upload lama berbentuk multipart tetap didukung untuk aplikasi desktop/mobile lama.
- Tidak ada migration database baru pada V31.

## 1. Pasang patch

Ekstrak ZIP patch, lalu jalankan:

```powershell
powershell -ExecutionPolicy Bypass -File .\APPLY_MESSAGES_R2_V31.ps1 -ProjectPath "C:\Comeplayers-new"
```

Script membuat backup file lama di:

```text
C:\Comeplayers-new\website\_patch_backups\messages-r2-v31-<tanggal>
```

## 2. Pastikan Environment Variables

Di `C:\Comeplayers-new\website\.env.local` dan Vercel, isi:

```env
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=comeplayers-chat-attachments
R2_ENDPOINT=https://ACCOUNT_ID.r2.cloudflarestorage.com
```

Jangan memberi awalan `NEXT_PUBLIC_` pada credential R2.

## 3. Pasang CORS bucket R2 — wajib

Browser tidak dapat memakai presigned URL lintas domain tanpa CORS.

Cloudflare Dashboard:

```text
Storage & databases
→ R2 Object Storage
→ comeplayers-chat-attachments
→ Settings
→ CORS Policy
→ Add CORS policy
→ JSON
```

Tempel isi file:

```text
website\R2_CORS_POLICY_V31.json
```

Policy mengizinkan:

- `https://comeplayers.com`
- `https://www.comeplayers.com`
- `http://localhost:3000`

Tidak perlu membuat bucket publik.

## 4. Install dan periksa

```powershell
cd C:\Comeplayers-new\website
npm install
npm run typecheck
npm test
npm run build
npm run dev
```

Untuk V31 **tidak perlu** menjalankan:

```powershell
npx supabase db push
```

## 5. Pengujian

Buka:

```text
http://localhost:3000/messages
```

Uji:

1. Upload JPG/PNG/WEBP/PDF di bawah 10 MB.
2. Pastikan pesan terkirim dan attachment dapat dibuka.
3. Coba file ekstensi palsu; server harus menolak bila isi file tidak sesuai.
4. Pastikan attachment lama tetap terbuka.
5. Setelah lokal aman, redeploy Vercel dan uji `https://comeplayers.com/messages`.

## Catatan keamanan

Presigned URL adalah bearer token sementara. Jangan mencatat URL lengkap di log atau membagikannya. Bucket tetap privat dan Access Key/Secret hanya disimpan di `.env.local` serta Vercel Environment Variables.

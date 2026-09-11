# ComePlayers V12 — Messaging, Order Chat & Anti-Scam

V12 dijalankan setelah V11 Trust, Risk & Account Security.

## Yang ditambahkan

- Chat produk sebelum pembelian.
- Chat khusus order untuk buyer dan seller.
- Semua pembuatan room, pengiriman pesan, read receipt, upload, report, dan moderasi diproses melalui API server.
- Filter otomatis untuk:
  - nomor telepon dan email;
  - WhatsApp, Telegram, Discord, dan kanal kontak eksternal;
  - link eksternal;
  - ajakan pembayaran di luar ComePlayers;
  - password, OTP, recovery code, seed phrase, dan credential lain.
- Attachment JPG, PNG, WEBP, dan PDF maksimal 10 MB.
- Attachment baru disimpan pada bucket Supabase privat dan hanya dibuka memakai signed URL 2 menit.
- Rate limit 20 pesan per menit per pengguna.
- Report message oleh buyer atau seller.
- Admin moderation queue di `/admin/chat-moderation`.
- Admin dapat menghapus pesan, mengunci room, menyelesaikan laporan, dan menangguhkan chat pengguna.
- Unread counter melalui API server.

## Penting

Filter chat bukan pengganti antivirus atau pemeriksaan manusia. V12 membatasi jenis file, menyimpan attachment secara privat, dan menyediakan report/moderation. Pemeriksaan isi gambar atau PDF dengan OCR/antivirus belum termasuk pada V12.

Attachment lama yang sebelumnya disimpan sebagai URL publik tidak diubah otomatis. Semua attachment baru setelah V12 menggunakan bucket privat.

## 1. Backup

```powershell
git add .
git commit -m "backup before messaging antiscam v12"
```

## 2. Extract patch

Extract `comeplayers_messaging_antiscam_v12_patch.zip` ke root project:

```text
C:\Project\evo-gaming
```

Pilih **Replace All**.

## 3. Jalankan SQL

Buka file ini di VS Code:

```text
scripts/comeplayers_messaging_antiscam_v12.sql
```

Copy seluruh isi SQL, paste ke Supabase SQL Editor, lalu klik **Run**.

Jangan memasukkan nama/path file ke SQL Editor.

Hasil yang diharapkan:

```text
comeplayers_messaging_antiscam_v12_ready
```

Tidak ada environment variable baru untuk V12.

## 4. Validasi source

```powershell
npm run typecheck
npm run lint
npm run build
npm run dev
```

## 5. Pengujian product chat

1. Login sebagai buyer.
2. Buka sebuah produk milik seller lain.
3. Klik **Chat Seller**.
4. Room harus dibuat otomatis dan halaman `/messages` terbuka.
5. Kirim pesan biasa, misalnya:

```text
Is this product still available?
```

6. Pesan harus terkirim.

## 6. Pengujian anti-scam

Coba kirim salah satu contoh berikut:

```text
WhatsApp saya 081234567890
Pay directly outside ComePlayers
Password: test123
https://example.com/contact
```

Pesan harus ditolak dan event harus muncul di:

```text
/admin/chat-moderation
```

Jangan menggunakan data pribadi asli saat pengujian.

## 7. Pengujian order chat

1. Buka order sebagai buyer atau seller.
2. Klik **Protected Order Chat**.
3. URL akan membuka `/messages?order=ID_ORDER`.
4. Buyer dan seller harus masuk ke room order yang sama.
5. Pengguna yang bukan participant order harus mendapat akses ditolak.

## 8. Pengujian private attachment

1. Upload JPG/PNG/WEBP/PDF di bawah 10 MB.
2. Pesan attachment harus terkirim.
3. Klik **Open secure attachment**.
4. File dibuka melalui signed URL sementara.
5. File EXE, ZIP, atau ukuran di atas 10 MB harus ditolak.

## 9. Pengujian report dan admin moderation

1. Login sebagai recipient pesan.
2. Hover pesan masuk dan klik **Report**.
3. Login admin.
4. Buka:

```text
http://localhost:3000/admin/chat-moderation
```

5. Uji tindakan berikut pada data test:
   - Resolve / Dismiss.
   - Remove Message.
   - Lock Room / Unlock Room.
   - Suspend Chat 24h.

## 10. Verifikasi database

Jalankan isi:

```text
MESSAGING_ANTISCAM_V12_VERIFY.sql
```

Semua tabel, bucket, dan RLS harus tersedia.

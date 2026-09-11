# ComePlayers Messages Identity V33

## Yang berubah

- Tampilan `/messages` dirombak ke identitas ComePlayers: gelap, cyan, dan kuning.
- Semua pengguna yang sudah login dapat membuat group chat atau membuka squad di **Squad Finder**.
- Pembuat grup otomatis menjadi **Creator**.
- Creator dapat menunjuk atau mencabut **Leader**.
- Creator dan Leader dapat mengundang serta mengeluarkan anggota.
- Leader tidak dapat mengeluarkan Creator atau Leader lain; tindakan terhadap Leader lain tetap milik Creator.
- Semua anggota dapat memakai chat, voice, video, screen sharing, dan group livestream.
- Squad Finder mendukung game, mode, rank, platform, region, kapasitas party, join otomatis, dan penutupan otomatis saat penuh.
- Unduhan attachment R2 memverifikasi tipe, ukuran, dan signature file sebelum memberikan signed URL.

## Instalasi

1. Pastikan backup database tersedia.
2. Jalankan migrasi Supabase berikut melalui alur migrasi proyek:

   `supabase/migrations/20260710190000_messages_identity_squad_leaders_v33.sql`

3. Pasang dependensi:

   `npm ci`

4. Pastikan konfigurasi Supabase, Cloudflare R2, Redis, dan LiveKit yang sudah dipakai proyek tetap tersedia.
5. Validasi kode:

   `npm run typecheck`

   `npm run typecheck:e2e`

   `npm test`

6. Jalankan aplikasi dan uji `/messages` menggunakan setidaknya tiga akun: Creator, Leader, dan Member.

## Aturan hak akses

| Peran | Buat grup/squad | Chat/voice/video/live | Invite | Kick Member | Kick Leader | Tunjuk Leader |
|---|---:|---:|---:|---:|---:|---:|
| Semua user | Ya | Ya | Setelah menjadi Creator/Leader | Setelah menjadi Creator/Leader | Tidak | Tidak |
| Leader | Ya | Ya | Ya | Ya | Tidak | Tidak |
| Creator | Ya | Ya | Ya | Ya | Ya | Ya |
| Platform Admin | Ya | Ya | Ya | Ya | Ya | Ya |

## Validasi yang sudah dijalankan

- TypeScript aplikasi: lulus.
- TypeScript E2E: lulus.
- Unit/integration tests: 146 lulus, 0 gagal.
- ESLint pada file yang berubah: 0 error; terdapat warning React effect lama pada halaman Messages.

Production build tidak dijadikan validasi utama dalam lingkungan pengerjaan ini karena proyek sangat besar. Jalankan `npm run build` pada mesin deployment/CI dengan memori yang memadai setelah migrasi diterapkan.

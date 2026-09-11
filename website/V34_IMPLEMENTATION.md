# ComePlayers Messages V34

Paket ini menggabungkan source website, aplikasi desktop, dan aplikasi Android serta menyempurnakan halaman Messages bergaya Discord/ComePlayers.

## Fitur utama

- Undangan anggota tidak lagi langsung memasukkan pemain ke grup.
- Semua undangan memiliki status `pending` dan pemain wajib memilih **Accept** atau **Decline**.
- Random matchmaking dapat mengundang satu pemain atau mengisi seluruh slot kosong secara acak.
- Undangan matchmaking berlaku 30 menit; undangan langsung dan saat pembuatan grup berlaku 24 jam.
- Penerimaan undangan memakai transaksi dan lock kapasitas agar slot terakhir tidak dapat diambil dua pemain sekaligus.
- Leader/admin tetap dapat mengundang dan mengeluarkan anggota.
- Panel undangan masuk/keluar tersedia di halaman Messages.
- Tombol header, panel anggota, pinned information, menu tambahan, event, gift, emoji, voice shortcut, dan session settings sudah memiliki aksi.
- Shared `chat-core` untuk desktop dan Android memiliki API membaca undangan, Accept/Decline, dan auto-invite matchmaking.

## Migrasi database wajib

Terapkan migrasi berikut **sebelum** men-deploy kode aplikasi:

```text
website/supabase/migrations/20260711183000_messages_invite_accept_matchmaking_v34.sql
```

Migrasi membuat tabel `chat_party_invitations`, RLS, indeks, dan RPC `cp_respond_party_invite_v34`.

Jalankan migrasi menggunakan alur Supabase proyek yang biasa dipakai. Jangan menaruh `service_role` key pada frontend.

## Menjalankan website

```bash
cd website
npm ci
npm run typecheck
npm run test
npm run build
npm run dev
```

Salin nilai konfigurasi dari `.env.example` ke `.env.local` milik Anda. File rahasia `.env.local` sengaja tidak disertakan dalam ZIP hasil akhir.

## Menjalankan aplikasi desktop/Android

```bash
cd comeplayers-apps
npm ci
npm run typecheck
```

Gunakan `.env.example` pada masing-masing aplikasi untuk membuat `.env` lokal. File `.env` asli sengaja tidak dimasukkan.

## Hasil validasi

- Website TypeScript: lulus.
- E2E TypeScript: lulus.
- Test otomatis: **149/149 lulus**.
- ESLint: **0 error**; terdapat 112 warning lama di bagian lain proyek.
- Shared desktop/Android `chat-core`: lulus TypeScript.
- Next.js production compile: lulus.

## Catatan perilaku

- Public Squad Finder masih dapat diikuti melalui tombol Join karena tindakan tersebut merupakan persetujuan eksplisit dari pemain.
- Auto-invite hanya mengirim undangan; pemain tidak menjadi anggota sampai menekan Accept.
- Pembuatan grup dan start livestream tetap memakai alur API asli dan tidak diubah menjadi satu transaksi atomik.

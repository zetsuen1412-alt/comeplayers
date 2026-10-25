# Discord buyer → notifikasi Monitor FH3 (candidate; belum produksi)

**Baseline:** `main` `84d5f4017c4193a94a31d6081ecdc111b8e0c12c` pada 25 Oktober 2026; Windows 2.0.2 / Android 1.7.0 tetap produksi. Ini hanya kandidat pengembangan, tidak memberi izin migrasi, deploy, merge, atau mengganti paket.

## Aturan

- Pesan dari **buyer Discord User ID yang dipasangkan oleh admin** dengan satu order FH3 terverifikasi, pada **Discord Guild ID dan Channel ID** yang benar, dapat memicu notifikasi pada petugas order itu; admin Monitor dapat melihat semua notifikasi yang memenuhi syarat.
- Akun EVOBOOSTER, nama yang mengandung label internal EVO, bot/webhook dan ID akun internal yang diblokir **tidak** memicu notifikasi. Gunakan denylist **User ID** untuk staf; nama bersifat pelindung tambahan karena dapat diganti.
- Pesan anggota grup lain atau akun yang **tidak** dipasangkan ke order **diabaikan**, meskipun mereka chat di `#general`.
- Jangan memproses konten chat, lampiran, DM, atau kredensial. Simpan metadata minimum: Discord message ID, referensi order, timestamp dan channel; tautkan ke pesan Discord asli.
- Hanya order dari `@evogamings` di grup Telegram FH3 sah yang dapat dipasangkan. Refund, Bermasalah, diarsipkan, atau sudah selesai sebaiknya tidak dibunyikan. Satu message ID + order ref disimpan idempoten; notifikasi pertama kali membuat baseline tanpa suara.
- Pekerja lama tidak boleh melihat pesan order yang ditransfer ke orang lain. Verifikasi binding akun karyawan yang masih aktif dilakukan **pada setiap request API**, tidak hanya di aplikasi.
- Jangan pakai bot berbasis token akun pribadi/self-bot. Gunakan aplikasi bot Discord resmi melalui Gateway `MESSAGE_CREATE` `GUILD_MESSAGES`. Tidak perlu akses isi pesan (MESSAGE_CONTENT) jika hanya memeriksa metadata sender/channel dan tanpa preview isi.
- Incoming webhook Discord biasa mengirim pesan **ke** Discord dan bukan mekanisme membaca semua pesan channel; bot Gateway yang terus berjalan diperlukan.

## Pemetaan awal contoh

| Order | Guild ID | Channel ID | Buyer User ID | Pekerja |
| --- | --- | --- | --- | --- |
| X4759 | Dari menu Copy Server ID | Copy Channel ID | Copy User ID customer | Sesuai TAKE order |

Semua ID disalin dari Discord Developer Mode dan harus diperiksa admin. Teks `Discord Server` dari Telegram adalah **informasi tampilan**, bukan kunci identitas yang aman.

## Batas rilis

- Semua pekerjaan kode dan schema tetap pada branch fitur. Migrasi terpisah additive saja, tidak menyentuh tabel Payroll, karyawan, gaji, atau Closing.
- Bot token, HMAC secret dan daftar ID internal harus disimpan pada secret manager, **tidak** di Git, EXE, atau APK.
- Perlu bot berada di server Discord yang relevan dengan izin membaca channel; jika server milik pelanggan tidak mengizinkan bot bergabung, pemantauan chat server tersebut tidak tersedia.
- Lakukan uji **offline dengan fixture** lebih dahulu, lalu uji lingkungan terpisah menggunakan akun dan pesan yang benar-benar diizinkan. Dilarang mengirim order palsu ke grup FH3 produksi.
- QA Windows dan Android pada perangkat fisik tetap wajib. Tidak ada klaim notifikasi live berjalan hanya dari test matcher.

## Implementasi kandidat pada branch fitur

- Matcher server: `website/lib/monitorDiscordBuyerAlerts.ts`; pengikatan recipient berbasis penugasan saat ini: `monitorDiscordRecipients.ts`.
- Migrasi **baru, belum diterapkan**: `website/supabase/migrations/20261025160001_fh3_discord_buyer_alerts.sql`; dua tabel tambahan khusus metadata buyer Discord dengan RLS. Tidak memodifikasi `cp_payroll_workspace`, Payroll, upah, karyawan, atau Closing.
- Admin: `POST /api/admin/payroll/mobile/discord-bindings` dengan bearer Monitor admin, body `{orderRef,guildId,channelId,buyerUserId,enabled}`. Tombol **Hubungkan Discord Buyer** pada Windows → Kelola Order menyediakan UI untuk mengisi ID. ID jangan dikira username.
- Ingest bot: `POST /api/integrations/discord/fh3-message`, HMAC SHA-256 header `x-cp-discord-timestamp` dan `x-cp-discord-signature` dari service host. Tidak boleh dipanggil perangkat biasa.
- Read: `GET /api/admin/payroll/mobile/discord-alerts` memvalidasi session/binding pekerja terkini, kontrol arsip dan asal order; respons hanya `messageId`, `orderRef`, URL pesan Discord dan timestamp. **Tidak** menyertakan isi chat.
- Gateway host: `node scripts/fh3-discord-buyer-gateway.mjs` (Node.js 22+ dengan native WebSocket). Service ini **tidak dapat berjalan sebagai proses long-lived di Vercel request**; sediakan host selalu aktif dengan restart-on-failure, jaringan HTTPS, dan logging hanya metadata.
- Windows kandidat **2.0.3** (tray/banner status dari endpoint; baseline dan dedup per akun) dan Android kandidat **1.7.1** (notification channel terpisah via foreground service; dedup per akun). Ini **bukan** versi yang telah diterbitkan. Rilis produksi sebelumnya tetap Windows 2.0.2 dan Android 1.7.0.

## Konfigurasi yang diperlukan sebelum pengujian nyata

Environment hanya pada server/secret manager:

```text
MONITOR_DISCORD_GUILD_IDS=<guild-snowflake-id[,another-id]>
MONITOR_DISCORD_INTERNAL_USER_IDS=<account-staff-id[,another-id]>
MONITOR_DISCORD_RELAY_SECRET=<random-private-secret-32-plus-characters>
MONITOR_DISCORD_BOT_TOKEN=<official-discord-bot-token>  # Gateway host ONLY
MONITOR_DISCORD_RELAY_URL=https://www.comeplayers.com/api/integrations/discord/fh3-message  # Gateway host ONLY
```

- `MONITOR_DISCORD_GUILD_IDS`, `MONITOR_DISCORD_INTERNAL_USER_IDS` dan `MONITOR_DISCORD_RELAY_SECRET` juga diatur pada Vercel **saat deployment diizinkan**. Bot token tidak perlu dan sebaiknya tidak ditempatkan di aplikasi Windows/Android atau pada website apabila Gateway dihost terpisah.
- Siapkan Discord bot resmi, undang dengan `View Channel` dan `Read Message History` sesuai kebutuhan, aktifkan `GUILD_MESSAGES`. Untuk metadata sender/channel tanpa isi chat, pemrosesan ini tidak membutuhkan `MESSAGE_CONTENT` privileged intent; jangan menambahkan intent tersebut kecuali benar-benar diperlukan dan disetujui.
- Aktifkan Developer Mode pada Discord, lalu Copy Server ID, Copy Channel ID, dan Copy User ID buyer. Pada Windows **Kelola Order**, pilih order aktif yang berasal dari @evogamings, klik Hubungkan Discord Buyer, isi ketiga ID, dan konfirmasi. Gunakan aksi yang sama untuk menonaktifkan binding.
- Jika bot tidak ada pada server customer, atau customer hanya mengirim DM ke akun pribadi, fitur ini tidak bisa membaca percakapan tersebut. Jangan otomatis login atau mengotomatiskan akun Discord pribadi untuk mengatasi pembatasan.
- Admin sebaiknya memasukkan **User ID internal** EVOBOOSTER dan anggota EVO lain dalam denylist, karena display name dan server nickname dapat diubah.
- Pastikan fungsi `GET discord-alerts` tidak memberi akses ke alert di luar order yang sedang dikerjakan karyawan; setelah transfer, petugas lama harus kehilangan akses ke alert yang terkait order itu.

## Urutan pengujian dan peluncuran yang aman

1. Review branch & draft PR; lint/typecheck, uji matcher, ingest HMAC, SQL PGlite, unit test Android, build dan startup Windows; verifikasi belum ada data produksi ditulis.
2. Setelah persetujuan **migrasi baru secara spesifik**, lakukan backup/snapshot dan terapkan migrasi **sekali** (jangan ulang migrasi PR #93–#95).
3. Setelah persetujuan **deploy secara spesifik**, konfigurasi secret, bot Gateway dan monitoring host. Periksa penerimaan event di lingkungan yang diizinkan tanpa payload chat.
4. Setelah persetujuan **merge/rilis**, distribusikan paket kandidat melalui jalur CI terverifikasi. Jangan terbitkan binary baru menggunakan tag/hash produksi lama.
5. Gunakan pesan riil yang diizinkan untuk uji end-to-end, bukan order Telegram palsu. Uji mute EVOBOOSTER, nama EVO, bot, orang lain, channel salah, buyer dengan beberapa order, transfer pekerja, logout, dedup, app di background, dan device offline.
6. Jika ada error API Discord atau bot offline, Monitor harus tetap bisa menerima order Telegram dan melanjutkan TAKE/START/DONE serta Tutup Buku lama.

**Belum diuji:** akses server Discord aktual, izin bot, device TTS/Android foreground, pesan customer nyata, serta migrasi/rollout produksi. Uji otomatis tidak membuktikan chat eksternal benar-benar masuk.

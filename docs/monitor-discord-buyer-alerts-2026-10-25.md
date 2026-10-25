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

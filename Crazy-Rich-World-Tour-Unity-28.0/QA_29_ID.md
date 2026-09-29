# QA 29.0 — Zero Dice System

## Lulus otomatis

- `npm test`: 10 suite pengujian PostgreSQL lokal lulus (PGlite 0.5.8).
- Semua 49 ordered pairs diperiksa, termasuk 0+0, 0+1, 0+6, 1+0, 6+0, 1+1, 6+6. Total, doubles, zero_roll, posisi, dan field JSON diperiksa.
- 1.140 pemanggilan fungsi roll inti pada 160 tile / lima map melalui wrapper pemain, bot, dan timeout. Properti kosong, milik sendiri, dan milik lawan diperiksa. ZERO ROLL mempertahankan seluruh player state (cash, posisi, efek, skip turns), properti, dan Festival; pending selalu null.
- 100.000 pasangan menggunakan ekspresi RNG yang diekstrak dari fungsi inti hasil migrasi: d1/d2 0–6, total 0–12, 49 outcome muncul, tidak ada nilai invalid. Ini menguji rentang; bukan pembuktian statistik keacakan sempurna.
- Focus odd/even, nol genap, extra_roll tidak habis karena doubles, START crossing positif, idempotency, cron, serta match tetap active pada round 999 dengan dua pemain hidup.
- Finalisasi ketika tersisa satu pemain memanggil ranked finalizer. Dalam fixture, finalizer hanya direkam sebagai stub; sistem ekonomi/ranked lain bukan cakupan tes ini.
- ACL: anon tidak memiliki EXECUTE; authenticated hanya pada wrapper roll/bot/timeout, tidak pada core/timeout_apply. Penolakan tanpa auth diuji.
- Migrasi dapat dijalankan ulang dan dapat memperbarui core lama 1–6 maupun patch awal 0–6.
- `pwsh -NoProfile -File tests/check-client.ps1`: 66 assertion C# lulus. Mengompilasi source CrwtDiceRules dan DTO aktual melalui .NET, termasuk penolakan d1 hilang, nullable state, snapshot duplikat/out-of-order, reconnect, dan dua roll nol berbeda.

## Supabase aktif

- Project `uyehruetoxedmookyfcd`, migrasi `20260929144722_crwt_zero_dice_v29` berhasil diterapkan.
- Read-only post-check mengonfirmasi dua ekspresi RNG 0–6, guard ZERO ROLL, guard movement START, focus tanpa retry cap, roll_id, dan ACL yang tetap benar.
- Security Advisor sebelum/sesudah tidak menambahkan finding untuk fungsi yang diubah. Tiga wrapper tetap memiliki warning SECURITY DEFINER authenticated yang sudah ada; wrapper memang melakukan validasi auth + membership/host/turn sebelum memanggil core. [Penjelasan advisor](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
- Tidak ada service_role key atau data pertandingan/pengguna produksi yang disimpan di fixture.

## Belum diverifikasi: Unity / perangkat

Unity Editor tidak terpasang. Pemeriksaan C# di atas tidak menggantikan compile Unity, rendering, atau tes input pada perangkat. Jalankan **Crazy Rich > 29.0 > Check Dice Protocol**, lalu QA berikut pada Windows dengan mouse dan Android dengan touch:

1. Login, buka match, tekan ROLL berulang cepat: hanya satu request aktif; wajah `?` bertahan hingga hasil server datang. Putus jaringan: animasi menunggu dibatalkan pada timeout dan snapshot dipulihkan.
2. Pada lingkungan backend pengujian terisolasi, gunakan fixture untuk semua 49 pasangan. Jangan menambahkan endpoint forced-roll ke produksi.
3. 0+5 menampilkan `[0] + [5]`, `TOTAL 5`; gerakan baru dimulai setelah Reveal.
4. 0+0 menampilkan ZERO ROLL, dua halo mint/bintang, dan reaksi tilt singkat. Posisi transform pion tetap. Tidak ada menu tile/purchase/upgrade/rent/bonus/chance/festival/travel/island yang muncul. ROLL kembali untuk doubles.
5. Ulangi 0+0 dua kali: keduanya tampil sekali dengan roll_id berbeda. Snapshot yang sama dan refresh koneksi tidak mengulang cinematic atau gerakan.
6. Coba focus GANJIL/GENAP Kairo; tombol focus bersifat sementara. Uji bot, timeout, dan spectating server snapshots.
7. Putar/zoom kamera, ganti ukuran layar, periksa panel tidak menghalangi kontrol permanen. Uji pause/resume dan keluar scene saat request/animasi berjalan.
8. Build menu Windows dan Android; lakukan smoke test login → lobby → match → result → rematch. Belum ada APK/EXE terverifikasi untuk 29.0.

`QA_ID.md` mempertahankan catatan paket 28.0 sebagai riwayat, bukan bukti build 29.0.

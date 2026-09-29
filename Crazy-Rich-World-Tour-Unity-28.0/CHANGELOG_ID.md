# Changelog

## 29.0 — Zero Dice System (29 September 2026)

- Server: kedua dadu menggunakan `floor(random()*7)`, total 0–12. ZERO ROLL melewati seluruh cabang tile dan tidak memberi bonus START; 0+0 tetap doubles.
- Dice Focus memakai rejection sampling tanpa batas 12 percobaan, sehingga nol diterima sebagai genap dan hasil tidak pernah melanggar focus.
- `last_roll`: d1, d2, total, doubles, zero_roll, from, to, tile, event; `roll_id` ditambahkan untuk deduplikasi cinematic dan dua hasil identik berurutan.
- Retry dengan idempotency key sama diperiksa lagi sesudah row lock. Hak RPC authenticated dan helper internal dipertahankan.
- Unity: Starwheel tujuh outcome, halo/bintang pada angka nol, cinematic ZERO ROLL, enam state animasi, dan reaksi karakter tanpa berpindah tile.
- Snapshot/RPC diurutkan menurut versi; gerakan dan tombol aksi menunggu reveal. Nilai hilang/out-of-range ditolak. Guest demo tidak lagi menghasilkan roll lokal.
- Menu focus ganjil/genap Kairo, batas waktu jaringan, penanganan field nullable server, dan versi/menu build 29.0.
- Regresi PostgreSQL lokal: 49 pasangan, 100.000 simulasi, 1.140 kasus anti-farming pada lima map, jalur bot/timeout/cron, doubles, START, focus, idempotency, ACL, dan Last Player Standing.
- Pemeriksaan C# aktual (aturan, cursor, DTO JSON): 66 assertion lulus. Check Dice Protocol tersedia di Unity Editor.

Unity Editor tidak tersedia: compile seluruh proyek, Play Mode, visualisasi final, dan build/perangkat Android/Windows masih perlu QA. Sistem game lain tidak diimplementasikan ulang.

## 28.0 — Source baseline

Source Unity 6 yang dipulihkan dan diverifikasi diimpor tanpa perubahan gameplay pada commit `ac93c986`. Berisi Assets, Packages, ProjectSettings, enam GLB, 55 profil landmark, dan LegacyWeb27. Metadata Git menolak cache/build Unity dan mempertahankan LF agar checksum sumber konsisten.

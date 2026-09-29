# Changelog

## 30.0 — Chibi World (29 September 2026)

- Menggabungkan perbaikan fondasi 29.1: 32 posisi tile unik, kontrol lelang untuk semua peserta eligible, pilihan kota/resort, seluruh distrik Festival, pemilihan aset likuidasi, kartu/target, dan konfirmasi aksi yang mengakhiri partisipasi.
- HUD ringkas dengan drawer pemain dan sheet sementara, safe area, inspeksi tile dengan tap, kontrol kamera mouse/touch.
- Integrasi enam GLB beranimasi lewat glTFast 6.14.1; fallback chibi, transisi animasi, reduced motion, cleanup import async, dan reaksi ZERO tanpa mengubah posisi pion.
- Siluet properti House/Tower/Hotel/Landmark, animasi upgrade, plaza World Tour, ring pemilik/giliran/Festival, warna distrik dan label kota.
- Portrait Alexia/Rindi dan ilustrasi lobby original, digunakan langsung melalui Resources. Delapan cue audio original disintesis lokal khusus presentasi.
- Refresh token bersama, pembatasan tindakan ganda, sinkronisasi saat kembali fokus, timeout RPC yang tetap diperiksa server, serta perbaikan status hasil/rematch.
- Setup/build Editor idempoten dan mempertahankan pekerjaan scene, pemeriksaan shader/input, scripts batch dengan exit code eksplisit dan laporan unik per invocation.
- 16 tes Node lulus, termasuk seluruh regresi SQL 29.0 dan enam GLB; 66 protokol + 40 tindakan + 2.506 geometri/catalog/path assertion C# lulus. Sintaks seluruh C# diperiksa untuk Editor/Windows dan Android.
- Backend dan aturan Zero Dice/Last Player Standing tetap dari 29.0. Tidak ada migrasi baru atau sistem Pendant/Artifact.

Compile penuh Unity, Play Mode, visual shader/UI, dan build perangkat masih belum diverifikasi karena Unity Editor tidak tersedia. Versi source 30.0 bukan klaim APK/EXE produksi siap.

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

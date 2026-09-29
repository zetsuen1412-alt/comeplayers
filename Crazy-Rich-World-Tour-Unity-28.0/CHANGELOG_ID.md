# Changelog

## 30.0 — Hotfix layar magenta (30 September 2026)

- Memperbaiki shader `UI/Default` yang terbuang saat build karena seluruh Canvas, panel, teks UI, gambar dan Starwheel dibuat saat runtime. Setup mengambil shader dari material UI bawaan dan menyertakannya dalam Always Included.
- Menambahkan pemeriksaan retensi shader untuk Verify dan setiap build, termasuk Build Profiles. Marker perbaikan terpisah agar pembaruan tidak mereset pengaturan Player yang sudah ada.
- Mereproduksi magenta pada EXE lama, lalu memeriksa login, lobby dan papan/HUD demo offline pada EXE baru. Bukti tangkapan jendela dan laporan ada di `QA/30.0/ui-fix/`.
- Verify, build Windows, dan build Android ARM64 lulus. Paket baru memakai akhiran `UI-Fix`; APK tetap debug-signed dan belum diuji pada HP. Tidak ada perubahan backend, RNG, atau aturan pertandingan.

## 30.0 — Chibi World (29 September 2026)

- Menggabungkan perbaikan fondasi 29.1: 32 posisi tile unik, kontrol lelang untuk semua peserta eligible, pilihan kota/resort, seluruh distrik Festival, pemilihan aset likuidasi, kartu/target, dan konfirmasi aksi yang mengakhiri partisipasi.
- HUD ringkas dengan drawer pemain dan sheet sementara, safe area, inspeksi tile dengan tap, kontrol kamera mouse/touch.
- Integrasi enam GLB beranimasi lewat glTFast 6.14.1; fallback chibi, transisi animasi, reduced motion, cleanup import async, dan reaksi ZERO tanpa mengubah posisi pion.
- Siluet properti House/Tower/Hotel/Landmark, animasi upgrade, plaza World Tour, ring pemilik/giliran/Festival, warna distrik dan label kota.
- Portrait Alexia/Rindi dan ilustrasi lobby original, digunakan langsung melalui Resources. Delapan cue audio original disintesis lokal khusus presentasi.
- Refresh token bersama, pembatasan tindakan ganda, sinkronisasi saat kembali fokus, timeout RPC yang tetap diperiksa server, serta perbaikan status hasil/rematch.
- Setup/build Editor idempoten dan mempertahankan pekerjaan scene, pemeriksaan shader/input, scripts batch dengan exit code eksplisit dan laporan unik per invocation.
- Batch build memeriksa versi Editor sebelum membuka proyek, menolak patch yang berbeda, dan menghindari perpindahan GameObject ke scene yang sama pada setup.
- Kondisi lisensi Editor tidak aktif dilaporkan sebagai `license_required` dengan instruksi aktivasi Hub; exit script tetap gagal sampai lisensi tersedia.
- Runner Play Mode khusus Editor untuk snapshot fixture, GLB/shader, ZERO stationary, lima langkah, UI dan cleanup; telah lulus pada Unity 6000.0.84f1 dengan laporan JSON dan render PNG.
- Memperbaiki setup pertama pada scene startup kosong dan mempertahankan pekerjaan scene pengguna. Empat scene Unity, ProjectSettings, serta lockfile paket dari setup terverifikasi sekarang disertakan.
- Ukuran teks papan dibatasi berdasarkan geometri font agar nama kota, nomor, simbol, dan judul tidak saling bertumpuk; render hasil perbaikan diperiksa dan Play Mode diulang.
- Papan dan karakter fallback memakai clone material Standard opaque yang disertakan melalui Resources. Menghapus penyertaan seluruh varian Standard yang membuat build Android mengompilasi puluhan ribu kombinasi tak terpakai; shader glTF tetap disertakan. Validasi Editor dan Play Mode diulang setelah perubahan.
- 16 tes Node lulus, termasuk seluruh regresi SQL 29.0 dan enam GLB; 66 protokol + 40 tindakan + 2.506 geometri/catalog/path assertion C# lulus. Sintaks seluruh C# diperiksa untuk Editor/Windows dan Android.
- Backend dan aturan Zero Dice/Last Player Standing tetap dari 29.0. Tidak ada migrasi baru atau sistem Pendant/Artifact.

Lanjutan 30 September: lisensi Personal aktif; kompilasi/import Editor, Verify, Play Mode, build Windows, dan APK Android ARM64/IL2CPP lulus. Enam GLB benar-benar dimuat, keenam state dadu teramati, ZERO tidak bergerak, 0+5 berjalan tepat lima tile, dan snapshot duplikat tidak mengulang. Uji multiplayer end-to-end dan perangkat Android fisik masih diperlukan sebelum rilis produksi. Hasil build dan paket uji dicatat di QA 30.0.

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

# Keyboard chat dan notifikasi — 29 September 2026

Cabang sumber: `codex/chat-keyboard-notifications`. Kandidat Android **0.16.3** (runtime **0.16.3**) dan Windows **1.0.1.0**. Source perbaikan tersimpan pada commit `5cd550491557c97e0e57ca301c74c1538b2cb327` dan PR #31. Laporan ini membedakan hasil build, penerapan website, dan ketersediaan di Store.

## Perubahan yang diperiksa

- Composer mengikuti area keyboard yang benar pada chat pribadi dan grup. Perhitungan memperhitungkan `adjustResize`, keyboard yang sudah terbuka, dan perubahan ukuran. Pesan terbaru tetap terlihat saat pengguna berada di bagian terbaru; membaca riwayat tidak dipaksa melompat ke bawah. Draf lanjutan tidak dihapus ketika pengiriman sebelumnya selesai.
- Android memiliki izin notifikasi opsional, registrasi perangkat berdasarkan akun, pembersihan saat keluar, suara pesan, dan nada panggilan. Menerima notifikasi tidak memindahkan chat; mengetuknya membuka room/channel yang sesuai dengan akun aktif.
- Web dan Windows memakai pusat notifikasi akun yang berlaku di seluruh halaman. Pesan berulang/riwayat tidak membunyikan ulang notifikasi. Panggilan menyediakan jawab, tolak, dan senyapkan; nada berhenti setelah status berubah atau berakhir.
- Pengiriman backend menghormati pengaturan akun, chat dibisukan, serta preferensi channel. Error pembacaan preferensi menahan pengiriman. Panggilan diperiksa kembali sebelum dikirim agar status batal, dijawab, atau kedaluwarsa tidak memicu nada baru; token perangkat yang tidak terdaftar dinonaktifkan hanya untuk perangkat terkait.
- Tabel `notifications` ditambahkan ke publikasi Realtime Supabase dengan RLS SELECT milik pengguna tetap dipertahankan. Flag worker notifikasi pada konfigurasi Vercel bersama Preview/Production dinonaktifkan; pengiriman memakai pekerjaan `after` setelah pesan tersimpan, tanpa menunggu worker antrean.

## Hasil validasi

| Area | Bukti selesai |
| --- | --- |
| Mobile | 25 pengujian perilaku keyboard/notifikasi lulus; TypeScript lulus. Mencakup posisi gulir, perubahan keyboard, payload akun/channel, izin opsional, pergantian akun, token refresh, dan penghentian ringtone. |
| Web | 20 pengujian perilaku terfokus lulus; TypeScript penuh dan ESLint pada perubahan lulus. Browser menunjukkan ajakan login yang ramah pada halaman notifikasi saat belum masuk. |
| Backend | 16 pengujian push dan 2 pengujian `messagesWorkerV32` lulus. Mencakup penyaringan penerima, preferensi/mute, token invalid, serta status dan sisa masa berlaku panggilan. |
| Windows | `cargo test --lib --locked`: 6 lulus. TypeScript, Vite production build, kompilasi Rust release, dan validasi paket MakeAppx lulus. |

Pemeriksaan komponen memakai fixture/mocks; hasil tersebut bukan bukti notifikasi sudah diterima pada perangkat fisik atau panggilan dua perangkat berhasil.

## Paket Windows

Paket dibangun ulang sesudah perubahan native terakhir. Manifest menggunakan `ComePlayers.ComePlayers`, versi `1.0.1.0`, arsitektur x64. EXE berversi `1.0.1`; SHA256 EXE di dalam MSIX sama dengan hasil kompilasi release.

- MSIX (7.023.077 byte): `C:\Users\kafka\.codex\worktrees\chat-keyboard-notifications\Comeplayers-new\comeplayers-apps\apps\desktop\store-package\output\ComePlayers_1.0.1_x64.msix`
- SHA256 MSIX: `08006EF0A528345CF72B35F6CFB51DF6E57FE9B8DE69928E0C4408BDBD161757`
- SHA256 EXE: `CC3126823199D903CC9CDCAE7767D77E06A5565668C6E6F042A1A823F3289E82`
- Bukti lokal: `comeplayers-apps/apps/desktop/store-package/output/verification-1.0.1.json`.
- Waktu verifikasi paket: `2026-09-29T16:33:04Z`.

MSIX ini belum ditandatangani, khusus pengajuan Partner Center; bukan installer untuk dibagikan langsung. Pengajuan Microsoft Store 1.0.0 yang sebelumnya berstatus **In certification** tidak dibatalkan atau diganti. Paket 1.0.1 belum diunggah dalam pekerjaan validasi ini.

## Batas validasi dan perilaku

- Belum ada pengujian keyboard Android, push nyata, atau notifikasi layar terkunci pada perangkat fisik. Tidak ada perangkat ADB tersambung atau AVD siap saat pemeriksaan.
- Nada panggilan berulang berlaku ketika aplikasi Android aktif. Saat aplikasi berada di background, Android memakai bunyi notifikasi panggilan sekitar **4 detik**; belum ada dering panggilan kontinu melalui Android Telecom atau iOS CallKit.
- Web/Windows memerlukan aplikasi atau browser tetap berjalan, termasuk diminimalkan. Belum tersedia Web Push untuk browser tertutup atau layanan push Windows ketika proses aplikasi ditutup.
- Notifikasi tetap mengikuti izin sistem, mode senyap/Do Not Disturb, pengaturan baterai, serta pilihan pengguna. Kompilasi tidak membuktikan suara/toast Windows pada paket terpasang.
- Sebelum mengklaim kesiapan perangkat: uji dua akun pada perangkat nyata, buka keyboard pada chat pribadi/grup, coba notifikasi saat aktif/diminimalkan/layar terkunci, lalu jawab/tolak panggilan dan pastikan nada berhenti. Ulangi dengan chat dibisukan, izin ditolak, dan akun berganti.

## Penerapan

| Tujuan | Status pada laporan ini |
| --- | --- |
| Vercel website | Aktif: `dpl_FKFBJVjwkU4GqmKfhA2eVjVjPsej` (`evo-gaming-p4jor8we2-ilham-evogaming-s-projects.vercel.app`). Dipromosikan 29 September 2026; lookup `www.comeplayers.com` mengembalikan ID tersebut. `/notifications` HTTP 200, API tanpa login 401/no-store, login akun dan daftar notifikasi berhasil, console browser tanpa error/warning. |
| Android 0.16.3 | EAS `4fe14e90-9e7a-4805-9bf4-d24683c3dfc4`, versionCode **31**, masih dalam antrean. Arsip 133 file/4,25 MB terverifikasi berisi Firebase klien dan kedua WAV tanpa private key. EAS dibuat dari working tree sebelum commit; metadata commit EAS menunjukkan base `c2819d71`, sementara arsip memuat source perubahan yang kemudian dicommit sebagai `5cd5504`. Draf internal release5 berisi catatan 0.16.3; Play aktif masih 0.16.2/build 29 sampai AAB baru selesai diunggah dan diterbitkan. |
| Microsoft Store 1.0.1.0 | MSIX lokal terverifikasi; belum diajukan. Sesi Partner Center meminta login kembali. Pengguna memilih fokus Android/website dahulu; pengajuan 1.0.0 tidak disentuh. |

Jangan menyamakan perubahan source, build selesai, atau upload dengan rilis yang sudah tersedia di Store.

Kendala antrean: halaman resmi https://expo.dev/eas-build-status pada pemeriksaan sekitar 30 September 2026 pukul 00.00 WIB menampilkan antrean Android Free tier sekitar 76,4 menit (2.208 build antre). Ini statistik layanan, bukan ETA build tertentu. Build 31 tetap IN_QUEUE tanpa error saat pemeriksaan terakhir. Tidak ada upgrade paket berbayar yang dilakukan.

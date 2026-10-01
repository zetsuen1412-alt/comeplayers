# ComePlayers 0.16.0 — chat lebih mudah

Status: **diterbitkan ke Google Play internal testing**, 28 September 2026 pukul 10.17 Asia/Bangkok. Play Console mengonfirmasi **Available to internal testers** untuk rilis `0.16.0 - Chat lebih mudah`, versionCode `24`.

## Perubahan bagi pengguna

- Akun baru langsung menyiapkan chat setelah login tanpa membuat passkey atau memasukkan kode pemulihan.
- Masuk dengan Google menjadi tindakan utama; formulir email dibuka saat dipilih. Masuk, daftar dan lupa sandi memakai bahasa Indonesia.
- Chat, kontak, percakapan pribadi, grup dan komunitas memakai bahasa yang sederhana, tombol lebih besar, dan ukuran teks yang lebih mudah dibaca.
- Daftar komunitas menampilkan grup serta ruang suara. Tombol Chat baru langsung membuka pemilihan kontak.
- Penjelasan teknis tidak lagi menjadi banner tetap di percakapan. Rincian masalah tetap tersedia jika diperlukan.
- Kegagalan koneksi saat menyiapkan chat dicoba kembali secara terbatas, termasuk ketika aplikasi kembali aktif. Identitas akun dan riwayat tidak diganti.
- Cadangan tetap opsional. Pemulihan akun lama di perangkat baru mempertahankan metode yang sebelumnya disimpan.

## Perbaikan distribusi

Screenshot pengguna sesuai dengan tampilan yang tertanam pada AAB 0.15.0 (22). Kode lama mengunduh OTA secara diam-diam tetapi seluruh pemanggil memakai jalur tanpa reload; pemeriksaan native saat startup juga dinonaktifkan. Pemeriksaan endpoint OTA saja tidak membuktikan versi baru telah berjalan pada ponsel.

Versi ini memasukkan perubahan langsung ke AAB baru. Pemeriksaan native pada startup diaktifkan dengan batas tunggu 2 detik. Unduhan OTA yang selesai menampilkan tindakan Terapkan dan meminta konfirmasi sebelum membuka ulang aplikasi. Pembaruan biner menggunakan alur foreground dengan persetujuan Google; tidak ada penyelesaian unduhan latar belakang yang diam-diam memulai ulang aplikasi.

## Identitas paket final

- Sumber: `11b355073c1066cf495ab86f7f84aae561cda07d`.
- Package: `com.comeplayers.app`.
- Versi / versionCode / runtime Android: `0.16.0` / `24` / `0.16.0`.
- Proyek EAS: `a663aa70-99b7-4c8f-93ea-5f8637baa2df`, owner `comeplayers`.
- Build EAS: `b8b4561e-a292-4c02-8e3b-f042c113868d`.
- Status EAS: `FINISHED`; kompilasi native Gradle berhasil (7 menit 49 detik).
- AAB: `comeplayers-0.16.0-24.aab`, 86.044.640 byte.
- SHA-256 AAB: `e0bdd02dfa4fcc4a5b1e6b884ddf566a3918d668541c5ec25234de11d168c4f0`.
- SHA-256 sertifikat upload: `0a75bc67bf7e34ba4e80a1dbb40cd9b8a3e91c6cb2204a742b5493512bd48cf2`, sesuai sertifikat rilis sebelumnya.
- Channel / profile: `production` / `production`.
- Sumber berasal dari arsip Git subtree `comeplayers-apps`; file environment, credential, generated native dan node_modules tidak ikut diunggah. Variabel produksi diambil dari EAS dengan dotenv lokal dinonaktifkan. Kunci signing lama digunakan dengan `--freeze-credentials`.

## Pemeriksaan yang selesai

- 42 pengujian komponen/perilaku: login, chat langsung, pemulihan yang diperlukan, koneksi terputus, retry, dan penerapan update. Mobile TypeScript lulus.
- GitHub source checks, build web, SQL policy, serta real-browser recovery lulus pada sumber final. Pemeriksaan EAS read access di GitHub tetap gagal karena secret `EXPO_TOKEN` belum tersedia; pemeriksaan tidak dinonaktifkan. Build lokal memakai sesi EAS pemilik yang sudah terautentikasi.
- Pemeriksaan visual komponen React Native Web pada lebar 320 piksel dan simulasi teks 130%: daftar chat, pilih kontak, ketik/kirim pesan, percakapan grup, dan komunitas. Akun, jaringan, panggilan dan media native memakai data contoh pada pemeriksaan visual ini.
- Uji API produksi menggunakan dua akun sementara: pendaftaran chat tanpa passkey, kirim/ambil/dekripsi pesan, cadangan sandi, dan pemulihan perangkat dengan identitas yang sama berhasil. Seluruh akun serta room uji dibersihkan; pemeriksaan independen menemukan nol akun uji tersisa. Tidak ada email atau push dikirim.
- Tidak ada migrasi database, reset identitas atau perubahan kebijakan pemulihan pada pembaruan ini.
- AAB final lulus `bundletool validate` dan verifikasi JAR; manifest menyatakan versi 0.16.0 (24), runtime 0.16.0, pemeriksaan update `ALWAYS` dan batas tunggu 2000 ms. Empat penanda UI baru terdapat pada bundle; teks layar passkey wajib lama serta penanda fixture QA tidak ditemukan.
- Semua 38 pustaka ARM64/x86_64 memenuhi pemeriksaan segmen LOAD 16 KB. Sebanyak 32 pustaka masih memiliki akhir RELRO yang tidak sejajar; ini bukan bukti pengujian perangkat 16 KB. Peringatan sertifikat self-signed, tanpa timestamp dan ZIP streaming sama dengan paket sebelumnya; verifikasi JAR selesai dengan `jar verified`.
- Startup native Android API 35 x86_64 lulus memakai APK QA yang dihasilkan dari AAB final yang sama: versi 0.16.0 (24) terpasang, cold launch 3.926 ms, React Native main berjalan, proses tetap aktif sekitar 57 detik, tanpa fatal exception dan crash buffer kosong. Emulator tidak memakai akun pengguna; DNS EAS dan layanan Play tidak tersedia sehingga pemeriksaan ini tidak membuktikan login Google, pembaruan Play, OTA, panggilan, atau pengiriman chat pada perangkat fisik.

## Penerbitan Google Play

- Track: internal testing `4701728206334114354`, rilis `2`; menggantikan 0.15.0 (22).
- Paket baru diterima Google Play tanpa error yang menghalangi publikasi. Satu peringatan tentang file deobfuscation yang tidak dilampirkan tetap dicatat; dukungan perangkat tidak berkurang.
- Status sesudah tindakan Save and publish: **Active**, **Latest release: 0.16.0 - Chat lebih mudah**, **Available to internal testers**, versionCode **24**, **Not reviewed**.
- [Halaman rilis Play Console](https://play.google.com/console/u/0/developers/9004480529879991776/app/4975767315042034162/tracks/4701728206334114354/releases/2/details).
- [Tautan instalasi/pembaruan tester](https://play.google.com/apps/internaltest/4701728206334114354). Gunakan akun Google yang terdaftar sebagai tester, lalu pilih **Perbarui** pada Play Store. Tidak perlu mencopot aplikasi atau menghapus datanya.
- Google menyatakan perubahan biasanya muncul dalam satu jam, terkadang lebih lama. Bukti publikasi lokal: `tmp/comeplayers-0.16.0-24-play-published.png`; audit paket dan startup tersimpan di folder `tmp` yang sama.

## Batas rilis

Distribusi yang selesai adalah jalur internal Google Play yang sudah digunakan pemilik dan tester. Pengajuan production publik tetap bergantung pada setup, review, serta persyaratan closed testing Google Play yang dicatat pada RELEASE-2026-09-27.md. Play masih menampilkan nama sementara `com.comeplayers.app (unreviewed)` sampai setup dan review selesai; pembaruan ini tidak mengklaim bahwa listing publik atau logo telah disetujui. Login Google dengan sertifikat Play, pemasangan di ponsel pengguna, dan fungsi perangkat fisik tetap memerlukan pemeriksaan pada perangkat.

# Kesiapan Google Play — ComePlayers 0.15.0

Status per 27 September 2026: sumber kandidat rilis siap ditinjau; **belum ada AAB 0.15.0 yang dibangun, diunggah, atau diterbitkan**. Catatan ini memperbarui status persiapan 24 September, bukan bukti persetujuan Google.

## Kandidat rilis

| Bagian | Hasil |
| --- | --- |
| Commit sumber aplikasi | `a9189cc5d1a438af39798cf341b5b120a0cdb067` |
| Branch | `codex/google-play-release` |
| Dasar perubahan komunitas | PR #29, commit `c2d11480838e6fcd4f3707c58f8714ad4fa96907` |
| Package | `com.comeplayers.app` |
| Versi / runtime Android | `0.15.0` / `0.15.0` |
| Nomor build | Sumber 22; EAS remote terakhir 21. Nomor final harus dicatat dari build yang benar-benar selesai karena auto-increment memakai EAS remote. |
| Proyek EAS | `comeplayers/comeplayers`, `a663aa70-99b7-4c8f-93ea-5f8637baa2df` |
| Profil build | `production`, Android App Bundle, environment dan channel `production` |
| Tujuan submit yang sudah dikonfigurasi | `internal`; ini bukan publikasi production di Google Play |

Expo diperbarui ke patch yang direkomendasikan untuk SDK 57. Plugin native sharing dan SQLite ikut didaftarkan. Runtime dinaikkan agar perubahan native tidak dikirim sebagai OTA ke instalasi 0.14.0. Pemeriksa signing kini menangani baris CRLF Windows tanpa mengganti sertifikat yang diwajibkan.

## Pemeriksaan yang selesai

- Typecheck seluruh workspace aplikasi lulus.
- Expo Doctor: 21 dari 21 pemeriksaan lulus.
- Regresi aplikasi: 45 tes lulus.
- Preflight rilis dan signing: 20 lulus, 10 tes JVM dilewati karena Gradle pengujian tidak diaktifkan.
- Akses baca akun dan proyek EAS yang sudah ada terverifikasi; kunci baru tidak dibuat.
- Lima konfigurasi klien publik disimpan pada environment EAS production: URL API, URL website, URL Supabase, anon/publishable key Supabase, dan Google web client ID. Service-role key dan kredensial TURN tidak disalin.
- Arsip sumber EAS berhasil diperiksa: 193 file; tidak menyertakan `.env`, file credential/signing, folder native hasil generate, atau artefak biner privat.
- `.easignore` kini mengecualikan varian file environment dan direktori credential secara eksplisit.
- Play Console dapat dibuka. Form ComePlayers berbahasa Indonesia, tipe App, gratis, telah diisi; pemeriksaan package menyatakan tersedia. Aplikasi belum dibuat karena deklarasi wajib belum disetujui.

Hasil di atas tidak menggantikan build native, pemeriksaan AAB, atau pengujian instalasi dari Google Play. Audit dependensi aplikasi juga masih memiliki temuan moderat; jangan menyatakan aplikasi bebas kerentanan.

## Persetujuan yang masih ditunggu

1. Persetujuan khusus untuk mengunggah kode privat ke proyek Expo EAS yang sudah ada dan membuat AAB dengan signing yang sudah ada. Peninjauan otomatis menolak permintaan build sebelum eksekusi; tidak ada build ID baru.
2. Persetujuan pemilik atas Developer Program Policies, Play App Signing Terms of Service, dan deklarasi ekspor AS pada form Play Console. Checkbox belum dipilih dan tombol Create app belum ditekan.
3. Persetujuan terpisah untuk merge PR #29 dan merilis website. Peninjauan otomatis menolak merge karena permintaan publikasi Google Play tidak dianggap mencakup rilis website. Production website tetap pada commit sebelumnya.

Persetujuan tersebut tidak berarti migrasi database production atau perubahan pengaturan sesi telah diizinkan.

## Langkah berikutnya setelah persetujuan

1. Bangun AAB dengan EAS CLI 24.5.0 dari commit kandidat yang tercatat, menggunakan profil `production` dan proyek yang sudah ada. Gunakan arsip bersih dari file Git yang terlacak agar junction lokal Windows dan kredensial lokal tidak ikut dikirim.
2. Catat build ID, commit, runtime, versionCode, SHA-256 AAB, dan sertifikat upload. Cocokkan sertifikat dengan identitas release yang sudah diwajibkan repo. Periksa manifest final, target API, permission, dan kompatibilitas 16 KB; konfigurasi sumber belum membuktikan hasil biner.
3. Selesaikan pembuatan aplikasi di Play Console sesudah persetujuan deklarasi. Atur Play App Signing; cocokkan fingerprint sertifikat Play dengan OAuth Android dan Digital Asset Links sebelum menguji login dari Play.
4. Isi listing dari `listing-id-ID.json`; gunakan screenshot asli kandidat AAB final. Lengkapi feature graphic, email support yang dipantau, reviewer test account, Data safety, content rating, target usia, iklan, negara distribusi, penghapusan akun, dan penilaian alur pembayaran. Catatan 24 September merinci bagian yang belum diverifikasi.
5. Upload **AAB terverifikasi yang dipilih secara eksplisit** ke internal testing. Jika memakai EAS Submit, pastikan service account Play sudah tersimpan di EAS dan pilih `--id <BUILD_ID_TERVERIFIKASI>`; jangan memilih build lama melalui `--latest`.
6. Uji instalasi dari Google Play, login, komunitas live, pesan/panggilan, upload, report/block, pembayaran yang diizinkan, logout, serta penghapusan akun uji. Periksa pre-launch report dan persyaratan testing yang benar-benar tampil untuk akun ini.
7. Kirim production untuk review Google setelah seluruh persyaratan terpenuhi. Status internal testing atau pengiriman untuk review tidak boleh dilaporkan sebagai sudah tayang publik.

## Bukti lokal

Log tidak dimasukkan ke Git karena merupakan hasil mesin lokal:

- `tmp/community-mobile-doctor-after.log`
- `tmp/community-android-release-typecheck.log`
- `tmp/community-mobile-regression-tests.log`
- `tmp/community-android-release-preflight-tests.log`
- `tmp/google-play-create-app.png`

Draf catatan rilis Indonesia: `release-notes-id-ID.txt`. Draf listing: `listing-id-ID.json`.

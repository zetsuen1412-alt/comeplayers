# Persiapan Google Play ComePlayers

Status: persiapan lokal, belum diunggah atau diterbitkan. Pemilik menyatakan belum memiliki akun Play Console dan ingin menerbitkan atas nama perusahaan/usaha resmi.

## Akun organisasi

1. Daftar melalui https://play.google.com/console/signup menggunakan akun Google yang dikelola perusahaan.
2. Pilih **Organisasi**. Siapkan nama dan alamat legal perusahaan yang cocok dengan data D-U-N-S, nomor D-U-N-S, website, nomor telepon, serta email kontak yang aktif.
3. Selesaikan pembayaran pendaftaran satu kali **US$25**, persetujuan perjanjian, dan verifikasi yang diminta langsung di Google. Pendaftaran belum dilakukan dari tugas ini.
4. Setelah akun siap, buat aplikasi ComePlayers. Identitas Android tetap `com.comeplayers.app`.

Persyaratan pengujian 12 tester selama 14 hari berlaku untuk akun pribadi baru; jangan menganggapnya sebagai persyaratan umum akun organisasi. Tetap lakukan pengujian internal dan ikuti tugas yang muncul di Console.

## Hasil pemeriksaan lokal

| Bagian | Temuan |
| --- | --- |
| Sumber awal | `0457c92c059dbc430e80e9187dfe82554e33a39a` dari `main` |
| Aplikasi | Expo/React Native native, versi sumber `0.14.0` |
| Android package | `com.comeplayers.app` |
| Proyek EAS | `comeplayers/comeplayers`, ID `a663aa70-99b7-4c8f-93ea-5f8637baa2df` |
| Build production | `eas.json` sudah memakai `app-bundle`, channel dan environment `production` |
| Penomoran build | Sumber versionCode 15, tetapi EAS memakai versi remote dan auto-increment; kode ini bukan bukti nomor rilis berikutnya |
| Rilis unduhan website | Konfigurasi mencatat `0.14.0 (21)`; belum memverifikasi file APK tersebut pada sesi ini |
| TypeScript | Pemeriksaan mobile lulus sebelum dan sesudah perubahan menu privasi |
| Preflight konfigurasi | `recovery-release-preflight.mjs static` lulus; belum memverifikasi akses EAS, signing remote, atau AAB final |
| Penghapusan akun | Ditambahkan Settings > Delete account menuju halaman website yang sudah memiliki alur permintaan penghapusan |
| Draf listing | `listing-id-ID.json`, perlu ditinjau terhadap hasil pengujian AAB final |
| Batas teks listing | Nama 11/30, deskripsi singkat 73/80, deskripsi panjang 957/4000 karakter |
| URL publik | Privacy, account/privacy, dan support mengembalikan HTTP 200; halaman account/privacy memuat teks penghapusan akun |

## Langkah teknis sebelum upload

- Verifikasi akses ke proyek EAS yang sudah ada; gunakan credential signing asli. Jangan membuat proyek atau keystore pengganti.
- Ambil versionCode berikutnya dari EAS. Jangan menggunakan AAB lama `0.7.0` yang masih ada di folder release lokal.
- Build AAB production dari sumber yang sudah diuji. Pemeriksaan konfigurasi saja tidak membuktikan AAB bisa dibangun atau berjalan.
- Verifikasi manifest AAB menargetkan **API 36 atau lebih tinggi**, permission final, dan kompatibilitas native termasuk perangkat dengan ukuran halaman memori 16 KB. Nilai manifest belum diperiksa dalam sesi ini.
- Atur Play App Signing secara sadar: sertifikat yang dipakai Google untuk APK terpasang dapat berbeda dari upload key. Tambahkan fingerprint sertifikat Play pada konfigurasi Android OAuth Google Sign-In dan Digital Asset Links/passkey yang sesuai; pertahankan asosiasi APK distribusi website bila masih digunakan.
- Uji pemasangan dari internal track, login Google/email, chat, panggilan, blokir/laporan, unggahan, pemulihan, logout, dan tautan penghapusan akun. Uji penghapusan hanya memakai akun uji khusus.
- URL publik berhasil diperiksa melalui HTTP GET tanpa login. Tetap uji alur login dan permintaan penghapusan dengan akun uji; HTTP 200 tidak membuktikan permintaan sampai diproses atau data sudah dihapus.

## Hal yang perlu diselesaikan sebelum review Google

**Pembayaran:** aplikasi saat ini menyediakan CPWallet, DOKU/QRIS, kartu, transfer bank, dan PayPal. Belum ada penetapan bahwa semua transaksi sesuai kebijakan Play. Petakan produk dan lokasi konsumsinya: fitur atau barang digital yang diakses dalam aplikasi yang didistribusikan Play biasanya memerlukan Play Billing atau program pengecualian yang sesuai. Produk yang hanya dikonsumsi di luar aplikasi yang didistribusikan Play dapat berbeda perlakuannya. Tautan checkout eksternal bukan pengecualian otomatis. Tinjau juga penggunaan saldo dan turnamen sebelum menyatakan patuh.

**Data safety:** isi berdasarkan aliran data nyata untuk akun, profil, pesan, panggilan, foto/video/dokumen, transaksi, Google Drive opsional, dan penyedia layanan. Konfigurasi sumber belum merupakan audit backend atau bukti bahwa semua pesan terenkripsi end-to-end. Jangan menyatakan tidak mengumpulkan data atau enkripsi menyeluruh tanpa bukti.

**Konten dan akses reviewer:** tentukan kategori aplikasi, negara distribusi, target usia, rating konten, deklarasi iklan, deklarasi fitur keuangan jika relevan, dan akses reviewer dengan akun uji. Periksa report/block pada setiap jenis konten komunitas yang aktif, bukan hanya satu layar chat.

**Materi visual:** siapkan icon 512 × 512, feature graphic 1024 × 500, dan screenshot asli AAB final. Asset aplikasi tersedia di `apps/mobile/assets`, tetapi paket gambar listing belum dibuat. Hindari menggunakan screenshot APK lama sebagai bukti versi final.

## Urutan penerbitan setelah akun tersedia

1. Lengkapi listing dan App content berdasarkan data yang terverifikasi.
2. Build dan periksa AAB final; catat build ID, sumber commit, versionCode, dan hash.
3. Upload AAB yang dipilih secara eksplisit ke internal testing lewat Play Console, atau konfigurasi service account EAS dengan izin yang diperlukan. Kredensial disimpan di pengelola credential, bukan di repository atau chat.
4. Uji hasil instalasi dari Google Play dan perbaiki temuan pre-launch report.
5. Kirim rilis production untuk review Google setelah persyaratan selesai. Persetujuan dan waktu tayang ditentukan Google.

Perintah build yang sudah tersedia: `npm run android:aab` dari folder `comeplayers-apps`. Script tersebut menghapus folder native hasil generate sebelum build; periksa perubahan lokal native terlebih dahulu. Script submit yang ada memakai internal track; `--latest` dapat memilih build yang tidak dimaksud, jadi pilih build final berdasarkan ID pada saat pengiriman.

## Referensi resmi yang diperiksa 24 September 2026

- Pendaftaran dan biaya: https://support.google.com/googleplay/android-developer/answer/6112435?hl=id
- Jenis akun: https://support.google.com/googleplay/android-developer/answer/13634885?hl=id
- Informasi organisasi dan D-U-N-S: https://support.google.com/googleplay/android-developer/answer/13628312?hl=id
- Target API: https://support.google.com/googleplay/android-developer/answer/11926878?hl=en
- Pengujian akun pribadi baru: https://support.google.com/googleplay/android-developer/answer/14151465?hl=en-GB
- Penghapusan akun: https://support.google.com/googleplay/android-developer/answer/13327111?hl=en
- Pembayaran: https://support.google.com/googleplay/android-developer/answer/9858738?hl=en
- Penjelasan pembayaran: https://support.google.com/googleplay/android-developer/answer/10281818?hl=en
- Asset listing: https://support.google.com/googleplay/android-developer/answer/9866151?hl=en-GB
- EAS Submit Android: https://docs.expo.dev/submit/android/
- Kompatibilitas 16 KB: https://developer.android.com/guide/practices/page-sizes
- Google Sign-In: https://developer.android.com/identity/sign-in/credential-manager-siwg
- Digital Asset Links: https://developers.google.com/digital-asset-links/v1/getting-started

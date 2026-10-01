# ComePlayers 0.16.2 — percakapan terbaru dan panggilan

Status: **diterbitkan ke Google Play internal testing**, 29 September 2026 pukul 12.46 Asia/Bangkok. Play Console mengonfirmasi **Available to internal testers** untuk rilis `0.16.2 - Chat dan panggilan terbaru`, versionCode `29`.

## Perubahan

- Daftar percakapan menempatkan aktivitas paling baru di atas, dari kontak mana pun. Pesan dan perubahan status panggilan suara/video memakai waktu dari server yang sama; pin tidak mengalahkan aktivitas yang lebih baru.
- Pratinjau panggilan ditampilkan dengan bahasa sederhana. Pembaruan aktivitas panggilan tidak memunculkan notifikasi pesan yang keliru.
- Koneksi media panggilan Android tidak lagi diputus ketika tampilan panggilan dibuka. Web mempertahankan panggilan yang sudah diterima saat sambungan media lokal sementara gagal, lalu menyediakan coba lagi.
- Website memperbarui urutan inbox melalui Realtime, dengan pemeriksaan berkala jika sambungan Realtime terputus. Percakapan yang sedang dibuka tetap dipilih.

## Distribusi dan verifikasi

- Sumber aplikasi: `d6f06e4054c7c753b6c9886d6610b19bff683811` pada cabang `codex/google-play-release`.
- Website: Vercel production `dpl_6kyAH5bsTSLEaULskDwak3AaeCAC`, aktif di `www.comeplayers.com` dan `comeplayers.com`. Tiga ruang lama diselaraskan dengan panggilan terbarunya; pemeriksaan sesudahnya menunjukkan tidak ada panggilan yang lebih baru daripada waktu inbox.
- Pembaruan Android untuk pengguna runtime `0.16.1`: EAS Update `01a0eba3-507b-76e6-9f06-2e46b1a69de8`, grup `8ac765c3-cd2e-43c2-be05-bcf99ec94f62`, channel `production`.
- Build EAS Android production: `48c00720-2c9c-4c0f-b782-c15fca33c9a4`, status `FINISHED`; paket `com.comeplayers.app`, versi `0.16.2`, versionCode `29`.
- AAB final: `comeplayers-0.16.2-29.aab`, 86.495.107 byte, SHA-256 `2bbd90e5d6df878a06e256a6af9d1169b0502c0aa225b9c61346e00391c57d4e`.
- `bundletool validate` dan `jarsigner -verify` lulus. Sertifikat upload SHA-256 `0a75bc67bf7e34ba4e80a1dbb40cd9b8a3e91c6cb2204a742b5493512bd48cf2` sama dengan rilis sebelumnya. Manifest final menyatakan target SDK 36.
- 754 pengujian website dan build Next.js lulus. 84 pengujian aplikasi dan typecheck mobile lulus. Tampilan web produksi pada akun yang sudah masuk memperlihatkan percakapan dengan panggilan terbaru di paling atas dan pratinjau "Panggilan video berakhir".

## Google Play

- Track internal testing `4701728206334114354`, rilis `4`; versi 0.16.1 (26) menjadi tidak aktif.
- Rilis aktif dan tersedia bagi tester internal pada [halaman detail Play Console](https://play.google.com/console/u/0/developers/9004480529879991776/app/4975767315042034162/tracks/4701728206334114354/releases/4/details). Play Console menunjukkan dukungan 18.729 perangkat, tanpa perangkat yang kehilangan dukungan dibanding versi sebelumnya.
- [Tautan instalasi atau pembaruan tester](https://play.google.com/apps/internaltest/4701728206334114354). Pembaruan di perangkat dapat muncul dalam satu jam, kadang lebih lama menurut Play Console.
- Satu peringatan deobfuscation file tercatat; tidak ada error yang menghalangi publikasi. Listing Play masih menampilkan nama sementara `com.comeplayers.app (unreviewed)` sampai setup dan review selesai.

Pengujian dua perangkat fisik untuk panggilan suara/video masih diperlukan. Pemeriksaan otomatis dan validasi AAB tidak membuktikan kualitas jaringan telepon pada setiap perangkat.

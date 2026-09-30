# Materi pengajuan Microsoft Store — ComePlayers untuk Windows

Draft untuk paket MSIX desktop. Teks berikut menggambarkan fitur yang ada pada aplikasi dan website saat ini; ambil screenshot dari paket Windows yang akan diajukan, bukan dari desain konsep.

## Identitas dan properti

| Field Partner Center | Isian yang disiapkan |
| --- | --- |
| Nama produk | ComePlayers |
| Store ID | `9MTZ5VZDPWGS` |
| Package/Identity/Name | `ComePlayers.ComePlayers` |
| Package/Identity/Publisher | `CN=37E5A202-77EB-4589-94DE-D5717558F0BD` |
| Package/Properties/PublisherDisplayName | `ComePlayers` |
| Versi paket | 1.0.1.0 (MSIX final) |
| Kategori utama | Social |
| Kategori sekunder | Shopping, jika Partner Center menawarkannya |
| Bahasa listing pertama | Indonesia (Indonesia) |
| Website | https://www.comeplayers.com |
| Kebijakan privasi | https://www.comeplayers.com/privacy |
| Dukungan | admin@comeplayers.com; halaman bantuan https://www.comeplayers.com/help-center |
| Harga aplikasi | Gratis untuk memasang; penawaran dalam marketplace dapat berbayar |
| Perangkat | PC Windows; jangan pilih Xbox tanpa pengujian dan aset Xbox |

Jalankan dari akar repositori untuk membangun paket dengan identitas yang direservasi:

```powershell
& '.\comeplayers-apps\apps\desktop\scripts\build-msix-store.ps1' `
  -IdentityName 'ComePlayers.ComePlayers' `
  -PublisherId 'CN=37E5A202-77EB-4589-94DE-D5717558F0BD'
```

Hasilnya adalah `comeplayers-apps/apps/desktop/store-package/output/ComePlayers_1.0.1_x64.msix`. Paket ini belum ditandatangani; unggah melalui Partner Center untuk sertifikasi dan penandatanganan Microsoft, bukan dibagikan sebagai installer langsung.

Kategori **Social** paling sesuai untuk chat dan komunitas; **Shopping** mencerminkan marketplace. Microsoft menggolongkan komunikasi teks, suara, dan video sebagai Social serta pembelian online sebagai Shopping. Jangan menggolongkan paket sebagai game hanya karena komunitasnya bertema game.

## Teks listing Indonesia

**Deskripsi singkat**

Komunitas, pesan, dan marketplace game ComePlayers dalam satu aplikasi Windows. Temukan teman bermain, ikuti obrolan grup, dan lihat penawaran dari desktop.

**Deskripsi**

ComePlayers menyatukan komunitas pemain, pesan pribadi, dan marketplace produk serta layanan game di Windows.

Bergabunglah dengan grup dan ruang obrolan, ikuti percakapan terbaru, cari produk game, dan kelola aktivitas akun Anda. Tautan pembayaran dan pesanan tetap terhubung ke akun ComePlayers. Pilihan produk, harga, dan ketersediaannya mengikuti masing-masing penawaran.

Aplikasi memerlukan koneksi internet. Masuk akun diperlukan untuk mengirim pesan, berpartisipasi dalam komunitas, atau menggunakan fitur akun dan transaksi. Beberapa produk atau layanan di marketplace berbayar.

**Fitur** (masukkan sebagai item terpisah, tanpa karakter bullet)

1. Komunitas dan ruang obrolan grup
2. Pesan pribadi dengan percakapan terbaru di atas
3. Jelajahi penawaran produk dan layanan game
4. Kelola akun dan pesanan dari desktop

**Catatan sertifikasi**

Paket memuat antarmuka ComePlayers dari `www.comeplayers.com`, sehingga koneksi internet diperlukan. Fitur login Google membuka browser sistem dan kembali ke aplikasi melalui protokol `comeplayers://`; sesi tidak dikirim di tautan tersebut. Akun uji untuk peninjau hanya diberikan lewat kolom catatan sertifikasi Partner Center, bukan di listing publik atau repositori.

## Screenshot yang perlu diambil dari MSIX final

Microsoft mewajibkan sekurangnya **satu** screenshot dan menganjurkan **empat atau lebih** untuk jenis perangkat yang didukung. Untuk PC, siapkan PNG landscape sekurangnya **1366 × 768 piksel**, masing-masing paling besar **50 MB**. Gunakan data akun uji dan pastikan tidak ada informasi pribadi, saldo, atau pesanan sungguhan.

1. Beranda komunitas: daftar grup di kiri dan ruang obrolan yang aktif.
2. Percakapan pribadi: daftar chat dan pesan terbaru, tanpa identitas pengguna nyata.
3. Marketplace: jelajah kategori dan kartu penawaran.
4. Halaman detail produk: informasi produk, harga, dan penjual yang terbaca.
5. Opsional: profil/pengaturan akun jika tampil rapi dan benar-benar dapat digunakan.

Gunakan logo ComePlayers resmi yang sudah ada pada paket sebagai ikon. Gambar promosi tambahan bersifat opsional untuk MSIX PC; jangan menampilkan UI atau fitur yang belum tersedia.

## Periksa saat mengisi Partner Center

- Nama `ComePlayers` sudah direservasi dan publisher/identitas paket MSIX cocok dengan data Partner Center.
- Kebijakan privasi dan tautan bantuan terbuka untuk pengunjung tanpa login; alamat dukungan menerima pesan.
- Kuesioner rating usia, wilayah ketersediaan, harga, dan ketentuan lisensi diisi sesuai produk yang diajukan.
- MSIX final terpasang serta dijalankan di Windows bersih; login email/Google, deep link, navigasi komunitas, dan pembayaran diuji dari paket yang sama.
- Screenshot diambil setelah pengujian paket final. Publikasi dilakukan setelah sertifikasi Microsoft, bukan saat file MSIX selesai dibuat.

## Rujukan Microsoft

- [Listing MSIX: deskripsi dan screenshot minimum](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/add-and-edit-store-listing-info)
- [Ukuran screenshot MSIX](https://learn.microsoft.com/id-id/windows/apps/publish/publish-your-app/msix/screenshots-and-images)
- [Kategori MSIX](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/categories-and-subcategories)
- [Privasi dan dukungan MSIX](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/support-info)
- [Alur pengajuan aplikasi Windows](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/publish-first-app)
- [Kebijakan representasi produk Microsoft Store](https://learn.microsoft.com/en-us/windows/apps/publish/store-policies-and-code-of-conduct)

## Pembaruan Windows 1.0.1 — 30 September 2026

Paket yang diajukan: `store-package/output/ComePlayers_1.0.1_x64.msix` (versi manifest `1.0.1.0`, x64).
SHA256: `08006EF0A528345CF72B35F6CFB51DF6E57FE9B8DE69928E0C4408BDBD161757`.

Identitas dan isi paket diperiksa ulang; tidak ada perubahan source desktop sesudah build terverifikasi pada commit `5cd55049`. Fitur nomor CP dari website production terbaru dimuat dari domain resmi; tidak memerlukan perubahan atau build native baru.

### Catatan pembaruan untuk listing

- Nomor CP permanen untuk identitas dan pencarian teman.
- Tombol salin nomor CP dari profil.
- Notifikasi pesan dan panggilan dengan suara saat aplikasi berjalan.
- Perbaikan kestabilan pemberitahuan dan perpindahan kembali ke percakapan.

### Catatan peninjau untuk pembaruan

Aplikasi membutuhkan internet dan memuat antarmuka dari `https://www.comeplayers.com`. Login Google memakai browser sistem dengan callback terlindungi PKCE dan protokol `comeplayers://`. Notifikasi Windows memerlukan aplikasi tetap berjalan (termasuk diminimalkan), mengikuti izin serta pengaturan sistem. Jangan mengklaim ada push saat proses aplikasi ditutup.

Nomor CP adalah identitas publik akun dalam ComePlayers, bukan alokasi nomor telepon internasional. Sepuluh nomor dengan digit akhir berulang dicadangkan untuk admin dan belum dipasangkan ke akun.

### Status pengajuan

Pada 30 September 2026 sekitar 16:17 UTC (23:17 WIB/UTC+7), Windows **1.0.1.0 x64** berhasil diunggah, divalidasi, dan diajukan melalui Partner Center. Pengajuan 2 (`1152921505702012662`) menampilkan **Update in certification**, dengan Submission selesai dan Pre-processing berjalan. Publikasi diatur otomatis segera setelah sertifikasi lulus; versi baru belum tersedia sampai proses Microsoft selesai.

Versi sebelumnya, 1.0.0.0 pada Submission 1, sudah berstatus **In Microsoft Store** dan tetap tersedia selama pembaruan ditinjau. Store ID: `9MTZ5VZDPWGS`; tautan produk: https://apps.microsoft.com/detail/9MTZ5VZDPWGS.

- Paket: `ComePlayers_1.0.1_x64.msix`, 7.023.077 byte, SHA256 sama dengan artefak terverifikasi di atas.
- Identitas: `ComePlayers.ComePlayers`; publisher `CN=37E5A202-77EB-4589-94DE-D5717558F0BD`.
- Catatan versi tersimpan pada listing Indonesia dan Inggris; kedua screenshot listing yang sudah ada dipertahankan.
- Penjelasan runFullTrust diperbarui untuk proses Win32/Tauri, WebView2, callback login, dan notifikasi Windows. Kapabilitas tersebut tetap tunduk pada pemeriksaan Microsoft.
- Bukti lokal: `C:/Comeplayers-new/output/windows-store-20260930/windows-101-certification.png`.
- Dashboard Microsoft menyatakan sertifikasi biasanya beberapa jam, dalam kasus tertentu hingga tiga hari kerja; ini bukan jaminan waktu persetujuan.
- Build/unit test dan validasi paket lulus. Toast/nada dering pada MSIX terpasang dan panggilan dua perangkat belum diverifikasi. Aplikasi harus tetap berjalan untuk menerima notifikasi.

Rujukan alur pembaruan: https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/publish-update-to-your-app-on-store

# Chat dan komunitas web — 28 September 2026

Cabang sumber: `codex/google-play-release` (PR #30). Perubahan utama `1c1a7177`, perbaikan tata letak `5d62ae5`, cadangan web opsional `e6208a3c`, dan penyembunyian fitur tim `16a3298c`.

## Perubahan

- Chat baru disiapkan otomatis setelah login, tanpa membuat passkey atau memasukkan kode. Akun yang sudah memiliki identitas tetap menggunakan identitas tersebut.
- Persiapan browser disimpan sebelum permintaan jaringan. Dua tab memilih satu identitas secara atomik; permintaan yang terputus dapat dilanjutkan. Checkpoint dan kunci perangkat disimpan dalam satu transaksi.
- Chat pribadi memakai bahasa Indonesia, teks dan tombol lebih besar, pencarian nama/produk/pesanan, serta navigasi Chat–Komunitas–Toko. Rincian keamanan dan cadangan tersedia hanya melalui Info.
- Pesan yang gagal dikirim tetap berada di kolom pesan. Pemeriksaan identitas kontak opsional tidak lagi menghalangi percakapan.
- Cadangan sandi akun tersedia melalui Chat → Info percakapan → Cadangan chat (opsional). Wrapper cadangan disimpan terenkripsi sebelum dikirim, sehingga respons yang hilang dapat dicoba ulang dengan identitas yang sama. Sandi dan kunci turunan tidak dikirim ke server. Ini cadangan identitas akun, bukan arsip lengkap pesan/lampiran.
- Komunitas desktop memakai dua kolom. Panel anggota dapat dibuka melalui Anggota; dock siaran hanya terlihat ketika siaran aktif. Panggilan, kontrol siaran, dan pemeriksaan izin tetap memakai alur yang ada.
- Daftar ruang lebih mudah dibaca, dengan pencarian, filter belum dibaca, dan pengaturan tambahan yang dapat dibuka seperlunya.
- Pemuatan tidak menunggu animasi/font atau tanda pesan dibaca. Refresh latar tidak membatalkan pemuatan aktif; kegagalan memiliki tindakan Coba lagi.
- Kartu akun mengikuti alur sidebar desktop; sidebar ponsel dapat digulir seluruhnya agar daftar ruang tidak terjepit sampai tidak dapat dipilih.
- Atas permintaan pemilik, Find Tim, Matchmaking, pencarian/publikasi squad dan pintu masuknya disembunyikan sementara. Pengambilan data matchmaking ikut dihentikan. Komunitas, grup yang sudah ada, dan undangan manual tetap tersedia.

## Pemeriksaan sebelum rilis

- Website TypeScript lulus. Lint berkas yang diubah tidak memiliki error; peringatan pola React yang dicatat tetap ada.
- 22 pengujian browser enrollment/recovery/cadangan opsional lulus: IndexedDB nyata, dua tab bersamaan, respons POST hilang, kegagalan penyimpanan, transaksi terputus, identitas perangkat lain, retry terbatas, pemulihan sandi, penolakan identitas yang berubah, cadangan hanya setelah tindakan eksplisit, dan sandi tidak terunggah.
- Empat pengujian komponen chat lulus; 14 pemeriksaan komunitas/interaksi/viewport lulus; dua pengujian perilaku loader lulus. Enam pemeriksaan interaksi pada patch final lulus, termasuk guard Find Tim yang menjalankan fungsi pemuatan dan memastikan tidak ada fetch atau perubahan state saat fitur dinonaktifkan.
- Pemeriksaan visual lokal memakai komponen asli dengan akun dan transport contoh: pencarian/filter ruang, edit/tambah ruang, chat gagal lalu kirim ulang, konteks pesanan, kembali ke daftar chat, dan lebar 390 piksel. Tidak ada pesan uji yang dikirim kepada pengguna sebenarnya.

## Penerapan dan verifikasi produksi

Arsip rilis hanya memuat subtree website yang tercatat di Git, tanpa dotenv lokal, kunci privat, credential, node_modules, atau artefak QA. Proyek Vercel tetap `prj_J2lxF1Dv7PsmiWbyj9mea1hoYAl3`, root directory `website`.

Rilis final dari sumber `16a3298c` adalah `dpl_8edZtqAD1agm3mo9VvdTtiAJcciq`, berstatus READY dengan alias `www.comeplayers.com` dan `comeplayers.com`. Build produksi Next.js 16.3.6, pemeriksaan TypeScript, dan pembuatan 242 halaman statis berhasil. Pada 28 September 2026 sekitar 12.15 WIB, endpoint `/api/app-version` domain utama mengembalikan ID deployment final tersebut dan `/api/health/live` mengembalikan `ok: true`.

URL deployment: `https://evo-gaming-7npsx8fob-ilham-evogaming-s-projects.vercel.app`. Rilis ini menggantikan deployment awal `dpl_BNqoxhGzy5VnREAxMJFMSkQJ1q5g` dan perbaikan tata letak/cadangan `dpl_4FhpdpxwDgZkbnxCT4FES1RuJFFp`.

Verifikasi domain asli melalui browser akun pemilik: chat langsung menampilkan composer tanpa passkey; Info dan formulir cadangan hanya muncul setelah dipilih (tidak ada sandi pengguna yang dibuat saat QA). Pada viewport CSS 390×844, tombol kembali dan pemilihan ruang marketplace berfungsi, URL berganti ke ruang yang dipilih, dan composer siap. Pada 1280×900, kartu akun berposisi static dan tetap berada di lebar sidebar 300 px; tombol Tambah ruang tidak tertutup. Panel anggota desktop/ponsel dan dialog pemilihan siaran dapat dibuka/ditutup tanpa memulai siaran. Tidak ada pesan nyata yang dikirim saat QA.

Pada deployment final, Find Tim/Matchmaking/Find Squad/Open Squads tidak terlihat di beranda; isi beranda menggunakan ruang kolom yang tersedia. Menu Buat dan formulir Buat komunitas tidak menawarkan tim/squad. Panel samping percakapan hanya menyediakan Anggota dan Kegiatan. Formulir ditutup tanpa membuat komunitas atau undangan.

Bukti tampilan produksi tersimpan secara lokal:

- `tmp/web-community-no-find-team-live.png` — beranda komunitas tanpa Find Tim.
- `tmp/web-chat-simple-live.png` — percakapan dengan kolom pesan siap, tanpa formulir passkey wajib.

## Batas perubahan

Tidak ada migrasi database, reset identitas, penghapusan riwayat, atau perubahan kebijakan pemulihan. Akun lama pada perangkat baru masih memerlukan cadangan sandi/kunci akses yang sebelumnya dibuat. Bila belum ada cadangan, perangkat asal diperlukan; versi ini tidak mengklaim dapat membuka riwayat lama tanpa kuncinya.

Ini adalah rilis website. Android 0.16.0 (24) sebelumnya sudah diterbitkan pada jalur internal Google Play; lihat `comeplayers-apps/play-store/SIMPLE-CHAT-0.16.0.md`. Pengajuan production publik Google Play dan pengujian dua akun/perangkat fisik tidak dibuktikan oleh pemeriksaan web ini. PR tidak digabung untuk melewati pemeriksaan EAS yang masih memerlukan secret `EXPO_TOKEN`.

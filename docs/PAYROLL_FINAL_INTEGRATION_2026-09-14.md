# Integrasi EvoCP Payroll final v0.15.5

Permintaan pengguna: gunakan proyek final `EvoCP_Payroll/` untuk menggantikan `/admin/payroll`, dengan tampilan dan alur yang sama. Folder sumber asli dipertahankan. Aplikasi yang dipublikasikan berada di `website/`.

## Lokasi dan alur

- `/admin/payroll`: Beranda proyek final.
- `/admin/payroll/gaji`: perhitungan gaji final; pesanan, penjualan, mutasi, karyawan, kasbon, stok, produk/game, asisten berbasis aturan, keuangan, closing, dan ekspor berada di rute turunannya.
- `/admin/payroll/legacy`: payroll sebelumnya, dengan API dan data sebelumnya tetap utuh. Sebelum integrasi terdapat satu karyawan, satu periode, dan nol entri. Skema lama tidak dikonversi menjadi order fiktif.
- `website/features/payroll/`: komponen dan logika dari sumber final, dengan import/rute disesuaikan dan CSS dibatasi pada `.evocp-payroll`.

## Penyimpanan produksi

Sumber final memakai localStorage. Integrasi menggantinya dengan adapter memori yang memuat dan menyimpan data ke `/api/admin/payroll/workspace`. Data payroll tidak disimpan di localStorage. Setiap permintaan API menjalankan `requireAdmin`, termasuk pemeriksaan autentikasi dan role dari profil server.

Migrasi `20260913234226_payroll_final_workspace.sql` menambahkan workspace bisnis bersama dan audit perubahan. RLS aktif; anon/authenticated tidak mempunyai hak tabel atau RPC. Server memakai service role setelah memverifikasi admin. Semua penyimpanan memakai revisi optimistis dan transaksi yang mencatat audit sekaligus. Konflik/galat ditampilkan, pengeditan diblokir, dan perubahan lokal dapat diunduh sebelum memuat ulang.

Closing dihitung oleh server memakai rumus sumber final. Snapshot order/gaji, penandaan order, pelunasan kasbon, dan penghapusan penyesuaian gaji disimpan atomik. Order yang sudah Closing tidak bisa dihapus/diubah lewat API. Snapshot Closing lama dapat dipilih untuk melihat dan mengekspor ulang hasilnya.

Badge DEMO dihilangkan setelah penyimpanan produksi terpasang. Tidak ada contoh karyawan/order/saldo vendor yang dimasukkan. Katalog game bawaan sumber final tetap dipakai. Asisten memeriksa data dengan aturan lokal, bukan layanan AI berbayar. Ekspor Excel menggunakan `xlsx-js-style@1.2.0` yang dimuat saat ekspor.

## Verifikasi

- Build Next.js dan TypeScript.
- 34 pengujian dari 12 suite bisnis sumber final: uang, gaji, pembagian order, kode order, stok, rekonsiliasi, pembayaran, status mutasi, tanggal/periode.
- Lima tes tambahan di `website/tests/payroll-final-workspace.test.ts`: closing, kasbon, snapshot, pencegahan penghitungan ulang, kunci, penolakan manipulasi riwayat, validasi, dan asisten dengan fixture eksplisit.
- Tiga assertion pada suite asisten asli masih mengacu pada data demo yang sudah dihapus oleh sumber v0.13. Pengujian pengganti memakai fixture eksplisit; sumber asli tidak diubah untuk menghidupkan data demo.
- SQL persis diuji dengan PGlite: akses anon/user ditolak, admin wajib, audit atomik, revisi lama ditolak, dan tindakan tidak valid tidak menulis data.
- Migrasi produksi diterapkan; uji RPC dalam transaksi yang di-rollback meninggalkan workspace revisi 0 dan audit kosong. Akses langsung anon/authenticated ditolak.
- Browser lokal memakai autentikasi/API simulasi terisolasi, bukan akun admin produksi: desktop, ponsel, tambah karyawan, reload, tidak ada localStorage payroll, ekspor Excel, konflik penyimpanan, dan halaman/API anonim ditolak.

## Batas operasional

Workspace berupa snapshot JSON bersama dengan batas request 3,5 MB dan audit per revisi; bukan penyimpanan tanpa batas. Sebelum volume besar, pecah data menjadi tabel/periode tanpa mengubah kontrak UI. Ekspor Excel adalah laporan, bukan importer/pemulihan database otomatis. Pemulihan dari audit memerlukan administrator sistem. Proyek final memiliki beberapa halaman kontrol tambahan yang masih berupa informasi/prototipe; integrasi ini tidak menambahkan layanan bank, AI berbayar, atau penjadwal backup.

Tidak mengaktifkan migrasi single-device sessions atau mengubah E2EE/login. Persetujuan spesifik yang sebelumnya tertunda tetap berlaku untuk pekerjaan tersebut.

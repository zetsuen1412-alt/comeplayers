# Pembaruan live ComePlayers

Perubahan yang sudah disimpan pengguna, API, atau Google Sheets otomatis muncul
di tab ComePlayers lain yang berhak membacanya. Tidak perlu refresh halaman.
Pengiriman memakai Supabase Realtime; biasanya perubahan tampil dalam beberapa
detik, bergantung koneksi dan waktu pembacaan API.

## Cakupan

- Payroll: Mutasi, pesanan, karyawan, stok, gaji, kasbon, Closing, riwayat, akses,
  serta arsip impor dan payroll lama.
- Marketplace: katalog, kategori, permainan, penawaran, produk, promo, toko,
  rekomendasi, wishlist, penjual, dan turnamen.
- Akun/transaksi: pesanan dan pembayaran, invoice, dompet/top-up, notifikasi,
  pusat penjual, dukungan, sengketa, profil dan pengaturan.
- Admin: ringkasan, pesanan, produk, keuangan, promo, pengguna, audit,
  rekonsiliasi, operasional, dan modul lain yang membaca data bersama.
- Chat, panggilan terenkripsi, dan permainan multiplayer tetap memakai jalur
  realtime khususnya. Daftar teman mendapat tambahan invalidasi akun.

Ini menyinkronkan **hasil penyimpanan**, bukan setiap ketikan atau posisi kursor.
Formulir yang sudah mulai diedit mempertahankan draft. Formulir profil/inventori
yang mengisi ulang seluruh draft menunda penerapan pembaruan latar setelah edit;
buka kembali halaman untuk memulai draft baru dari data server. Pada detail
pesanan/sengketa, status terus diperbarui sementara isian pengiriman/catatan
tetap tersedia. Filter dan posisi navigasi disimpan di state React.

## Alur dan akses

Migration `website/supabase/migrations/20260925041028_site_live_revisions.sql`
menambahkan tabel `cp_live_revisions`, RLS, dan trigger pada daftar tabel yang
ditentukan. Migration lanjutan `20260925044339_site_live_read_policy.sql`
merapikan kebijakan baca menjadi satu per role. Trigger mengubah nomor revisi **dalam transaksi yang sama** dengan
perubahan bisnis. Satu transaksi hanya menaikkan satu revisi per scope, dan
heartbeat/no-op pada tabel biasa tidak memicu pembacaan ulang.

Tabel notifikasi hanya berisi `scope`, `revision`, dan `changed_at`:

| Scope | Penerima |
| --- | --- |
| `catalog` | Pengunjung situs |
| `user:<uuid>` | Pengguna tersebut |
| `admin` | Admin berdasarkan profil database |
| `payroll` | Admin atau anggota Payroll aktif |

Browser tidak mendapat hak tulis ke tabel ini. Fungsi trigger berada di schema
internal, tidak dapat dipanggil sebagai RPC oleh browser. Payload payroll,
saldo, isi pesan, dan credential **tidak dipublikasikan** ke channel tersebut.
Pencabutan akses Payroll juga memberi sinyal ke scope pengguna agar pemeriksaan
API berikutnya membersihkan workspace yang tidak lagi boleh dibaca.

`LiveUpdates` memasang satu subscription per tab. `useLiveRefresh` dan
`useLiveQuery` memanggil ulang pembaca data yang relevan, dengan penggabungan
event dan antrean pembacaan. Halaman server memakai `router.refresh()` tanpa
reload dokumen. Tidak ada replay checkout, capture pembayaran, pendaftaran
perangkat, Closing, atau mutasi lain.

Setiap 30 detik, hanya paling banyak empat **nomor revisi** yang diperiksa
sebagai fallback. Tab tersembunyi/offline menunda pembacaan. Saat tab kembali
aktif, koneksi pulih, atau subscription tersambung lagi, pembaca data mengejar
keadaan terbaru. Mekanisme ini berjalan di website, bukan automation Codex.

## Payroll dan penyimpanan bersamaan

Polling seluruh workspace setiap 15 detik diganti invalidasi live. Pembacaan
bersamaan memakai satu request; revisi yang sama tidak memicu ulang seluruh
store. Respons lama sesudah logout atau sesudah edit lokal diabaikan.
Pembaruan yang datang selama penyimpanan/Closing ditunda sampai selesai.

Proteksi `expectedRevision` tetap berlaku: dua simpan yang bertabrakan menghasilkan
konflik yang terlihat, bukan penimpaan diam-diam. Draft lokal dapat diunduh.
Modal Edit Mutasi juga menolak menyimpan snapshot pesanan yang sudah berubah
sejak modal dibuka. Tidak ada penggabungan otomatis perubahan pada nilai gaji.

Indikator **Live** di Payroll berarti channel tersambung. Arahkan penunjuk ke
indikator untuk melihat waktu pemeriksaan data terakhir. Bila jaringan terputus,
indikator menunjukkan kondisi koneksi.

## Validasi dan operasional

1. Terapkan migration sebelum merilis kode browser.
2. Jalankan TypeScript, lint file yang berubah, build, dan:
   `npx tsx --test tests/live-*.test.ts tests/payroll-live-store.test.ts tests/payroll-google-sheet*.test.ts tests/payroll-final-workspace.test.ts`.
3. Periksa RLS sebagai anon, pengguna biasa, dan admin; browser hanya boleh
   SELECT scope yang diizinkan. Periksa bahwa publikasi `supabase_realtime`
   mencakup `cp_live_revisions`.
4. Uji notifikasi antar dua tab, draft yang sedang diketik, dan kembali ke tab
   yang sempat tidak aktif. Gunakan perubahan metadata untuk smoke test produksi
   agar pesanan, pembayaran, dan Closing tidak perlu diubah.

Rollback kode frontend aman: tabel/trigger hanya memberi notifikasi dan tidak
mengubah aturan bisnis atau menghapus data. Jangan menambahkan tabel bisnis
sensitif langsung ke publikasi hanya untuk memperbaiki indikator koneksi.

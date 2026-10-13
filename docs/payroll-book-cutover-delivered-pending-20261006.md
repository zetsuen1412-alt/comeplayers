# Buku lama, buku baru, STATUS TRANSFER & benturan KODE — EVO GAMING 2026

## Patokan periode (WIB)
- **Buku lama**: semua pekerjaan dengan waktu sumber **sebelum** 6 Oktober 2026 pukul **01.15.00 WIB**. Akhir pratinjau Tutup Buku lama adalah `2026-10-06T01:14:59`.
- **Buku baru**: pekerjaan yang bersumber **mulai tepat** `2026-10-06T01:15:00+07:00` sampai sekarang; berlanjut sampai admin menutupnya.
- Timestamp diproses sebagai waktu lokal WIB pada spreadsheet. Baris baru tepat pukul 01.15 termasuk buku baru.
- Order boosting DAY berhari-hari tetap satu order induk; tanggal sumber dan nilai masing-masing DAY dipisah saat pratinjau periode.

## Status transfer
- Kolom `STATUS TRANSFER` di spreadsheet `MUTASI FH` dibaca berdasarkan header (contoh kolom N). `DELIVERED` menandakan selesai; `PENDING` menandakan belum selesai / belum masuk payroll.
- Untuk **DELIVERED**, data game, jenis order, karyawan, jumlah, dan pembagian harus valid sebelum dianggap terverifikasi otomatis dan dihitung di menu Gaji. Jika tidak valid, tampil **Bermasalah** dan **tidak dibayar**.
- Untuk **PENDING** yang berasal dari Sheet, order atau DAY **tidak masuk gaji** meski status operasional sempat berubah secara manual. Keselamatan ini tidak mengubah cara verifikasi order manual di luar Sheet.
- Sumber Sheet tidak menyediakan timestamp penyerahan. Sistem memakai timestamp input asli sebagai **penempatan periode**, bukan mengklaim sebagai waktu serah terima yang sebenarnya.
- Jika karyawan DAY sudah pernah diverifikasi/digaji, nilai keuangan dan snapshot Closing tidak diubah otomatis. Pengubahan status transfer dari Delivered ke Pending setelah hari atau order terkunci harus dikoreksi melalui mekanisme admin resmi.

## KODE ganda
- KODE identik boleh muncul berkali-kali **hanya** jika merupakan DAY paket yang sama dan identitas, nama pembeli serta paket konsisten.
- Bila buyer **dan** nama order tidak berkaitan dengan order berkode sama yang sudah tersimpan, sinkronisasi menolak overwrite dan membuat alert **KODE Bermasalah** di Mutasi.
- Duplikat non-paket tidak digabung; impor ditolak dan konflik dilaporkan.
- Konflik yang belum diselesaikan dikecualikan dari proses Tutup Buku oleh validasi server, termasuk ketika order asal pernah terverifikasi tetapi belum Closing.
- Periksa kode, buyer, nama paket, DAY, dan kemungkinan perubahan nomor baris di Sheet sumber; perbaiki di sumber, tunggu sinkronisasi, cek alert hilang. Jangan memberi dua transaksi berbeda satu kode.

## Prosedur admin — Tutup Buku awal (tidak otomatis)
1. Buka `/admin/payroll/finance/closing`, pada bagian **Pemisahan periode payroll** pilih **Siapkan Tutup Buku lama**.
2. Periksa rentang waktu sampai **06/10/2026 01.14.59 WIB**. Pastikan hanya pekerjaan DELIVERED yang lolos validasi muncul pada daftar calon gaji. Pending, konflik KODE dan order bermasalah harus dibiarkan di pekerjaan tertunda.
3. Bandingkan jumlah dan distribusi karyawan dengan spreadsheet sumber serta riwayat Closing yang sudah ada. Jangan melakukan pembayaran ganda.
4. Gunakan **Kunci Periode**, kemudian **Tutup Buku** setelah diperiksa dan dikonfirmasi. Aksi ini mengunci snapshot gaji/potongan Kasbon dan tidak boleh dilakukan hanya untuk membersihkan layar.
5. Setelah Closing sukses, **Buka Kunci** lalu pilih **Tampilkan buku baru** untuk rentang mulai 06/10/2026 01.15 WIB sampai saat ini. Biarkan terbuka hingga Closing berikutnya.
6. Gunakan bagian **Arsip Tutup Buku · data terpisah** untuk membuka snapshot, cek riwayat dan ekspor Excel lama.

**Penting:** Merge atau deploy website tidak menjalankan Tutup Buku pada data produksi dan tidak menyalin/menutup baris Google Sheet. Hanya proses Tutup Buku yang telah dikonfirmasi oleh admin berwenang yang membuat snapshot finansial permanen.

## Pemeriksaan sebelum produksi
```sh
cd website
npm run typecheck
npx --no-install tsx --test tests/payroll-transfer-cutover-conflicts.test.ts tests/payroll-google-sheet-sync.test.ts tests/payroll-google-sheet-daily.test.ts tests/payroll-daily-orders.test.ts tests/payroll-final-workspace.test.ts
npm run build
```

Uji langsung satu contoh Delivered valid, satu Pending, satu DAY campuran, satu duplikat KODE buyer/paket tak mirip, dan satu snapshot Closing lama. Periksa bahwa mutasi sumber dari Apps Script memang mengirim header **STATUS TRANSFER** lengkap.

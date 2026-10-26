# PAUSE dan CONTINUE Monitor FH3

Windows 2.0.6 / Android 1.7.4 menambahkan PAUSE dan CONTINUE pada Tugas Aktif.
Alur: TAKE terkonfirmasi → START + foto → PAUSE + foto → CONTINUE + foto → DONE.
Jeda dapat diulang beberapa kali sebelum DONE. Caption mengikuti format server
`x800/adit/pause` dan `x800/adit/continue`, membalas foto sebelumnya di grup FH3.

Pilih tugas yang sedang berjalan, lalu PAUSE. Setelah Telegram mengonfirmasi
foto, status tugas menjadi `paused` dan tombol berubah menjadi CONTINUE. CONTINUE
juga meminta foto. DONE tidak tersedia selama jeda. Klien lama yang mencoba DONE
saat PAUSE ditolak server. Pemilihan foto, pembatalan, atau kegagalan yang jelas
tidak mengubah status. Hasil Telegram yang belum pasti mengunci aksi sampai
direkonsiliasi; jangan mengirim foto berulang untuk mengatasi timeout.

Jeda disimpan sebagai rangkaian laporan per UUID START dan nomor urut. Permintaan
membawa UUID START dan revisi yang ditinjau pengguna sehingga data lama atau
perangkat lain tidak dapat mengirim transisi yang salah. Pemindahan oleh admin
memulai siklus START baru dan mempertahankan riwayat jeda sebelumnya. Pemindahan,
arsip atau pengubahan admin diblokir ketika laporan jeda masih dikirim/belum pasti.

PAUSE tidak mengakhiri order, mengubah upah, membuat Tutup Buku, atau mengubah
status karyawan menjadi Ready/Tidur. Data Payroll/karyawan/gaji/Closing tetap
dipertahankan. Status dasar pekerjaan tetap sama; status jeda berasal dari jurnal
laporan Telegram. Riwayat selesai dan penghasilan tetap memerlukan DONE.

Migrasi tambahan: `20261026110043_fh3_monitor_pause_continue.sql`. Migrasi hanya
menambah jurnal dan RPC/pengaman; tidak menghapus atau menulis ulang payload
Payroll. Seluruh RPC baru dibatasi service_role, tabel memakai RLS, dan otorisasi
akun/karyawan diperiksa kembali dalam transaksi yang sama dengan klaim laporan.
Tidak ada token bot/database di EXE/APK. Sebelum migrasi tersedia, endpoint Tugas
tetap melayani alur START/DONE lama dengan tombol PAUSE dinonaktifkan.

Penerapan produksi memerlukan persetujuan pemilik: cadangkan, terapkan migrasi,
verifikasi hak akses serta data, deploy backend, lalu publikasikan EXE/ZIP/APK
dengan identitas penandatanganan yang sama. Jangan hapus tabel jurnal saat rollback.

Rilis ini juga mencakup pemulihan notifikasi Android, tes suara lokal, dan status
pemeriksaan latar belakang; lihat `monitor-order-notifications.md`. Notifikasi
tetap memakai polling HTTPS dan mengikuti izin, kanal, volume, DND dan Doze Android.

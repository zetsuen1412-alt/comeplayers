# Akun bersama Monitor FH3

Windows 2.0.4 dan Android 1.7.2 menambahkan **Akun bersama** untuk komputer
karyawan yang dipakai bergantian. Satu username dapat dipakai login di beberapa
perangkat. Setiap perangkat tetap memiliki token/sesi tersendiri.
Pembatasan login lama (15 percobaan dalam 10 menit per identitas/IP) tetap
berlaku; lakukan login awal banyak komputer secara bertahap. Refresh sesi tidak
menggunakan kuota percobaan login tersebut.

## Pengaturan oleh admin

1. Login admin dan buka **Kelola Order → Akun Karyawan**.
2. Isi username akun yang sudah ada, atau centang **Buat akun baru** dan isi
   email pemilik serta password minimal 12 karakter.
3. Centang **Akun bersama — semua karyawan FH3 / beberapa komputer**. Pemilih
   satu karyawan disembunyikan; akun ini tidak terikat pada nama tertentu.
4. Centang **Akun aktif** dan simpan. Akun pribadi yang sudah dihubungkan juga
   bisa diubah menjadi akun bersama melalui pilihan ini.
5. Login memakai username tersebut di masing-masing komputer. Pilih **nama
   karyawan yang benar** sebelum TAKE. START/DONE mengikuti pekerja pada order.

Akun bersama dapat memilih seluruh karyawan FH3 yang aktif dan identitasnya
unik, membaca tugas aktif, serta mengirim TAKE/START/DONE. Nama pekerja, bukan
nama akun bersama, tetap dipakai untuk order dan Data Tutup Buku. Audit menyimpan
akun yang melakukan tindakan dan identitas pekerja pada pekerjaan tersebut.
Anggota Monitor tetap dapat membaca order selesai dan Data Tutup Buku tim
sesuai keputusan pemilik sebelumnya.

**Kelola Order, penghapusan/arsip, Refund/Bermasalah, transfer, upah, Tutup Buku
dan pengaturan akun tetap khusus admin.** Akun pribadi tetap hanya mengerjakan
order satu karyawan. Akun bersama tidak mendapatkan akses Payroll Website.

Untuk mencabut akses akun bersama, isi username yang sama, pilih **Akun bersama**,
hilangkan **Akun aktif**, lalu simpan. Permintaan API berikutnya dari perangkat
mana pun ditolak. Riwayat pekerjaan dan penghasilan tetap disimpan. Logout
aplikasi hanya menghapus sesi lokal perangkat tersebut.

## Batas sesi dan izin

Hak bersama berasal dari binding database yang hanya dapat diubah admin, bukan
input aplikasi atau user metadata. Semua permintaan tetap memverifikasi token
dan MFA yang berlaku. Server memeriksa ulang binding aktif; RPC TAKE/START/DONE
juga memeriksanya di dalam transaksi agar pencabutan akses tidak bergantung
pada cache aplikasi.
Sesi bersama juga harus masih ada di `auth.sessions`, dimiliki akun yang sama
dan belum melewati batas waktunya. Sesi yang dihapus tidak diterima hanya karena
access token belum kedaluwarsa.

Pengecualian sesi hanya berlaku di API Monitor untuk binding `shared` yang aktif.
Akun tersebut tidak mengklaim atau memeriksa slot satu-perangkat website saat
login/refresh Monitor. Admin dan akun pribadi tetap memakai kebijakan sesi
website yang sama. Aturan sesi untuk endpoint website lainnya tidak diubah.
Konfigurasi Auth global tidak diubah. Jika penyedia Auth mengaktifkan batas
single-session global, batas tersebut perlu ditinjau tersendiri sebelum uji
beberapa perangkat; fitur ini tidak menonaktifkannya untuk seluruh pengguna.

Sumber order tetap kiriman admin Telegram FH3 yang sudah diverifikasi. Status
lokal, jam tidur dan pergantian otomatis menjadi Work setelah TAKE terkonfirmasi
tetap menggunakan aturan sebelumnya. Pengaturan akses ini tidak menyinkronkan
status lokal antarperangkat.

## Penerapan

Migrasi tambahan: `20261025141943_fh3_monitor_shared_workstations.sql`.
Kolom scope ditambahkan dengan default `employee`; binding pribadi, tabel audit,
order, upah dan Data Tutup Buku lama dipertahankan. Identitas karyawan di binding
menjadi nullable khusus scope `shared`. Constraint menolak kombinasi lainnya.
RPC baru hanya dapat dieksekusi service role dengan pemeriksaan aktor admin.
RLS dan larangan menulis tabel secara langsung tetap berlaku.

Terapkan migrasi sebelum API, lalu rilis aplikasi setelah PR disetujui. Tidak ada
pengaturan akun bersama atau data produksi yang dibuat otomatis. Tidak ada
perubahan sinkronisasi Google Sheets, payload Payroll, gaji atau Closing lama.
Kunci dan application ID Android tetap; pengembangan sertifikat Windows yang
dihentikan berada di draft PR lain dan tidak termasuk perubahan ini.

Pengujian memakai database lokal terisolasi, fixture HTTP dan pratinjau sintetis.
TAKE/START/DONE pelanggan serta laporan Telegram produksi tidak dipakai untuk uji.
Uji login fisik pada dua komputer, refresh token dan Android tetap diperlukan
setelah penerapan yang disetujui.

# Musik dan popup order baru

Windows 2.0.5 dan Android 1.7.3 memakai cuplikan awal 10 detik dari musik yang
diberikan pemilik. Akhir cuplikan memudar. Audio dibundel dalam aplikasi dan tidak
diunduh setiap kali ada order; suara ucapan sebelumnya diganti.

## Windows

Order baru menampilkan popup putih/biru di kanan bawah layar aktif, di atas
taskbar. Popup muncul saat Monitor diminimalkan, tanpa mengambil fokus keyboard
atau menambahkan tombol taskbar. Isinya referensi order, tanpa kredensial akun
game. Klik popup membuka **Take Order**; tidak melakukan TAKE otomatis.

Popup menutup otomatis setelah 10 detik. Tombol × menutupnya tanpa membuka order.
Menutup popup, logout atau keluar aplikasi menghentikan audio. Order baru yang
datang bersamaan digabung menjadi satu pemberitahuan dan satu pemutaran. Popup
berikutnya menggantikan yang masih tampil, bukan menumpuk atau menumpuk audio.
Jika popup gagal dibuat, aplikasi mencoba notifikasi tray bawaan tanpa
menggagalkan penyegaran antrean.

Di **Pengaturan**, **Suara order baru: musik (10 detik)** dapat dimatikan dan
pilihannya tersimpan pada PC tersebut. **Tes notifikasi** mencoba popup/suara
secara lokal dengan label contoh; tidak membuat order, mengirim laporan Telegram
atau menambahkan referensi contoh ke riwayat deteksi order.

## Android

Aktifkan notifikasi order dan izin notifikasi yang diminta Android. Layanan
pemantauan latar belakang tetap memeriksa antrean sekitar setiap 30 detik.
Pemberitahuan order memakai kanal sistem dengan audio dari resource aplikasi.
Volume, izin, Do Not Disturb dan perilaku heads-up tetap dikendalikan Android.
Suara dapat dimatikan dari Pengaturan aplikasi tanpa mematikan notifikasi visual.

Kanal audio Android yang sudah dibuat tidak dapat diubah oleh aplikasi. Karena
kanal lama sengaja tidak memiliki audio, rilis ini membuat ID kanal musik dan
tanpa-suara yang stabil. Importance lama diwarisi, termasuk bila kanal lama
diblokir atau diturunkan prioritasnya; pengaturan pengguna pada kanal baru tidak
ditimpa saat restart. Tidak ada pemutaran MediaPlayer/TTS untuk melewati pengaturan
notifikasi sistem. Suara diserahkan ke sistem sebagai suara notifikasi.

## Deteksi dan verifikasi

Hanya order antrean terverifikasi dari admin Telegram FH3 yang memicu notifikasi.
Pembukaan pertama membentuk baseline diam. Referensi tersimpan per akun/perangkat;
restart, penyegaran, order yang sudah dikenal dan pengembalian order yang sama
tidak memicu notifikasi ulang. Menonaktifkan layanan Android/logout menghapus
notifikasi order yang masih tampil.

Pengujian otomatis memeriksa deduplikasi tersimpan, pengaturan mute, WAV PCM dan
durasi aset tertanam, batas layar/taskbar, fokus, klik/tutup dan penutupan otomatis.
CI Android juga membandingkan SHA-256 MP3 di dalam APK dengan aset yang ditinjau.
Suara pada speaker serta tampilan heads-up perangkat Android fisik tetap perlu
dicoba, karena bergantung pengaturan perangkat. Pengujian tidak memakai order
pelanggan atau mengirim laporan Telegram palsu.

Package ID/kunci Android, akun bersama, TAKE/START/DONE, upah, Tutup Buku dan data
Payroll tetap menggunakan alur sebelumnya. Tidak ada perubahan backend atau
migrasi database. Publikasi produksi memerlukan persetujuan pemilik atas PR.

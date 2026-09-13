# Cara Mencoba ComePlayers Marble V53

1. Buka folder proyek ini melalui Cocos Dashboard menggunakan **Cocos Creator 3.8.8**.
2. Tunggu proses import asset selesai.
3. Buka scene `assets/scenes/Match.scene`.
4. Tekan **Preview**.
5. Dari Lobby, masuk ke Local Room melalui **Create Room** atau **Quick Match**.
6. Tekan tombol **AI** untuk memilih `CASUAL`, `SMART`, atau `EXPERT`.
7. Tekan tombol **ROUND EVENTS** untuk mengaktifkan atau menonaktifkan World Event.
8. Tekan **READY & START**.
9. Jika World Event aktif, event muncul setiap dua ronde mulai ronde 2.

World Event V53:

- Sponsor Drop: seluruh pemain aktif menerima CP 120.000.
- Construction Grant: seluruh pemain aktif memperoleh satu upgrade gratis.
- Travel Festival: seluruh pemain aktif memperoleh satu tiket World Travel.
- Insurance Day: seluruh pemain aktif memperoleh satu perlindungan sewa 35%.
- City Maintenance: pemilik kota membayar CP 15.000 per kota tanpa dibuat bangkrut oleh event.
- Comeback Fund: pemain aktif dengan uang paling sedikit menerima CP 250.000.

Pengaturan V52 lama tetap dapat dibaca. Save lama otomatis memakai `SMART AI` dan `ROUND EVENTS ON` sebagai nilai awal.

Lingkungan pembuatan paket ini tidak memiliki aplikasi Cocos Creator, sehingga Preview visual dan build platform tetap perlu dijalankan di komputer yang memiliki Cocos Creator 3.8.8.

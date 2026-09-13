# ComePlayers Marble V102 — Clean Match HUD

## Tujuan update
V102 mengurangi panel yang menutupi papan. HUD default hanya menampilkan informasi inti pertandingan. Data lanjutan dipindahkan ke tombol `INFO`.

## Cara mencoba
1. Ekstrak ZIP ke folder kosong baru.
2. Jangan menimpa proyek V101.
3. Hapus `library`, `temp`, `build`, `.creator`, dan `node_modules` bila tersalin dari workspace lama.
4. Buka dengan Cocos Creator 3.8.8.
5. Lobby harus menampilkan `V102 CLEAN MATCH HUD`.

## Yang perlu diperiksa
- INFO panel tertutup saat pertandingan dimulai.
- Tekan `INFO` untuk melihat City Intel, turn order, Color Monopoly, Fortune, Special District, liquidation, Live Academy, dan system log.
- INFO panel otomatis menutup ketika popup pembelian, pembayaran, Fortune, World Travel, Olympic, Game Center, tutorial, pause, atau result muncul.
- Player cards, top bar, skill dock, turn banner, dice reveal, landing card, dan roll dock lebih kecil.
- Board harus menjadi elemen visual paling dominan.

## Kompatibilitas
Tidak ada perubahan schema save. Save V101, replay, Career, Journey, Rival, ranked, dan multiplayer tetap kompatibel.

## Build note
Web Desktop build tidak disertakan karena Cocos Creator 3.8.8 tidak tersedia di lingkungan packaging.

# ComePlayers Marble - Master Reference & Visual Parity Specification V74

## Tujuan

Dokumen ini menyatukan hasil pengamatan dari enam video yang diberikan pengguna, panduan lengkap Modoo Marble PC 28 halaman, dan koleksi referensi gambar PC. Tujuannya adalah membuat ComePlayers Marble terasa sangat dekat dari sisi alur permainan, framing kamera, kepadatan informasi, tempo animasi, serta urutan keputusan; bukan menyalin logo, nama, karakter, audio, tekstur, ikon, atau aset proprietary.

## Prinsip wajib

1. Papan selalu menjadi fokus utama dan mengisi sekitar 68-78% area layar gameplay.
2. Kamera menggunakan sudut isometrik tetap yang stabil. Close-up hanya singkat untuk dadu, tile, dan event khusus.
3. Keempat panel pemain berada di tepi layar sehingga bagian tengah papan tetap kosong dan mudah dibaca.
4. Tombol ROLL menjadi aksi utama paling besar dan paling kontras pada giliran pemain lokal.
5. Setiap giliran mengikuti urutan visual yang konsisten: banner giliran -> kesiapan roll -> lempar dadu -> angka total -> gerakan per langkah -> fokus tile -> keputusan atau resolusi -> kembali ke overview.
6. Popup keputusan selalu tampil di tengah dengan papan masih terlihat di belakang.
7. Bangunan, kepemilikan, landmark, dan multiplier harus terlihat langsung di tile; pemain tidak perlu membuka menu tambahan untuk mengetahui keadaan papan.
8. UI menggunakan aset dan identitas ComePlayers sendiri. Jangan menyalin logo, karakter, kartu, suara, atau tekstur Modoo Marble.

## Target struktur layar gameplay

- **Papan:** square perimeter 32 tile, ruang tengah luas dan gelap.
- **Kamera overview:** board memenuhi layar dengan margin tipis; sudut sekitar 35-40 derajat ke bawah dan rotasi diagonal sekitar 45 derajat.
- **HUD pemain:** empat panel pada sudut/tepi, berisi avatar, nama, peringkat sementara, uang tunai, total aset, status island/bankrupt, dan warna kepemilikan.
- **Header:** informasi ronde, map/mode, timer, dan tombol kecil pengaturan.
- **Aksi bawah:** tombol ROLL besar di tengah bawah; tombol skill dan informasi dadu berada sebagai elemen sekunder.
- **Center stage:** area untuk dadu fisik, banner angka, popup Lucky Ticket, Game Center, Olympic, properti, pembayaran, dan hasil.

## Urutan giliran yang harus diterapkan

| Tahap | Target durasi | Presentasi |
|---|---:|---|
| Banner giliran | 0.65-0.90 dtk | Nama pemain, warna, teks giliran singkat |
| Ready roll | sampai input | Tombol ROLL aktif, timer terlihat |
| Anticipation dadu | 0.08-0.14 dtk | Squash kecil sebelum terlempar |
| Roll dadu | 0.72-1.05 dtk | Dua dadu bergerak terpisah, tetap dekat pusat papan |
| Reveal angka | 0.75-1.10 dtk | Total angka besar; DOUBLE lebih kuat |
| Gerakan bidak | 0.16-0.24 dtk/tile | Satu hop pendek per tile, arah bidak mengikuti jalur |
| Fokus tile | 0.25-0.45 dtk | Kamera mendekat sedikit, tidak menghilangkan konteks papan |
| Keputusan/event | sampai selesai | Popup pusat, pilihan jelas, papan diredupkan ringan |
| Return overview | 0.25-0.45 dtk | Kamera kembali ke sudut utama |

## Properti dan bangunan

- Tile kota memiliki pita warna kelompok, nama kota, harga atau sewa, dan marker pemilik.
- Saat tile kosong: popup pembelian menampilkan kota, biaya tanah, opsi tingkat bangunan, total biaya, dan tombol BUY/SKIP.
- Saat tile milik lawan: tampilkan sewa, uang sesudah pembayaran, dan opsi TAKEOVER bila tersedia.
- Level visual: tanah -> rumah -> gedung -> hotel/tower -> landmark.
- Landmark mengunci takeover dan harus mempunyai siluet unik serta efek reveal singkat.
- Olympic/festival multiplier harus muncul sebagai badge langsung di tile.

## Tile khusus

### Start
- Memberikan gaji ketika dilewati.
- Saat berhenti, tampilkan pilihan atau bonus pembangunan sesuai aturan ComePlayers.

### Lucky Ticket / Fortune
- Kartu tampil besar di tengah, rarity/jenis di atas, efek dan target di bawah.
- Reveal 0.25-0.40 dtk, hold minimal 1.0 dtk sebelum resolusi.

### Game Center
- Popup bergaya mesin permainan dengan pilihan angka/gambar.
- Pemain memilih salah satu opsi; hasil target kemudian dibuka.
- Menampilkan menang/kalah, multiplier, dan perubahan uang dengan angka besar.

### Olympic / Festival
- Pemain memilih kota miliknya atau kota valid.
- Kota yang dipilih mendapat multiplier sewa dan marker visual menyala.

### World Travel
- Sorot seluruh tile tujuan valid.
- Pemain memilih langsung dari papan atau daftar ringkas; kamera tetap memperlihatkan board.

### Island
- Tampilkan sisa giliran tertahan pada panel pemain dan marker pada tile.

## Kondisi kemenangan

- Bankruptcy: semua lawan atau tim lawan bangkrut.
- Line completion: satu sisi/garis penuh sesuai aturan map.
- Color monopoly: menguasai semua kota pada kelompok warna yang ditentukan.
- Tourist/special monopoly: menguasai seluruh area wisata atau properti khusus.
- Batas ronde/waktu: pemenang ditentukan dari total aset.

Semua kondisi harus dipresentasikan dengan banner kemenangan singkat sebelum layar hasil lengkap.

## Lobby dan waiting room

- Alur: Channel -> Room List -> Room -> Ready -> Match -> Result -> Room/Lobby.
- Lobby menampilkan daftar room dua kolom atau tabel padat, filter mode, channel, quick join, create room, profile, currency, dan menu meta.
- Waiting room menampilkan empat slot, host, tim/warna, ready state, preview map, mode, serta satu tombol READY/START yang dominan.
- Chat kecil berada di bagian bawah/samping dan tidak menutupi slot pemain.

## Sistem karakter dan kartu

- Halaman karakter mempertahankan profile/currency context.
- Kartu memiliki rarity, level, portrait, dan statistik ringkas.
- Combine: pilih kartu utama + material -> konfirmasi -> reveal hasil.
- Upgrade: konsumsi material -> progress/level naik -> tampilkan perubahan statistik.
- Pack opening: konfirmasi pembelian -> animasi pack -> kartu dibuka berurutan -> ringkasan hasil.
- Seluruh kartu, nama, portrait, rarity frame, dan statistik ComePlayers harus orisinal.

## Standar visual ComePlayers

- Warna dasar: charcoal/black.
- Aksen keputusan: gold/yellow.
- Aksen aktif: cyan/neon blue.
- Informasi bahaya/pembayaran: red/coral.
- Permukaan papan: material 3D glossy ringan dengan frame metalik.
- Hindari efek glow berlebihan; glow hanya untuk aksi aktif, special tile, landmark, dan hasil penting.
- Font harus terbaca pada 1366x768 serta 1920x1080.

## Acceptance criteria V74+

- [ ] Papan mengisi minimal 68% layar pada overview 16:9.
- [ ] Empat panel pemain tidak menutup tile atau karakter.
- [ ] Tombol ROLL terlihat sebagai CTA utama.
- [ ] Kamera kembali ke overview setelah semua event.
- [ ] Gerakan karakter berhenti tepat pada pusat tile dan tidak melompat terlalu tinggi.
- [ ] Dadu tidak keluar dari area tengah papan.
- [ ] Popup properti memuat biaya, level bangunan, total, dan pilihan jelas.
- [ ] Game Center, Olympic, World Travel, Fortune, Island, dan Tax mempunyai presentasi berbeda.
- [ ] Marker kepemilikan dan bangunan terbaca tanpa membuka popup.
- [ ] Result screen menampilkan peringkat, aset, uang, reward, XP/rank, dan tombol kembali.
- [ ] UI tetap memakai identitas ComePlayers dan tidak memuat aset proprietary.

## Urutan implementasi

1. Camera and board framing parity.
2. Four-corner player HUD and central roll dock.
3. Turn/dice/movement presentation sequence.
4. Property purchase/payment/takeover modal parity.
5. Special tile event presentation.
6. Building and landmark readability.
7. Lobby and waiting-room density.
8. Character card combine/upgrade/pack flows.
9. Audio timing and result presentation.
10. Final visual regression check against the contact sheets.

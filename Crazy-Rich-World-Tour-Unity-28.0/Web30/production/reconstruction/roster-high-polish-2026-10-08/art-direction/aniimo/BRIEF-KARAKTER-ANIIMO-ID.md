# Acuan visual karakter Crazy Rich World Tour

Referensi yang dipilih pengguna: [Aniimo's Character Customization! 💋 | Thinking Out Loud 💬](https://www.youtube.com/watch?v=QMVrBG6EZr4), Sarah Sunstone, durasi 15:12. Video merupakan ulasan dan demonstrasi fitur kustomisasi pada beta yang ditampilkan pembuat video. Video ini bukan tutorial pembuatan mesh, UV, tekstur, atau rig. Jangan menganggap fitur beta tersebut sebagai daftar fitur Aniimo versi terkini.

Dokumen ini mengarahkan revisi model berikutnya; pencatatannya belum mengubah model. Rambut lavender, wajah bermata biru, headphone, jaket gelap dengan detail emas, sepatu putih, koper biru, dan proporsi chibi Alexia tetap menjadi identitas Crazy Rich World Tour. Bentuk avatar, pakaian, dan proporsi Aniimo tidak disalin.

## Bukti sumber

Transkrip otomatis sudah dibaca. Rincian berikut berasal dari penjelasan pembuat video, bukan pengukuran material atau topologi game:

| Waktu | Hal yang dijelaskan | Pemakaian dalam proyek |
| --- | --- | --- |
| [0:38–2:21](https://www.youtube.com/watch?v=QMVrBG6EZr4&t=38s) | Bentuk wajah, alis, mata, hidung, mulut, dan telinga dapat diatur terpisah. | Rapikan wajah sebagai satu volume yang konsisten; pertahankan ciri Alexia dari referensi 2D. |
| [3:01–4:17](https://www.youtube.com/watch?v=QMVrBG6EZr4&t=181s) | Desain dan warna mata kiri/kanan, ukuran pupil, efek mata, serta warna, kilap dan transparansi rias dibahas. | Mata perlu terbaca bersih; detail iris, pantulan dan kelopak diberi lapisan yang terkontrol. |
| [5:01–5:37](https://www.youtube.com/watch?v=QMVrBG6EZr4&t=301s) | Warna dasar, undertone, tekstur dan kilap kulit; perubahan warna berlaku pada tubuh. | Samakan warna kulit wajah, telinga, tangan dan kaki di bawah cahaya yang sama. |
| [5:40–6:23](https://www.youtube.com/watch?v=QMVrBG6EZr4&t=340s) | Proporsi lengan, tangan, dada, pinggang, pinggul, paha dan betis dapat diatur. | Tinjau proporsi 3D dari samping dan belakang, bukan hanya kecocokan gambar depan. |
| [6:51–8:41](https://www.youtube.com/watch?v=QMVrBG6EZr4&t=411s) | Pilihan rambut, volume, panjang, arah, poni, kelengkungan ujung, warna dan sorotan; sebagian perakitan bagian rambut dicoba di beta. | Pisahkan massa utama, poni, helai samping dan ujung rambut agar bentuknya sengaja dirancang. |
| [8:45–10:00](https://www.youtube.com/watch?v=QMVrBG6EZr4&t=525s) | Outfit serta kategori pakaian, sarung tangan, kaus kaki dan sepatu; pembuat video menilai tampilannya rapi. | Pertemuan kerah, lengan, manset, pinggang dan sepatu harus selesai dengan baik. |
| [10:37–12:36](https://www.youtube.com/watch?v=QMVrBG6EZr4&t=637s) | Aksesori kepala, telinga, leher, badan, punggung dan bahu ditampilkan/dijelaskan. | Headphone dan koper Alexia harus punya bentuk utuh, titik pemasangan jelas dan batas material bersih. |

## Kondisi Alexia yang diperiksa

Gambar `outputs/CRWT-Alexia-high-visual-preview-2026-10-08.jpg` memperlihatkan model Alexia dari sudut tiga perempat. Jaket gelap, sepatu putih, koper biru dan rambut lavender sudah terbaca. Massa rambut belakang masih menyerupai cangkang besar dengan batas antarlapisan; detail baju bagian tengah dan area dekat headphone tampak lebih bercampur daripada permukaan jaket yang baru. Wajah chibi dan aksesori perjalanan tetap jelas. Ini hanya pengamatan gambar tersebut; gambar statis tidak membuktikan mutu semua sisi atau animasi.

## Urutan pengerjaan berikutnya

1. **Siluet rambut dan profil.** Bentuk ulang massa belakang menjadi kelompok gelombang dengan akar, arah dan ujung yang jelas. Rapikan sambungan kepala, telinga, headphone dan rambut. Pastikan tidak ada rongga terbuka, lapisan mengambang atau bagian yang melebar tidak sengaja ketika diputar ke kiri, kanan dan belakang. Sorotan mengikuti arah rambut dengan lembut; jangan menutupi bentuk dengan kilap putih.
2. **Wajah, kulit dan mata.** Bersihkan peta warna yang masih bercampur di tepi pipi, kelopak, telinga dan garis rambut. Samakan kulit di seluruh tubuh. Pisahkan iris, pupil, pantulan dan garis bulu mata supaya tidak muncul seperti noda pada permukaan. Pertahankan rasio kepala, ekspresi, warna mata dan fitur Alexia pada visual aslinya.
3. **Pakaian dan aksesori.** Selesaikan kerah dan bagian depan baju, jahitan manset, saku, tepian jaket, sole sepatu, gagang koper serta sambungan headphone. Kain memakai sorotan lebar yang lembut, emas memiliki kilap lebih terarah, kulit tetap lembut, dan koper memiliki lapisan yang berbeda dari kain. Hindari bercak hasil proyeksi gambar di bagian samping dan belakang.
4. **Gerakan karakter game.** Rapikan bobot tulang setelah geometri selesai. Tangan tetap menempel pada lengan, kaki pada sepatu, dan koper pada gagangnya selama idle dan walk. Rambut tidak menembus bahu atau headphone. Tambahkan kedipan dan ekspresi wajah melalui bentuk wajah yang dirancang, kemudian uji transisi idle–walk. Kedipan, ekspresi dan fisika rambut adalah arahan proyek; transkrip ini tidak membuktikan mekanisme rig Aniimo.

## Gerbang pemeriksaan visual

Bandingkan depan, belakang, kiri, kanan dan tiga perempat pada ukuran tampilan yang sama, menggunakan cahaya studio netral dan cahaya hangat. Ambil jarak dekat wajah serta kepala–bahu. Periksa loop idle/walk dari kedua samping dan belakang, lalu ambil beberapa frame yang berbeda. Revisi diterima ketika bentuk dan material bersih di semua sudut, identitas 2D masih terbaca, serta sendi dan aksesori tidak lepas atau berpotongan secara mencolok. Cantumkan sisa masalah pada checkpoint; belum ada bukti bahwa mutu Alexia saat ini setara dengan Aniimo.

Pilihan warna mata, variasi rambut dan pakaian dapat dicatat untuk pengembangan selanjutnya. Pembuatan editor kustomisasi lengkap tidak diperlukan untuk memakai video ini sebagai acuan seni.

## Pengamatan frame video

Agen utama memeriksa frame video langsung melalui browser. Pada [4:33](https://www.youtube.com/watch?v=QMVrBG6EZr4&t=273s), terlihat mata biru besar yang bersih, kulit lembut, bentuk bibir dan rias halus, rambut samping dengan arah helai yang jelas, serta kontrol kilap dan kekasaran rias. Pada [7:18](https://www.youtube.com/watch?v=QMVrBG6EZr4&t=438s), terlihat kuncir dengan profil samping rapi dan rompi pendek biru-abu dengan tepian oranye; volume tubuh dan pakaian terbaca terpisah. Ini mendukung target wajah, rambut dan pertemuan material yang bersih. Angka shader, resolusi tekstur, topologi dan metode rig tidak dapat ditentukan dari frame tersebut.

# Review read-only island luar Alexia V11

Rekomendasi: buat **salinan ablation untuk perbandingan visual yang hanya menyembunyikan/menghapus komponen 2, 3, dan 4**, total **912 segitiga**. Simpan versi interior cleanup dan sumber asli sebagai pembanding. **Komponen 9 tetap dipertahankan.** Review ini tidak menetapkan versi ablation sebagai desain final atau pengganti aset game.

GLB sumber aktual mempunyai SHA-256 `d0a0fea651079aa98d026a1610ef0a9e7f4c14c0c466cb1d949886df45c24a66`. Hash tersebut sama sebelum dan sesudah review. Tidak ada mesh yang diekspor, diedit, atau dihapus oleh skrip review ini.

## Dasar perbandingan

Referensi yang diperiksa langsung adalah `production/turnarounds/alexia/turnaround-blue-imagegen-v2.png`, **1.988.013 byte**, SHA-256 `935b1f8f7d2be4a6a453a089041844f2cd4470eb64be17d9d72568efb3708933`. Ini source canonical dengan piksel yang sama seperti alias `reconstruction/references/alexia-approved-v2-blue.png` di review terdahulu. Gambar mempunyai enam arah: front, front three-quarter, kedua profile, back three-quarter, dan back. Nama alias approved tidak mengubah status README turnaround: gambar masih referensi 2D untuk tinjauan pengguna; bagian tersembunyi merupakan inferensi, bukan persetujuan mesh final atau kamera orthographic terkalibrasi.

Empat capture Nano Banana front/back/left/right juga diperiksa langsung. SHA-nya diverifikasi dan dicatat pada JSON crop. Capture tersebut adalah JPEG 584x584 dari tampilan UI. Review multiview terdahulu mencatat perbedaan skala, pose tangan, akar/volume lock rambut, patch lengan, dan warna background. Karena itu bentuk kecil pada satu capture tidak bisa dipetakan secara pasti ke segitiga V11 di kamera lain.

Pada V2, rambut belakang berupa massa bertingkat dengan lock bergelombang dan ujung curl yang meruncing. Capture back mempertahankan arah desain tersebut secara umum. Tidak terlihat objek oval kecil atau batang pendek yang mempunyai fungsi tersendiri di belakang rambut. Namun ketiadaan fitur di raster dan konektivitas terpisah **tidak membuktikan** bahwa suatu island boleh dibuang permanen: generator bisa memisahkan ujung rambut yang semestinya tersambung, dan kamera/raster dapat menyembunyikan detail.

## Komponen aktual

Bounds berasal dari vertex asli dalam koordinat model: atas +Y, depan +Z. Nilai tidak menyatakan satuan meter. Komponen 2/3/4 berada di belakang (Z negatif), sedangkan 9 di depan (Z positif). Konektivitas dan membership dibandingkan dengan audit JSON asli; semua komponen mempunyai permukaan tertutup dan terpisah dari komponen utama menurut indeks maupun koordinat identik.

| ID | Face | Center XYZ | Extent XYZ | Bentuk/lokasi aktual dan implikasi |
|---|---:|---|---|---|
| 2 | 500 | `(0,2708; -0,2763; -0,2545)` | `(0,06314; 0,07763; 0,05806)` | Blob memanjang/lumpy di ujung rambut dekat hem jaket belakang. Tidak meruncing seperti curl referensi. Penghilangan mempunyai risiko terbesar mengurangi kesan ujung rambut lokal; perlu perbandingan back dan tiga-perempat. |
| 3 | 212 | `(-0,2059; 0,4666; -0,3094)` | `(0,05765; 0,03319; 0,03552)` | Oval kecil mengambang di atas permukaan rambut belakang atas/tengah. Dari render back ini kandidat floater paling jelas; tetap diuji sebagai revisi opsional. |
| 4 | 200 | `(0,3797; 0,1116; -0,4112)` | `(0,05673; 0,01936; 0,07063)` | Sliver/sausage dekat bahu-punggung sisi +X. Bentuk memanjang terutama arah kedalaman, sehingga tampak belakang menampilkan hanya ujungnya; perlu orbit/profile untuk menilai volume lokal. |
| 9 | 8 | `(-0,0680; 0,5155; 0,3969)` | `(0,00433; 0,00452; 0,00188)` | Shard sangat kecil dekat sudut mata/poni depan sisi -X. Identitas mata vs ujung poni belum pasti; pertahankan di luar ablation rambut belakang. |

Panjang terbesar PCA dari vertex aktual masing-masing komponen adalah 0,08865 (2), 0,06394 (3), 0,08546 (4), dan 0,00445 (9). PCA memakai kovarians vertex tanpa bobot area, bukan label semantik atau pengukuran ketebalan minimum. Area permukaan 2/3/4 berturut-turut 0,010015, 0,004366, dan 0,003926 dalam kuadrat satuan model. Ukuran/area yang kecil tidak dipakai sebagai alasan tunggal untuk penghapusan.

Audit winding lama memeriksa delapan titik per island, semuanya di luar komponen utama untuk 2/3/4/9. Hasil tersebut mendukung lokasi sampel, **bukan** sertifikat seluruh permukaan luar. Tidak dilakukan klaim containment baru pada empat island ini.

## Batas dan langkah konkret

Salinan ablation hanya boleh memakai source-face membership 2/3/4 yang dicatat pada `exterior-component-review.json`. Jumlah usulan tepat 912 face. Komponen utama 1, shard 9, POSITION, dan referensi asli harus dipertahankan. Ini revisi kandidat untuk dilihat berdampingan dan dalam orbit; hasilnya boleh menunjukkan apakah detached blob mengganggu bentuk rambut, tetapi belum menetapkan maksud artistik dari referensi generatif.

Sebagian besar volume rambut, loop besar, flyaway dan permukaan yang menyerupai pita tetap termasuk komponen utama. Pengurangan tiga island tidak memperbaiki struktur itu, mata, jari yang menyatu, topology, UV, rig, atau deformasi. Kandidat belum production-ready.

## Bukti reproduksi

- `review_exterior_components.py`: pembaca GLB read-only, rekonstruksi membership, pengukuran bentuk, dan crop dokumentasi.
- `exterior-component-review.json`: source/reference hash, bounds/PCA/area, exact source-face IDs, hash membership u64 little-endian, crop coordinates, dan rekomendasi. `safe_for_automatic_removal=false`; `visual_final_approved=false`.
- `exterior-island-context.png`: crop render aktual dengan skala yang sama. Tiga island belakang dibandingkan dalam back, shard 9 dalam front. Marker sengaja diperbesar dan mengabaikan depth, sehingga marker bukan ukuran geometri. Warna mengidentifikasi komponen, bukan material.
- `reference-capture-comparison.png`: potongan raster V2 dan capture asli. Tiap panel di-fit sendiri; gambar tidak diregister atau disamakan proyeksi/pose.

Skrip tidak menghasilkan GLB. JSON memuat data face untuk membuat salinan review terpisah hanya bila root memilih melanjutkan ablation.

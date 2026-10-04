# Audit geometri aktual Alexia V11

Audit ini membaca GLB asli yang dipulihkan dari GitHub. Mesh tidak diedit, tidak dicat, tidak diregenerasi, tidak diweld, dan tidak ada island yang dihapus. Warna pada gambar hanya menunjukkan ID komponen.

- File: `alexia-v11-hunyuan21-untextured-diagnostic.glb`
- Ukuran: 8.092.808 byte
- SHA-256 file: `d0a0fea651079aa98d026a1610ef0a9e7f4c14c0c466cb1d949886df45c24a66`
- Git blob SHA-1: `bcd068f9644b82b413de6ec56ffa3978ca763368`
- SHA-256 POSITION asli: `416825b530ca4cdae092800cb917a2ffdbc5f30202f6621b58d5ce80219218e6`
- SHA-256 indices asli: `e5a321d62cdacca1924f83c966dbba454cba7edcafa444d2fc320cfe1ba1c941`
- 224.713 vertex, 449.582 segitiga, satu mesh primitive.
- Tampak depan: kamera di +Z melihat ke -Z; atas +Y; kanan gambar +X.
- Bounds XYZ: minimum `(-0,709931; -0,997710; -0,452686)`, maksimum `(0,703589; 0,988237; 0,467625)`.
- GLB hanya memiliki atribut POSITION; tidak ada UV, tekstur, material, skin, atau animasi.

Terdapat **10 komponen** pada pemeriksaan konektivitas vertex maupun edge, baik memakai indeks asli maupun koordinat identik. Komponen utama memiliki **448.244 segitiga**; sembilan island lainnya memiliki **1.338 segitiga**. Semua komponen memiliki nol boundary edge dan nol edge dengan lebih dari dua face. Hal itu tidak membuktikan bebas self-intersection, ketebalan rambut yang memadai, atau kesiapan untuk rig.

## Lokasi sembilan island

Lokasi bagian tubuh di bawah adalah interpretasi dari render aktual dan bounds. Marker lingkaran sengaja diperbesar dan ditampilkan di atas mesh: marker bukan ukuran aktual dan bukan bukti bahwa permukaan island terlihat dari kamera tersebut. Thumbnail island diperbesar dengan skala berbeda untuk setiap island.

| ID | Segitiga | Center XYZ | Lokasi pada karakter | Pemeriksaan posisi terhadap mesh utama |
|---|---:|---|---|---|
| 2 | 500 | `(0,2708; -0,2763; -0,2545)` | Belakang, ujung rambut/perbatasan hem jaket | Delapan sampel di luar; blob terlihat pada render belakang |
| 3 | 212 | `(-0,2059; 0,4666; -0,3094)` | Belakang, bagian rambut atas/tengah | Delapan sampel di luar; blob terlihat pada render belakang |
| 4 | 200 | `(0,3797; 0,1116; -0,4112)` | Belakang, rambut dekat bahu/punggung sisi +X | Delapan sampel di luar; sliver terlihat pada render belakang |
| 5 | 188 | `(0,2515; -0,2079; 0,0713)` | Area pinggang/tepi celana sisi +X | Delapan sampel di dalam mesh utama |
| 6 | 124 | `(-0,0285; 0,2556; 0,0720)` | Area pusat leher/kerah | Delapan sampel di dalam mesh utama |
| 7 | 82 | `(0,1867; -0,2009; 0,0077)` | Area pinggang/tepi celana sisi +X | Delapan sampel di dalam mesh utama |
| 8 | 16 | `(-0,1847; 0,2394; 0,0929)` | Area kerah/bahu atas sisi -X | Delapan sampel di dalam mesh utama |
| 9 | 8 | `(-0,0680; 0,5155; 0,3969)` | Depan, setinggi mata/poni dekat pusat sisi -X | Delapan sampel di luar; shard sangat kecil |
| 10 | 8 | `(-0,0591; 0,2557; 0,0816)` | Area pusat leher/kerah | Delapan sampel di dalam mesh utama |

Pemeriksaan posisi memakai generalized winding number terhadap komponen utama, pada bounds center, rata-rata vertex, dan enam pusat sisi bounds. `abs(w)>0,5` berarti titik sampel berada di dalam. Ini **bukan tes containment seluruh permukaan island**, dan self-intersection mesh utama belum diuji. Lima island mempunyai semua sampel di dalam; empat mempunyai semua sampel di luar. Seluruh island tetap berada di dalam AABB komponen utama.

Bentuk terisolasinya berupa blob, sliver, atau shard tertutup yang belum mempunyai identitas mata/jari/detail pakaian yang jelas. Hasil ini mempersempit lokasi pemeriksaan manual. **Belum ada dasar untuk menghapus sembilan island secara otomatis.** Island 2/3/4 perlu dibandingkan dengan desain rambut belakang; island 9 perlu diperiksa dekat mata/poni; island 5/6/7/8/10 perlu diperiksa sebagai fragmen interior sebelum perbaikan terpisah.

## Batas kesiapan geometri

Render aktual memperlihatkan scaffold kepala, rambut, headphone, jaket, kaki, dan sepatu yang terbaca. Namun rambut masih memiliki loop/flyaway besar dan bagian seperti pita tipis; mata abu-abu masih terbaca tertutup/kosong; tangan/jari dan batas cuff masih menyatu. Komponen utama yang menyambung luas belum merupakan daftar bagian semantik untuk rig.

V11 tetap kandidat untuk **diagnostic tekstur terbatas**, bukan karakter final, mesh production, hasil rig, atau pengganti aset game. Tekstur tidak menyelesaikan anatomi jari, ketebalan/root rambut, atau self-intersection. Sebelum rig/game diperlukan review desain multiview, perbaikan geometri yang disimpan sebagai revisi terpisah, topology/UV dan budget yang sesuai target, skeleton/weights, serta uji deformasi/animasi.

## Bukti dan alat reproduksi

- `alexia-v11-audit.json`, `.csv`, `.md`: inventaris geometri, bounds/area/edge per komponen, serta hash binary/accessor/membership.
- `alexia-v11-islands-locations.png`: render depth-tested depan/belakang dan panel isolasi dengan skala spasial yang sama.
- `alexia-v11-islands-isolated.png`: sembilan island diperbesar sendiri-sendiri.
- `alexia-v11-islands-render-evidence.json`: renderer GPU, orientasi kamera, jumlah face, dan hash sebelum/sesudah.
- `alexia-v11-island-containment-samples.json`: hasil winding number pada delapan titik per island.
- `audit_glb_components.py`, `render_glb_islands.py`, `classify_island_centers.py`: skrip read-only; audit memakai Python + numpy, render memakai ModernGL + Pillow.

Hash file sebelum dan sesudah audit/render/klasifikasi sama. Tidak ada pekerjaan rig, penggantian aset game, atau perbaikan anatomi yang diklaim selesai dari audit ini.

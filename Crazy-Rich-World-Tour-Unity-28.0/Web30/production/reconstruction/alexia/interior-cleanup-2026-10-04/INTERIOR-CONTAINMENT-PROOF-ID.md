# Bukti containment lima island interior Alexia V11

Pemeriksaan lengkap mendukung pembuatan **salinan kandidat** yang menghapus hanya komponen **5, 6, 7, 8, 10**: **418 segitiga** dengan **217 vertex yang terpakai pada komponen tersebut**. Skrip proof tidak mengedit atau mengekspor mesh. GLB asli tetap utuh. Komponen luar **2, 3, 4, 9** tidak termasuk daftar penghapusan.

Sumber tetap GLB V11 SHA-256 `d0a0fea651079aa98d026a1610ef0a9e7f4c14c0c466cb1d949886df45c24a66`. Proof awal `containment-proof.json` dipertahankan tanpa perubahan. Proof lengkap berikutnya disimpan sebagai `containment-proof-exact.json`; berisi daftar source face ID yang tepat, hash membership, hash POSITION/indices asli, seluruh hasil vertex, dan sertifikat untuk setiap triangle interior.

## Pemeriksaan seluruh vertex dan permukaan

1. Semua **217 vertex asli** diuji terhadap komponen utama. Generalized winding number semuanya sekitar 1; hasil diperkuat oleh **ray parity dengan aritmetika integer eksak** pada nilai koordinat binary float32 asli. Semua vertex mempunyai jumlah crossing ray positif yang ganjil, tanpa vertex outside atau unknown. Ray awal +X menyentuh projected edge pada 216 vertex; arah integer lain menghilangkan ambiguitas tersebut. Kontak edge tidak dihitung sembarang sebagai crossing.
2. Seluruh **418 triangle interior** dibandingkan dengan setiap **448.244 triangle komponen utama**: **187.365.992 pasangan triangle**. Setiap pasangan mempunyai axis gap AABB positif yang lebih besar dari margin konservatif `1,9859464764595032e-7` model unit. Tidak ada pasangan yang membutuhkan SAT fallback; tidak ada pasangan ambigu atau crossing.
3. Batas bawah clearance permukaan paling kecil adalah **0,0027208477258682247 model unit**. Bounds asli hanya dibaca; perhitungan gap dibulatkan konservatif ke bawah. Broad phase tidak membuang pasangan yang overlap/meragukan.
4. Komponen utama merupakan triangle cycle tertutup dengan orientasi edge konsisten: nol boundary edge, nol edge dengan lebih dari dua face, nol konflik orientasi, dan nol triangle berarea tepat nol.

| ID komponen | Vertex komponen | Triangle komponen | Semua vertex inside eksak | Batas bawah clearance permukaan |
|---|---:|---:|---|---:|
| 5 | 94 | 188 | Ya | 0,002720847726 |
| 6 | 64 | 124 | Ya | 0,013330061454 |
| 7 | 43 | 82 | Ya | 0,003944113851 |
| 8 | 10 | 16 | Ya | 0,004786640406 |
| 10 | 6 | 8 | Ya | 0,030355252326 |

Argumen untuk interior seluruh triangle: triangle adalah himpunan tersambung; vertexnya berada di wilayah interior dengan winding satu. Seluruh triangle sudah terbukti terpisah secara ketat dari permukaan utama. Winding tidak dapat berubah sepanjang path pada triangle tanpa menyeberangi permukaan utama, sehingga tidak ada bagian triangle yang keluar dari wilayah tersebut. Ini bukan kesimpulan dari ukuran island atau delapan titik sampel.

## Batas hasil

Proof mengizinkan cleanup geometri tersembunyi pada kandidat terpisah dengan source face ID yang tercatat. Proof ini belum membuktikan tidak adanya self-intersection global pada komponen utama, tidak menyelesaikan rambut/mata/jari, dan tidak menyetujui rig atau integrasi game. Empat island luar dan seluruh surface utama harus tetap dipertahankan. Exporter sebaiknya mempertahankan POSITION/nodes/scenes/accessor sumber dan hanya menambah indices terfilter; vertex interior yang menjadi unreferenced boleh tetap di buffer demi preservasi sumber.

Jika kandidat hanya menghapus 418 face yang terbukti ini, totalnya menjadi **449.164 triangle** dengan **5 komponen yang masih mempunyai face**. Jumlah vertex pada accessor asli boleh tetap **224.713**, walaupun **224.496** masih direferensikan oleh indices kandidat.

## Reproduksi

- `prove_interior_islands.py`: winding semua vertex, orientasi/closure komponen utama, dan sertifikat pemisahan semua pasangan triangle; menghasilkan `containment-proof.json`.
- `strengthen_containment_exact.py`: exact-binary rational ray parity, preservasi proof awal, dan sertifikat baru `containment-proof-exact.json`.
- Dependensi proof: Python + numpy; parser helper read-only `audit_glb_components.py` dari folder diagnostic.

Metadata `safe_for_candidate_removal=true` hanya berlaku pada source hash, lima ID komponen, dan 418 source face ID yang ditulis di proof. Seluruh pekerjaan berikutnya tetap perlu menjaga status kandidat dan menyimpan asal-usul sumber.

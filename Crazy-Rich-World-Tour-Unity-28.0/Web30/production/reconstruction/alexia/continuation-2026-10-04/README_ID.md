# Pemulihan aset dan diagnostik Alexia V11

Seluruh 10 GLB roster revision10 dan Alexia V11 sudah dibaca dari arsip GitHub Actions dan dihash ulang. Ukuran dan SHA-256 cocok dengan QA/checkpoint. Arsip sumber telah diperiksa CRC dan isinya: `source.blend`62.834.084bytes, `clips.json`, `extract_characters.py`, `build_character_demo.py`. Sumber Blender ini milik roster sculpt-v1 lama; tidak membuktikan sumber edit V11.

## Pemeriksaan geometri aktual

V11 asli: 224.713 vertex, 449.582 segitiga, SHA-256 `d0a0fea651079aa98d026a1610ef0a9e7f4c14c0c466cb1d949886df45c24a66`. Input tetap sama setelah audit/render. [Audit anatomi](ANATOMY-AUDIT-ID.md) mencatat10komponen tertutup. Sembilan island total1.338segitiga, dengan tiga blob/sliver yang terlihat di rambut belakang, shard kecil dekat mata/poni dan lima kandidat fragmen interior sekitar kerah/pinggang. Tes interior memakai delapan titik sampel per island, bukan containment seluruh permukaan. Tidak ada island dihapus.

## Uji proyeksi warna depan

Gambar conditioning JPEG584×584 asli diproyeksikan dari kamera depan+Z ke salinan mesh. File gambar, POSITION, indices asli, node dan scene dipertahankan. Tidak ada remesh, smoothing, welding atau generasi bentuk. Active index accessor dibagi menjadi dua subset material; union segitiga diuji persis sama dengan urutan/indeks sumber. BIN asli dipertahankan sebagai prefix identik.

- Hasil GLB: `front-projection/alexia-v11-front-projection-diagnostic.glb`.
- SHA-256 hasil: `032e64c6adfd6367f2bc6a92f15adc3df10ba535b6dade9f46d9b251443cd200`.
- 103.443segitiga diproyeksikan; 346.139 tetap abu-abu. Cakupan luas permukaan24,72%.
- JPEG embedded sama byte demi byte; tidak ada gambar samping/belakang baru.
- Shared POSITION pada dua primitive dapat dihitung importer dua kali:449.426loaded vertices, tetapi unique source vertices tetap224.713; face count tetap449.582.

Pemeriksaan tujuh tampak dan turntable memakai mesh GLB aktual, bukan ilustrasi baru. Fixture empat kuadran UV renderer lulus. Bukti render baru mencatat NVIDIA GTX1660SUPER dan dipisahkan dari evidence gray lama. Renderer inspeksi albedo memakai pencahayaan sederhana, bukan implementasi PBR lengkap.

Mata biru dan detail kostum cukup sejajar dari depan, tetapi warna berasal dari JPEG dengan pencahayaan baked. Model sekitar5,04% lebih lebar dari bounds referensi manual pada alignment tinggi yang sama. Hairline/headphones dan mata mempunyai lubang warna kecil karena triangle ditolak visibility; silhouette tertentu dapat sampling background abu-abu. Tampak samping memperlihatkan batas proyeksi/stretching; belakang tetap gray. Relief mata, loop rambut, cuff/jari yang menyatu dan semua island masih ada. Proyeksi tidak memperbaiki anatomi atau memberi informasi baru pada sisi tersembunyi.

**Status: front-only projection diagnostic, unapproved.** Belum full texture, belum production UV, belum rig/animasi, belum game. Accepted models tetap0; tidak ada asset client/game yang diganti.

## Reproduksi dan berkas

GLB keluaran dan PNG/GIF disertakan di paket portabel lokal. Keluaran biner diagnostik tidak ditambahkan sebagai asset gameplay di Git. Git menyimpan source V11/JPEG, selection face yang mematok hasil serta builder CPU untuk merekonstruksi GLB identik. Workflow portable membangun GLB itu dalam private artifact; tidak memakai layanan generasi AI atau GPU cloud.

Jalankan builder dari folder ini dengan Python3.10+; cukup standard library, tanpa package tambahan atau GPU:

```sh
python tools/rebuild_front_projection.py ../v11-hunyuan21-diagnostic/alexia-v11-hunyuan21-untextured-diagnostic.glb ../nano-banana-ui-review/nano-banana-front-capture.jpg --selection tools/front-face-selection.json --out front-projection/alexia-v11-front-projection-diagnostic.glb
```

Builder menolak overwrite secara default dan mematok SHA sumber/selection/hasil. Simpan hasil di path baru bila sudah ada. Audit ulang komponen bisa memakai `tools/audit_glb_components.py` dengan numpy; render isolasi memakai ModernGL/Pillow dan `tools/render_glb_islands.py`. Generator visibility asli tersedia di `tools/projection_diagnostic.py`; jalankan dari salinan di folder `work/` jika ingin melakukan eksperimen baru. Selection hasil antar renderer GPU dapat berbeda; builder selection tersimpan dipakai untuk reproduksi persis.

Bukti utama: `asset-recovery.json`, `alexia-v11-audit.json`, `alexia-v11-island-containment-samples.json`, `front-projection/projection-evidence.json`, `front-projection/alexia-v11-front-projection-diagnostic-textured-review/render-evidence.json`, `uv-renderer-fixture-evidence.json`. PNG/GIF hasil tersedia di paket lokal; script reproduksi disertakan untuk pemeriksaan di komputer lain.

Kelanjutan memerlukan keputusan desain/geometri, panduan multiview yang konsisten atau kandidat Jutsu yang dipulihkan, kemudian UV/material, rig dan uji deformasi. Audit/proyeksi ini tidak memberikan persetujuan final pengguna.

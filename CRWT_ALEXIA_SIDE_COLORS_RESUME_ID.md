# Crazy Rich World Tour â€” Alexia side colors

Lanjutkan dari `checkpoint/crazy-rich-world-tour-2026-10-06-alexia-side-colors-portable`.
Folder review: `Crazy-Rich-World-Tour-Unity-28.0/Web30/production/reconstruction/roster-side-colors-2026-10-06`. Baseline sebelumnya tetap pada `checkpoint/crazy-rich-world-tour-2026-10-05-alexia-hair-sculpt-portable`.

Ekstrak satu HTML dari `OFFLINE-GALLERY.zip`, lalu buka `BUKA-REVIEW-MODEL.html`:
Pada source Git, ZIP logis disimpan sebagai `OFFLINE-GALLERY.zip.part-01` dan
`OFFLINE-GALLERY.zip.part-02`. Helper membaca dua bagian secara berurutan di
memori, memverifikasi SHA seluruh ZIP dan CRC/ukuran/SHA satu HTML, lalu menulis
hanya HTML baru. Tidak perlu menggabungkan atau menulis ZIP logis ke disk.
```sh
python tools/restore_offline_gallery.py --archive OFFLINE-GALLERY.zip --pins source-pins.json --out BUKA-REVIEW-MODEL.html
```
HTML SHA256 `d40934e341522069d5b07a194e1410de289fe06ac7c9955b1e8eb441cffe5bf4`. Paket lokal menyertakan HTML langsung.

Hanya COLOR_0 mesh0 Alexia pada union mask rambut sisi terpilih berubah. Perbaikan modest terutama pada rambut bawah/luar. Satu stream FLOAT/VEC4 pengganti ditambahkan setelah seluruh BIN lama; hanya satu rujukan COLOR_0 berubah. Area kritis wajah/headphone/outfit, seluruh warna di luar mask dan alpha tetap byte exact. Rambut perifer yang terlihat dari front dapat ikut berubah. Awan warna uppercup/temple dan smear garment baseline masih belum terselesaikan. Seluruh POSITION/NORMAL, UV, indeks, material, seluruh atribut mesh1/2, node, gambar, rig dan klip tetap persis. Sembilan GLB lain, seluruh referensi dan 45 render lama tetap identik. Alexia memiliki lima render aktual baru. Pip mempertahankan 13 joint dan enam klip.

Untuk edit, buka `editable/Alexia-side-colors-review.blend`, berisi Alexia saja. Fingerprint setiap mesh, normal, UV, material dan COLOR diverifikasi saat save/reopen lokal. CI membaca sertifikat dan fingerprint dinamis tanpa menjalankan Blender/GPU. Representasi warna native mengikuti importer Blender. Native penuh roster tetap pada checkpoint reference-fidelity terdahulu.

Recipe, mask aktif, baseline a605 dan panduan reproduksi portabel berada di `evidence/selected-alexia/`. Gunakan perintah dengan path relatif pada panduan `recipes/portable-reproduction-usage.txt`, output baru di luar root review, dan Python3 dengan NumPy dan Pillow, sesuai panduan runner. SHA kandidat terpilih `aa2a57b3e8c15535d0b29914fdfe0b7da18289f91dbf99fce515346795394000`. Recipe tidak membaca output historis dari komputer asal.

```sh
python evidence/selected-alexia/recipes/build_side_reference_colors_shell_faded.py --source evidence/selected-alexia/source/alexia-baseline.glb --reference references/alexia-blue-v2-turnaround.png --output-parent ../alexia-side-colors-rebuilt --variant calibrated-lavender-shell-faded
```
Folder output varian harus baru. Letakkan reproduksi di luar folder review agar inventori sumber tetap sama.

```sh
git -c core.autocrlf=false clone --branch checkpoint/crazy-rich-world-tour-2026-10-06-alexia-side-colors-portable https://github.com/zetsuen1412-alt/comeplayers.git
```
Inventori ASCII merekam SHA256, ukuran dan identitas Git blob setiap sumber baru kecuali dirinya sendiri dan receipt publikasi lokal. Empat helper runtime membaca raw HEAD, memverifikasi perubahan warna terhadap GLB baseline aktual dan membangun ulang gallery ke folder baru. Publisher mempertahankan 4.376 blob repository baseline dan tujuh checkpoint terdahulu. ZIP model lokal berisi payload review; source game dan Git history berada pada branch Git yang direkam.

Model masih kandidat belum disetujui dan belum terintegrasi game. Tidak ada klaim sempurna 360 derajat. Batas rinci berada pada manifest dan proof terpilih.

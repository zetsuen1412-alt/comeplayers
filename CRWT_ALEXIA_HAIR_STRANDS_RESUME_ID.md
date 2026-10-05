# Crazy Rich World Tour — Alexia hair strands

Lanjutkan dari `checkpoint/crazy-rich-world-tour-2026-10-05-alexia-hair-strands-portable`.
Folder review baru: `Crazy-Rich-World-Tour-Unity-28.0/Web30/production/reconstruction/roster-hair-strands-2026-10-05`. Checkpoint sebelumnya tetap tersedia:
`checkpoint/crazy-rich-world-tour-2026-10-05-alexia-profile-portable`.

Ekstrak `OFFLINE-GALLERY.zip`, lalu buka `BUKA-REVIEW-MODEL.html` untuk review offline sepuluh karakter. Untuk ekstraksi dengan SHA/CRC dan tanpa menimpa berkas, jalankan dari folder review:
```sh
python tools/restore_offline_gallery.py --archive OFFLINE-GALLERY.zip --pins source-pins.json --out BUKA-REVIEW-MODEL.html
```
HTML persis: SHA256 `5f0c7df580af183aed6968c2418431c44c7f44872cbd012f61e089165a2592ec`. Paket lokal model sudah menyertakan HTML langsung.

Hanya Alexia berubah: dua volume rambut belakang berbentuk S ditambahkan, dengan 2.596 vertex dan 5.184 segitiga. Seluruh vertex, atribut, material, gambar, transform dan geometri Alexia lama dipertahankan; node induk hanya mendapat satu anak tambahan. Warna dua volume memakai sampling referensi yang lebih lembut. Sembilan GLB lain, referensi, dan 45 render lama tetap identik. Alexia memiliki lima render aktual baru. Pip tetap 13 joint dan enam klip; sembilan karakter lainnya statis.

Untuk mengedit Alexia, buka `editable/Alexia-hair-strands-review.blend`. Native ini berisi Alexia saja. Fingerprint setiap mesh, normal, UV, material dan COLOR diverifikasi saat save/reopen lokal; CI membaca sertifikat tersebut tanpa menjalankan Blender/GPU. Native memakai representasi warna importer Blender, sementara GLB float COLOR tetap dikemas persis. Workspace lengkap roster sebelumnya tetap berada dalam checkpoint reference-fidelity.

Clone source tanpa perubahan newline:
```sh
git -c core.autocrlf=false clone --branch checkpoint/crazy-rich-world-tour-2026-10-05-alexia-hair-strands-portable https://github.com/zetsuen1412-alt/comeplayers.git
```
Inventori prefix baru dan verifier menyimpan SHA256, ukuran, dan identitas Git blob setiap sumber. Workflow materialisasi membaca raw HEAD, memverifikasi geometri aktual terhadap GLB Alexia sebelumnya, serta membangun ulang gallery ke folder baru. Publisher mempertahankan 4.090 blob baseline seluruh repository; paket lokal model tidak mengklaim berisi seluruh game atau Git history.

Model masih kandidat belum disetujui dan belum terintegrasi game. Volume baru berupa aksen tertutup dengan perlekatan yang saling tumpang tindih; massa rambut lama, kedalaman tersembunyi, sebagian warna/profil lembut, rig, optimasi dan validasi visual lanjutan tetap terbatas. Tidak ada klaim sempurna 360 derajat atau sertifikasi semua interseksi.

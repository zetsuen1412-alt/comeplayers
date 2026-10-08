# Crazy Rich World Tour — checkpoint HIGH polish, 08 Oktober 2026

Alexia telah mendapat rambut samping yang lebih bulat, ujung belakang yang
lebih rapi, material pelipis lavender, kemeja ivory, kerah lipat, kalung dan
kancing emas. Permukaan jaket lama yang menonjol di belakang telah dibersihkan.
Sembilan model lain disertakan pada versi checkpoint HIGH sebelumnya.

## Pindah komputer

1. Salin `CRWT-Alexia-high-polish-checkpoint-2026-10-08.zip` dan berkas
   `.zip.sha256` ke komputer tujuan.
2. Ekstrak ZIP ke folder baru; pertahankan susunan foldernya.
3. Buka `BUKA-REVIEW-MODEL.html` dengan Chrome atau Edge untuk review offline.
   Pilih Alexia, sudut depan/samping/belakang, serta pencahayaan seimbang/hangat.
4. Pilih `IdleBreath` atau `Walk` pada menu animasi untuk melihat geraknya.
5. Untuk melanjutkan pengerjaan model, buka
   `editable/Alexia-high-polish-review.blend` di Blender.

Paket menyertakan GLB aktual, referensi 2D, render aktual, rig 19 tulang,
dua klip gerak Alexia, file Blender dan bukti pemeriksaan.

## Memeriksa atau membangun ulang

Python standar dapat memeriksa semua file, model dan bukti native:

```text
python verify_actual_checkpoint.py .
```

Pembangunan ulang dimulai dari GLB e88 yang sudah disertakan, lalu menjalankan
tiga resep baru: rambut, material pelipis, dan kemeja/pembersihan jaket.
Sembilan tahap rekonstruksi terdahulu tidak perlu dijalankan ulang.

```text
python verify_actual_checkpoint.py . --source-gate --proof-dir ../bukti-high-polish
```

Resep memerlukan NumPy. Reproduksi byte telah diperiksa pada Windows dengan
Python 3.12.14 dan NumPy 2.3.5; kecocokan byte pada runtime lain belum dinyatakan.
Gunakan folder hasil baru di luar checkpoint agar sumber tetap utuh.

## Batas kualitas saat ini

Ini versi review yang meningkat, belum aset game final. Masih ada tepi poni
yang kasar, garis gelap tipis di dekat headphone dan serpihan kecil di beberapa
ujung rambut. Rig idle/jalan masih prototipe manual; belum ada ekspresi wajah,
foot IK, simulasi rambut/pakaian atau integrasi game. Model HIGH ini juga belum
dioptimalkan untuk target perangkat game.

Video Aniimo yang dipilih menjadi acuan kerapian material, siluet rambut dan
pemisahan detail pakaian; identitas chibi Alexia tetap mengikuti referensi
karakter Crazy Rich World Tour. Catatan acuan disertakan secara terpisah.

Publikasi Git, apabila dilakukan, memiliki tanda terima terpisah dari ZIP lokal.
Status CI dan checkpoint Git sebelumnya tidak menjadi klaim pemeriksaan versi ini.

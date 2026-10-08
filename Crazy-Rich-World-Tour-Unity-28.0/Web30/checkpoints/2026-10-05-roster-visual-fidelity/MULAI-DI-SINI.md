# Checkpoint fidelity visual — 05 Oktober 2026

Seluruh 3742 blob baseline pass2 dipertahankan. Paket baru berisi sepuluh GLB aktual:
delapan revisi fidelity, Rindi dan Pip identik dengan pass2. Sembilan model tetap statis;
Pip mempertahankan 13 joint mekanis dan enam clip.

Model tetap kandidat review, belum mendapat approval visual akhir atau integrasi game.
Proyeksi warna dapat menyimpan pencahayaan gambar dan distorsi pada profil. Subdivisi
linear memperhalus sampling permukaan tanpa memulihkan anatomi atau gumpalan yang hilang.

Pada komputer lain, checkout branch
`checkpoint/crazy-rich-world-tour-2026-10-05-roster-visual-fidelity-portable`.
Verifikasi source lengkap:

```text
python Crazy-Rich-World-Tour-Unity-28.0/Web30/production/reconstruction/roster-visual-fidelity-2026-10-05/tools/verify_checkpoint.py --root . --strict-bytes
```

Galeri offline dibuat ulang CI ke direktori baru dan dicocokkan dengan hash final
`f1d134dfb67d581eef797ca4200f6dd01d2ec7cda11ba92dc91397bc21396998`. Receipt galeri yang dibekukan tetap utuh.
Untuk source ZIP, ekstrak ke folder baru lalu jalankan:

```text
python Crazy-Rich-World-Tour-Unity-28.0/Web30/production/reconstruction/roster-visual-fidelity-2026-10-05/tools/archive_source_checkpoint.py --verify-directory .
```

Untuk membuka workspace native dari clone Git atau source ZIP, satukan dua part
lebih dulu. Jalankan dari root repository dengan tujuan ZIP yang belum ada:

```text
python Crazy-Rich-World-Tour-Unity-28.0/Web30/production/reconstruction/roster-visual-fidelity-2026-10-05/tools/restore_native_archive.py --parts-dir Crazy-Rich-World-Tour-Unity-28.0/Web30/production/reconstruction/roster-visual-fidelity-2026-10-05/editable --output Crazy-Rich-World-Tour-Unity-28.0/Web30/production/reconstruction/roster-visual-fidelity-2026-10-05/editable/CRWT-fidelity-editable-roster.zip --receipt Crazy-Rich-World-Tour-Unity-28.0/Web30/production/reconstruction/roster-visual-fidelity-2026-10-05/editable/git-native-storage-receipt.json
```

`--receipt` adalah manifest INPUT. Tool memeriksa SHA setiap part, SHA ZIP penuh
`966c135bd63115bbec746c21d30ef6f1ff33d4e6bf5d195c4975da57d470199a`, serta CRC.
Setelah itu ikuti `Crazy-Rich-World-Tour-Unity-28.0/Web30/production/reconstruction/roster-visual-fidelity-2026-10-05/READ-ME-FIRST-GIT.txt`, `CURRENT-RESUME-ID.txt`, dan panduan native
yang terkait. CI memakai tujuan sementara di luar roster; source ZIP tetap
menyimpan kedua part agar snapshot seluruh repository lengkap.

Inventory baru mengecualikan dirinya sendiri; inventory pass2 lama dipertahankan
sebagai salah satu blob baseline. Tidak ada perubahan deployment atau backend.

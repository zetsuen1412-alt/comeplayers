# Lanjut Crazy Rich World Tour — fidelity visual 05 Oktober 2026

Checkpoint baru: `checkpoint/crazy-rich-world-tour-2026-10-05-roster-visual-fidelity-portable`. Semua 3742 blob sumber sebelumnya tetap utuh.

Sepuluh model 3D aktual tersedia. Delapan model menerima revisi fidelity; Rindi dan Pip mempertahankan byte pass2. Sembilan model statis; Pip memiliki 13 joint mekanis dan enam clip: Idle, Walk, Jump, Skill, Win, Lose. Semua masih kandidat review, belum mendapat persetujuan visual akhir atau integrasi game.

Warna referensi yang diproyeksikan dapat menyimpan pencahayaan gambar dan distorsi samping. Subdivisi linear memperhalus sampling permukaan, tanpa otomatis membangun anatomi yang hilang. Baca proof dan keterbatasan tiap model sebelum melanjutkan sculpt, UV, rig atau runtime.

Paket utama: `Crazy-Rich-World-Tour-Unity-28.0/Web30/production/reconstruction/roster-visual-fidelity-2026-10-05`. Inventori terbaru: `Crazy-Rich-World-Tour-Unity-28.0/Web30/checkpoints/2026-10-05-roster-visual-fidelity/inventory.json`.

Verifikasi checkout lengkap di komputer lain:

```text
python Crazy-Rich-World-Tour-Unity-28.0/Web30/production/reconstruction/roster-visual-fidelity-2026-10-05/tools/verify_checkpoint.py --root .
```

Clone Git dan source ZIP menyimpan archive native sebagai dua part di `editable/`.
Satukan dulu dari root repository, sebelum mengikuti `CURRENT-RESUME-ID.txt` atau panduan native:

```text
python Crazy-Rich-World-Tour-Unity-28.0/Web30/production/reconstruction/roster-visual-fidelity-2026-10-05/tools/restore_native_archive.py --parts-dir Crazy-Rich-World-Tour-Unity-28.0/Web30/production/reconstruction/roster-visual-fidelity-2026-10-05/editable --output Crazy-Rich-World-Tour-Unity-28.0/Web30/production/reconstruction/roster-visual-fidelity-2026-10-05/editable/CRWT-fidelity-editable-roster.zip --receipt Crazy-Rich-World-Tour-Unity-28.0/Web30/production/reconstruction/roster-visual-fidelity-2026-10-05/editable/git-native-storage-receipt.json
```

Tujuan ZIP harus belum ada. `--receipt` membaca manifest input yang dibekukan.
Tool memeriksa kedua part, SHA256 ZIP penuh
`966c135bd63115bbec746c21d30ef6f1ff33d4e6bf5d195c4975da57d470199a`, dan CRC.
Kemudian ikuti `Crazy-Rich-World-Tour-Unity-28.0/Web30/production/reconstruction/roster-visual-fidelity-2026-10-05/READ-ME-FIRST-GIT.txt` serta panduan native dalam ZIP.
CI memulihkan ZIP ke folder sementara di luar roster dan menyimpan proof verifikasinya;
source archive lengkap mempertahankan kedua part serta seluruh source baseline.

Checkpoint sebelumnya tetap tersedia: `checkpoint/crazy-rich-world-tour-2026-10-05-roster-refinement-pass2-portable`; inventori lama: `Crazy-Rich-World-Tour-Unity-28.0/Web30/checkpoints/2026-10-05-roster-refinement-pass2/inventory.json`.

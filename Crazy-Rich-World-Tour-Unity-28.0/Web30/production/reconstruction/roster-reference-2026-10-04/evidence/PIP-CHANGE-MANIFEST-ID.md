# Pip — kandidat rekonstruksi mesh dengan referensi asli

Skrip `rebuild_pip_reference_candidate.py` membuka source Blender revision 10 yang dipin SHA-256 `c2ceab85a941585bf5d6189b250646a7647893e1fe3063d80fa7faa649c4dea4`. Scene, mesh dan 60 action asli dipreservasi. Kandidat dibuat dalam scene terpisah; tidak mengubah source, runtime game, checkpoint, atau status approval.

Referensi: master kanonis `chibi_travel_adventurers_collectible_lineup.png`, SHA-256 `d3559fe6948cc5a1befffba7f779d46138517394dcb53f2deb0ce0be113c719e`, karakter bawah kolom kelima. Body Pip ialah koper robot tinggi dan companion koper kecil. Tidak ada lengan atau kaki manusia pada desain tersebut.

Perubahan nyata yang dibangun:

- Shell turquoise solid dengan corner besar dan weighted normals, lid belakang sky-blue, front panel ivory, gasket penutup dan frame gold. Rasio lebar/tinggi body utama sekitar 0,75 mengikuti master.
- Armor corner gold, rivet metal, rail gold di sisi depan kiri gambar, rail cyan di kanan gambar, hinge dan side carrying handle sebagai hardware.
- Screen hitam recessed dengan bezel putih/gold; glass sekitar 31% dan surround sekitar 36% tinggi body. Mata cyan oval dan senyum U ialah mesh emissive. Warna palette sRGB dikonversi menjadi linear pada socket Blender; emissive face memakai diffuse hitam untuk menjaga cyan.
- Pull handle: mounting blocks, lower sleeves, upper steel rails, black upper segments, rounded grip, rubber inset dan release button. Short top carrying handle dan dua plaque gold dengan slot hitam mengikuti detail crop yang terlihat.
- Empat station caster mengikuti konvensi rig sumber: stem, rounded fork, twin rubber wheels lebih tebal, alloy hubs dan axle caps. Wheel count tersembunyi tetap inference.
- Badge gold bervolume dengan blue world relief; rounded cyan/gold hollow-star patch kiri atas, coral/white hollow-star patch kanan atas, blue/white airplane patch kanan, serta star kecil kiri bawah. Lower front gold enamel mempunyai angular tile border dan seam tipis. Broad cyan lower-right corner armor dibangun sebagai geometri bervolume.
- Companion terpisah dengan shell, screen, handle, patch, badge dan caster sendiri; skala 0,47. Exact hidden detail companion tetap inference.
- Rig mekanis baru tanpa `Arm.L`, `Arm.R`, thigh atau human hand geometry. Main body, handle, wheels dan companion mempunyai kontrol terpisah.
- Satu skin dengan 13 joint mekanis. Enam action kandidat bernama Idle/Walk/Jump/Skill/Win/Lose memakai gerak mekanis; nama clip, skin, dan semua mesh node diperiksa pada GLB yang diekspor. Choreography belum approved.

Audit otomatis membandingkan posisi vertex/topology, local transforms, material assignment, group, modifier dan bone rest matrices seluruh objek lama sebelum/sesudah. Manifest hasil mencatat hash GLB/Blender, bagian geometry, sumber serta area inference. Output wajib direktori kosong; file existing tidak diganti.

Render memakai GLB aktual yang diimpor ulang ke Blender Cycles: front, 3/4, left, right, back, top, bottom dan 24 frame orbit. Pose render statis/rest; referensi PNG tidak dipakai sebagai permukaan model. Bone-display Icosphere buatan importer dikecualikan dari bounds karena bukan geometri GLB.

Bagian yang belum dibuktikan master: rear details, hidden caster count, exact globe/sticker microdetail, thickness, scale, companion behavior dan animation choreography. Rear dibuat polos tanpa screen kedua. Studio renderer tidak memakai bloom sehingga cyan emissive belum memiliki soft glow seperti master. 196 mesh parts belum dioptimalkan untuk board/mobile; runtime game belum diganti. Inspeksi visual tim memastikan identity koper+companion terbaca, namun tidak memberi approval pengguna atau menyatakan sempurna.

Riwayat review: v1 ditolak karena export scene selection menyertakan objek roster lama; v2 dan seterusnya mengunci active candidate scene dan memeriksa setiap node GLB. V3 memperbaiki axis rig; v4/v5 screen dan linear palette; v6 patch/panel detail; v7 proporsi screen, plaque depth dan cyan armor; v8 shell corner/shading dan caster thickness. Gunakan hanya target trial yang tertulis di receipt terakhir. Source original tidak diganti dan semua trial lama disimpan sebagai riwayat review.

Contoh command (path source/reference harus disuplai eksplisit):

```text
blender --background --factory-startup --disable-autoexec --python-exit-code 3 --python rebuild_pip_reference_candidate.py -- --source SOURCE.blend --reference CANONICAL.png --output-dir FRESH_DIR --confirm-reference-guided-candidate
```

# Yuna V4 — detail palet dan ferrule mengikuti permukaan asli

Kandidat ini memperjelas rim tipis di kiri/bawah palet, enam titik cat dangkal, dan bagian logam pada leher kuas. Ferrule memakai lapisan volume tipis mengikuti **68 segitiga sumber yang dibekukan**, dengan offset 0,00005–0,00050 unit. Silinder perkiraan dari V3 dibuang karena bergeser pada tampilan profil. Profil kiri/kanan V4 sudah diperiksa; lapisan kini mengikuti kuas asli.

Rim sebagian tetap membiarkan area genggaman bebas. Jari, area grip dan ujung cat kuas asli tidak diubah; **tidak ada klaim lubang ibu jari baru**. Seluruh tubuh, rambut, wajah, material dan gambar asli tetap tersimpan utuh. Detail belakang masih memerlukan perbaikan terpisah.

Hasil merupakan **kandidat review belum disetujui**, statis tanpa rig/animasi, dan belum masuk game.

- `yuna-accessory-refinement-candidate.glb`: 1.990.760 bytes, 32.908 segitiga (25.716 asli +7.192 tambahan), SHA256 `07972d86aa8fb6701d26d0a8ee94dc35170a6516c2eb72cebbb0ec947152d224`.
- `yuna-accessory-refinement-candidate.preservation-proof.json`: prefix BIN serta seluruh record geometri/material/gambar/node asli tetap utuh. Tidak ada vertex sumber dipindahkan atau face sumber dihapus. Ke-75 volume baru tertutup dan berorientasi konsisten; bagian depan/belakang cat memakai triangulasi XY berpasangan yang tidak terlipat.
- `actual-mesh-review/yuna-accessory-refinement-editable-candidate.blend`: kedua gambar 2048×2048 packed, berhasil dibuka ulang; SHA256 `f596d66b1985d358777c0f49f131e5f80cf79f8d467925e1944bc427cf9870c1`.
- `actual-mesh-review/before/` dan `after/`: empat render sebelum/sesudah dengan kamera/lampu sama.
- `../final-v4-actual-mesh-renders/`: tujuh sudut utama dan 24 frame orbit mesh GLB aktual; receipt tambahan `../FULL-RENDER-HANDOFF.json` mencatat seluruh hash gambar setelah render selesai.
- `visual-review.json`, `render-change-measurements.json`, `YUNA-HANDOFF.json`: pengamatan, ukuran, hash dan bukti rekonstruksi byte-identical.
- `../ferrule-source-face-selection.json`: daftar literal face sumber, posisi, kriteria seleksi dan hash `3999842cdbaa37929722a21a80fd329f4b6a33dfb15c79873f5a9c7ab1447d2c`.

Recipe final dari root workspace, ke direktori baru:

```powershell
python work/model-refinement-2026-10-05/yuna/build_yuna_accessory_details_v4.py --out work/model-refinement-2026-10-05/yuna/new-build-v4/yuna-accessory-refinement-candidate.glb
```

Script hanya membaca GLB/acuan/selection yang hash-nya dibekukan, menolak overwrite, lalu memvalidasi GLB. Tidak mengedit gambar atau memanggil AI/cloud. Volume merupakan detail fisik terpisah pada aksesori asli; kontak aksesori yang disengaja tidak dinyatakan bebas perpotongan global.

Gunakan **trial-v4**. Semua prototipe terdahulu dan handoff V3 tetap dipertahankan sebagai riwayat dan belum disetujui.

# Nox — kandidat perbaikan kartu pinggul

Kartu melayang di kanan penonton, tepat di bawah tangan yang memegang kelinci, kini dibangun sebagai mesh kartu tipis dengan ketebalan 0,0035 unit, sudut membulat, hati merah dan tanda sudut. Sisi belakang berupa permukaan putih nyata. Acuan hanya memperlihatkan bagian depan; ketebalan, posisi kedalaman dan sisi belakang merupakan perkiraan konstruksi manual.

Hasil ini **kandidat review yang belum disetujui**, statis tanpa rig/animasi, dan belum masuk game. Detail kelinci, jari, topi, wajah dan tekstur belakang masih memakai rekonstruksi sebelumnya.

- `nox-hip-card-accessory-candidate.glb`: model asli beserta tambahan kartu; SHA256 `0bc43f8be7f61773d6cc3a8cc67a6b3a7c907276d5e8bbd178b94ceecb175b6b`.
- `nox-hip-card-accessory-candidate.preservation-proof.json`: bukti prefix BIN serta seluruh accessor, bufferView, mesh, material, gambar, texture dan node asli dipertahankan. Seluruh 24.412 segitiga sumber tetap utuh; 1.060 segitiga ditambahkan.
- `actual-mesh-review/nox-hip-card-editable-candidate.blend`: workspace Blender yang dapat diedit, dua gambar 2048×2048 sudah packed. Berhasil dibuka ulang; SHA256 `edff8fdb5270c8aaf6a5d7573af83bc7694ec639605406c716e6f04d023cc7e1`.
- `actual-mesh-review/before/` dan `after/`: empat render mesh aktual masing-masing, dengan kamera dan lampu yang sama: depan, dua three-quarter dan belakang.
- `visual-review.json`: pengamatan visual dengan lingkup dan kekurangan yang masih tersisa.

Model sumber `outputs/model-review-2026-10-04/viewer/models/nox.glb` dan acuan `viewer/references/nox.png` tidak diubah. Kartu melayang yang sudah ada dipertahankan. Kotak pembatas seluruh mesh tambahan terpisah tegas dari kotak pembatas semua segitiga sumber; margin sumbu minimum 0,0623091 unit. Aksesori baru terdiri atas volume kartu dan ornamen terpisah; ornamen dimodelkan sebagai lapisan tinta timbul.

Rekonstruksi di direktori output baru dari root workspace:

```powershell
python work/model-refinement-2026-10-05/nox/build_nox_hip_card.py --out work/model-refinement-2026-10-05/nox/new-build/nox-hip-card-accessory-candidate.glb
```

Script memverifikasi hash sumber dan acuan, menolak overwrite, serta memvalidasi GLB hasil. Blender menggunakan script `render_editable_nox.py` untuk membuat render dan file editable di direktori baru. Jangan menimpa hasil trial-v1 yang dibekukan.

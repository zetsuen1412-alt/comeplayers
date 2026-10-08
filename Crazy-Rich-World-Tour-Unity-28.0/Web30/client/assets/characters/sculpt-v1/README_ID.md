# Crazy Rich: World Tour — 10 Model Karakter 3D

STATUS: REKONSTRUKSI DALAM PENGERJAAN, BUKAN PERSETUJUAN VISUAL FINAL.

Paket berisi sepuluh mesh 3D asli, material, tekstur tertanam, skin/skeleton, dan sumber animasi. Bukan poster atau sprite.

Karakter: Alexia, Rindi, Kairo, Luna, Nox, Atlas, Zeno, Yuna, Mochi, Pip. Pip juga memiliki koper pendamping.

## Isi
- roster.glb: seluruh karakter di papan uji 3D, 10 skin dan 10 timeline animasi.
- source.blend: sumber Blender yang bisa diedit, termasuk 60 action dan library pembentukan model.
- clips.json: rentang enam animasi tiap karakter, 30 fps.
- preview.png: render Blender atas mesh yang benar-benar dibuat, bukan ilustrasi generatif.

## Animasi
Idle, Walk, Jump, Skill, Win, Lose. GLB menyimpan keenamnya dalam satu timeline per karakter. Penampil memotong rentang yang tercantum di clips.json. Sumber Blender menyimpan action terpisah.

## Batas hasil ini
Desain poster yang disetujui tetap acuan. Bentuk saat ini adalah rekonstruksi bergeometri yang perlu pemeriksaan kemiripan wajah, rambut, pakaian, aksesori, deformasi, ekspresi dan animasi. Jangan menganggap hasil ini identik dengan poster atau aset final siap rilis.

Papan adalah papan pengujian model. File ini tidak mengganti pertandingan online, tidak menentukan ekonomi, dadu/Starwheel, kartu atau kepemilikan. Renderer lama masih menggunakan placeholder tertanam dan belum mendukung seluruh material/tekstur model ini.

## Penampil
Saat character-demo.html dan vendor tersedia, jalankan server lokal: python -m http.server 8765 --bind 127.0.0.1, lalu buka http://localhost:8765/character-demo.html. Pada Windows dapat memakai START-DEMO.bat jika Python sudah terpasang. Pilih karakter, Detail karakter, animasi, atau Jalan 1 petak.

## Lokasi pengembangan
Crazy-Rich-World-Tour-Unity-28.0/Web30/client/
Branch: codex/crazy-rich-web-v30

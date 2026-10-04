# Lanjut Crazy Rich World Tour — checkpoint roster referensi

Checkpoint utama: `checkpoint/crazy-rich-world-tour-2026-10-04-roster-reference`. Inventori: `Crazy-Rich-World-Tour-Unity-28.0/Web30/checkpoints/2026-10-04-roster-reference/inventory.json`.

Checkpoint gameplay sebelumnya tetap tersedia: `checkpoint/crazy-rich-world-tour-2026-10-04-gameplay-continuity`, commit `afa28a6d718dc70b4ecb7acc09ccc470c228c733`. Inventori lama: `Crazy-Rich-World-Tour-Unity-28.0/Web30/checkpoints/2026-10-04-gameplay-continuity/inventory.json`; seluruh byte-nya dipertahankan.

Paket ini berisi 10 model 3D aktual untuk review: Alexia, Rindi, Atlas, Kairo, Luna, Mochi, Nox, Pip, Yuna, dan Zeno. Sembilan karakter selain Pip masih statis dan belum memiliki rig. Pip memiliki 13 joint mekanis dan enam clip GLB aktual: Idle, Walk, Jump, Skill, Win, Lose. Tidak ada model yang dinyatakan sempurna atau mendapat persetujuan visual akhir; belum diintegrasikan ke game.

Bukti visual independen: `Crazy-Rich-World-Tour-Unity-28.0/Web30/production/reconstruction/roster-reference-2026-10-04/roster-independent-visual-review.json`. Hash berkas GLB, jumlah segitiga, skin/joint dan nama clip dicatat langsung dari berkas staged dalam `character_roster` inventori baru. Gambar desain 2D adalah referensi dan tidak diperlakukan sebagai render 3D. Bentuk sisi tersembunyi, detail rambut/tangan, serta kualitas tekstur tetap perlu direview menurut catatan tiap karakter.

Untuk melanjutkan di komputer lain, buka checkout dari branch checkpoint utama di atas, lalu jalankan:

```text
python Crazy-Rich-World-Tour-Unity-28.0/Web30/tools/verify_checkpoint.py --root . --manifest Crazy-Rich-World-Tour-Unity-28.0/Web30/checkpoints/2026-10-04-roster-reference/inventory.json
```

Buka penampil offline dalam folder `Crazy-Rich-World-Tour-Unity-28.0/Web30/production/reconstruction/roster-reference-2026-10-04/viewer/` jika sudah disertakan; buka workspace `.blend` yang disertakan untuk penyuntingan geometri. Mulai revisi dari model/proof terbaru di checkpoint ini. Pertahankan sumber asli dan kandidat sebelumnya; simpan revisi sebagai berkas baru.

Checkpoint gameplay lama menyimpan fitur save/restore offline dan continuity online yang sudah diverifikasi. Jangan mengganti aset runtime game dengan kandidat roster ini sebelum review visual, rig, dan integrasi selesai.

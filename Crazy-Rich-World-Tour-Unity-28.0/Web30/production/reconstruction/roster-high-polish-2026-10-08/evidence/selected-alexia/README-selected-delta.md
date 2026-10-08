# Bangun ulang delta polish dari e88

Dari folder checkpoint yang sudah diekstrak, gunakan Python + NumPy:

```text
python -B evidence/selected-alexia/recipes/rebuild_selected_delta.py --review . --contract evidence/selected-alexia/selected-delta.json --out-dir ../Alexia-polish-rebuilt --receipt ../Alexia-polish-rebuild-proof.json
```

Gunakan folder output dan berkas receipt baru di luar checkpoint. Tiga langkah ini mulai dari model e88 yang disertakan: rambut tertutup, patch material pada segitiga asli pelipis, lalu baju tertutup. Patch asli adalah permukaan terbuka dan tidak dihitung sebagai volume baru. Sembilan langkah HIGH lama tidak dijalankan. Setiap model hasil harus sama SHA256 dengan pin terpilih. Hanya runtime yang benar-benar diuji di receipt lokal yang tersertifikasi; runtime lain perlu pemeriksaan SHA sendiri. author_recipe.py dan utilitas historis disimpan sebagai provenance penulisan, bukan langkah runtime. Gerak tetap prototipe manual IdleBreath/Walk; belum persetujuan produksi atau integrasi game.

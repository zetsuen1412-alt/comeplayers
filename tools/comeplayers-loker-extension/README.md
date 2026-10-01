# ComePlayers Lowongan — browser bridge v1

Ekstensi ini memerlukan modul `/admin/lowongan` ComePlayers dan migrasi server. Bukan aplikasi mandiri. Tidak membaca cookie atau meminta password Facebook.

1. Chrome/Edge → halaman Extensions → Developer mode → Load unpacked → pilih folder ini (manifest.json harus berada di folder yang dipilih).
2. Login Facebook seperti biasa. Buka satu tab grup yang diizinkan untuk lowongan, lalu klik ikon ekstensi → Hubungkan tab Facebook ini.
3. Buka ulang dashboard ComePlayers `/admin/lowongan`, isi banner/teks, tujuan dan WhatsApp. Simpan sebelum START. Pertahankan kedua tab terbuka.
4. JEDA/STOP di ComePlayers menghentikan antrean server berikutnya. STOP di popup hanya menghentikan browser. Kiriman yang sudah diterima Facebook tidak ditarik otomatis.

Grup memakai selector DOM eksperimental. Belum diuji dengan akun Facebook nyata. Jangan menganggap hasil berhasil hanya karena teks masuk ke editor. Jika selector berubah, hasil ambigu atau pemeriksaan keamanan muncul, sistem berhenti dan meminta pemeriksaan, tanpa bypass atau retry buta.

Pemulihan worker terputus: periksa riwayat ComePlayers dan halaman Facebook dahulu. Setelah hasil diperiksa, popup dapat menghapus penanda tugas lokal terputus; ini tidak menghapus log server atau mengirim ulang tugas lama.

Uji DOM offline opsional (Python + Playwright + Chromium):

```sh
CHROMIUM_PATH=/path/to/chromium python tests/browser-fixtures.py
```

Uji hanya menjalankan HTML sintetis pada about:blank. Tidak membuka Facebook, tidak membuktikan kompatibilitas Facebook nyata. Panduan server lengkap: `docs/LOKER_FACEBOOK_V1.md` di root repository.

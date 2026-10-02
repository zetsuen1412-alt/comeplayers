# Rindi — draft turnaround untuk tinjauan visual

Kandidat saat ini: **`turnaround-imagegen-v5.png`**. Ini gambar referensi 2D, belum mesh 3D dan belum disetujui pengguna.

Urutan panel tiga kolom × dua baris:

| Baris | Kiri | Tengah | Kanan |
|---|---|---|---|
| Atas | Front | Front three-quarter | Left |
| Bawah | Right | Back three-quarter | Back |

Master adalah karakter pink kedua dari kiri pada baris atas lineup yang disetujui, di `../../references/chibi_travel_adventurers_collectible_lineup.png`. Hash master dan kandidat tersimpan di `review-2026-10-02.json`.

Analisis referensi berhasil melalui Gemini 3.8 Flash. Dua percobaan turnaround Gemini tidak menghasilkan gambar: pertama format enum pada konektor salah, kemudian setelah diperbaiki kuota gambar proyek Google bernilai 0. Konektor sudah diperbaiki dan Preview lulus pemeriksaan MCP.

Draft gambar dibuat memakai **built-in imagegen**. Prompt lengkap tiap iterasi disimpan pada `imagegen-prompt-v1.txt` sampai `imagegen-prompt-v5.txt`. V1–V2 memiliki panel atas/bawah dengan proyeksi yang tidak terverifikasi dan tidak dipakai sebagai referensi geometri. V3 salah menempatkan tas pada panel belakang tiga-perempat; V4 memperbaiki posisi tas; V5 menghapus sisa strap lama.

Prompt lengkap: [V1 — master delapan view](imagegen-prompt-v1.txt), [V2 — sudut kamera](imagegen-prompt-v2.txt), [V3 — enam view](imagegen-prompt-v3.txt), [V4 — letak tas](imagegen-prompt-v4.txt), [V5 — pembersihan strap](imagegen-prompt-v5.txt).

Pemeriksaan langsung pada V5 mencakup proporsi wajah/tubuh, mata ruby, volume twin-tail pink dan pita merah, jaket, rok plaid, sepatu, tas di sisi kanan tubuh dan kelinci di sisi kiri. Kedua mata dibuat terbuka untuk pose netral; master asli memakai ekspresi wink. Konstruksi belakang yang tidak terlihat pada master masih merupakan inferensi. Sudut kamera gambar generatif tidak menjamin kalibrasi orthographic yang presisi.

Pengguna perlu menilai desain kandidat ini sebelum rekonstruksi. Persetujuan draft bukan persetujuan mesh final. Aset 3D harus tetap melewati pemeriksaan volume 360°, material dan deformasi animasi, hash GLB yang sama pada viewer/game, screenshot papan, serta klip Idle/Walk/action. View atas/bawah wajib diperiksa pada mesh nyata. Tidak ada aset game yang diganti dan model procedural/sculpt yang ditolak tidak menjadi hasil rebuild ini.

# Buka Crazy Rich 30.0 di Unity 6

1. Buka **Unity Hub**.
2. Pasang **Unity 6.0 LTS 6000.0.84f1**, sesuai ProjectVersion.txt. [Rilis resmi dan installer](https://unity.com/releases/editor/whats-new/6000.0.84f1).
3. Untuk Android, pasang modul **Android Build Support + SDK/NDK + OpenJDK** dari Unity Hub.
4. Klik **Add project from disk** dan pilih folder `Crazy-Rich-World-Tour-Unity-28.0`.
5. Tunggu compile + Package Manager selesai.
6. Scene akan dibuat otomatis. Jika belum, klik menu **Crazy Rich > 30.0 > Setup Project**. Setup mempertahankan scene yang sudah ada dan tidak menutup pekerjaan scene yang belum disimpan.
7. Buka `Assets/CRWT/Scenes/CRWT_Bootstrap.unity`.
8. Jalankan **Crazy Rich > 30.0 > Verify Project**, lalu tekan **Play**. Tunggu karakter selesai dimuat dari StreamingAssets.

Build cepat:
- **Crazy Rich > 30.0 > Build Windows**
- **Crazy Rich > 30.0 > Build Android APK**

Pilih platform aktif yang sesuai di Build Profiles sebelum memakai menu. Android menghasilkan APK ARM64/IL2CPP; Unity Hub memerlukan Android SDK/NDK/OpenJDK. Script berikut memilih platform untuk batch build:

```powershell
pwsh -File tools/Invoke-Unity.ps1 -Task Verify
pwsh -File tools/Invoke-Unity.ps1 -Task PlayMode
pwsh -File tools/Invoke-Unity.ps1 -Task Windows
pwsh -File tools/Invoke-Unity.ps1 -Task Android
```

Jika Editor berada di lokasi lain, tambahkan `-EditorPath 'D:/Unity/Editor/Unity.exe'` dengan path yang benar, atau set `UNITY_EDITOR_PATH`. Script memeriksa versi sebelum membuka proyek dan menolak patch yang berbeda dari ProjectVersion.txt. Script juga memeriksa proses dan laporan unik yang ditulis oleh metode Unity; exit 0 hanya jika metode benar-benar sukses, exit 1 gagal, exit 2 Editor tidak tersedia. Jika Editor mengembalikan 198 dengan pesan lisensi tidak ditemukan, laporan berstatus `license_required` (exit script tetap 1) dan meminta aktivasi di Hub. Log berada di `Logs/` dan build di `Builds/`; keduanya tidak masuk Git.

Package Manager memerlukan internet saat pertama kali memasang glTFast 6.14.1, uGUI, Newtonsoft JSON, dan dependency terkait. Setup memasukkan shader glTF/Standard, mengatur dua texture UI, dan menambahkan binding Input Manager yang belum ada. Pipeline memakai built-in renderer. Jangan mengganti ke URP/HDRP tanpa QA shader tambahan.

`PlayMode` menjalankan smoke test pada scene terisolasi dengan snapshot fixture tetap: inisialisasi HUD, enam GLB dan clip, shader, dua Starwheel, menunggu hasil, ZERO tetap di tempat, 0+5 berjalan lima tile, snapshot duplikat, serta cleanup. Fixture hanya berada di folder Editor, tidak dikirim dalam build atau ke Supabase. Task ini memerlukan perangkat grafis; jangan menambahkan `-nographics` atau `-quit`. Hasil ada di `Logs/unity-playmode-smoke.json`; PNG papan ditulis hanya jika tahap render tercapai. Ini tidak menggantikan QA multiplayer, UI sentuh, atau perangkat Android.

Nama folder asal 28.0 tetap dipertahankan. Pada 30 September 2026, pemasangan Hub 3.21.3, Editor 6000.0.84f1, dan Android Build Support dengan OpenJDK/SDK/NDK berhasil; hambatan administrator sebelumnya sudah teratasi. Editor pada mesin ini berada di `C:/Users/kafka/Unity/Hub/Editor/6000.0.84f1/Editor/Unity.exe`, dan proyek sudah terdaftar di Hub. Percobaan Verify berhenti pada pemeriksaan lisensi (exit 198, `No valid Unity Editor license found`); percobaan berikutnya terhenti pada koneksi layanan lisensi. Selesaikan login dan aktivasi lisensi yang sesuai di Hub sebelum menjalankan kembali Verify. Compile melalui Editor, Play Mode serta APK/EXE 30.0 belum diverifikasi. Ikuti [QA 30.0](QA_30_ID.md) untuk pengujian perangkat. Pengujian source di GitHub tidak menggantikan langkah ini.

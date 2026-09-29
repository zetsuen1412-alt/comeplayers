# Buka Crazy Rich 30.0 di Unity 6

1. Buka **Unity Hub**.
2. Pasang **Unity 6.0 LTS 6000.0.84f1**, sesuai ProjectVersion.txt. [Rilis resmi dan installer](https://unity.com/releases/editor/whats-new/6000.0.84f1).
3. Untuk Android, pasang modul **Android Build Support + SDK/NDK + OpenJDK** dari Unity Hub.
4. Klik **Add project from disk** dan pilih folder `Crazy-Rich-World-Tour-Unity-28.0`.
5. Tunggu compile + Package Manager selesai.
6. Empat scene bawaan sudah disertakan. Menu **Crazy Rich > 30.0 > Setup Project** memvalidasinya dan memulihkan scene yang hilang. Jika scene bawaan hilang sementara scene tanpa nama berisi pekerjaan Anda, simpan pekerjaan itu lebih dahulu; setup berhenti tanpa mengubahnya.
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

Package Manager memerlukan internet saat pertama kali memasang glTFast 6.14.1, uGUI, Newtonsoft JSON, dan dependency terkait. Setup menyertakan shader glTF dan material `Resources/Materials/CRWT_Standard.mat`, mengatur dua texture UI, serta menambahkan binding Input Manager yang belum ada. Papan dan karakter fallback memakai clone material Standard opaque dengan instancing; seluruh varian Standard tidak lagi dimasukkan lewat Always Included. Pipeline memakai built-in renderer. Jangan mengganti ke URP/HDRP tanpa QA shader tambahan.

`PlayMode` menjalankan smoke test pada scene terisolasi dengan snapshot fixture tetap: inisialisasi HUD, enam GLB dan clip, shader, dua Starwheel, menunggu hasil, ZERO tetap di tempat, 0+5 berjalan lima tile, snapshot duplikat, serta cleanup. Fixture hanya berada di folder Editor, tidak dikirim dalam build atau ke Supabase. Task ini memerlukan perangkat grafis; jangan menambahkan `-nographics` atau `-quit`. Hasil ada di `Logs/unity-playmode-smoke.json`; PNG papan ditulis hanya jika tahap render tercapai. Ini tidak menggantikan QA multiplayer, UI sentuh, atau perangkat Android.

Nama folder asal 28.0 tetap dipertahankan. Hub, Editor 6000.0.84f1, dan modul Android terpasang; lisensi Personal aktif pada 30 September 2026. Editor lokal: `C:/Users/kafka/Unity/Hub/Editor/6000.0.84f1/Editor/Unity.exe`. Kompilasi, Verify, dan Play Mode lulus. Jika Hub menampilkan lisensi aktif tetapi batch mencatat `Connection to channel LicenseClient-kafka refused`, jalankan dari terminal Windows dengan akses IPC normal; lingkungan proses terisolasi dapat menghalangi layanan lisensi. Ikuti [QA 30.0](QA_30_ID.md) untuk hasil build dan pengujian perangkat.

Paket uji lokal tersedia di `Builds/Distributions/`: ekstrak seluruh `Crazy-Rich-World-Tour-30.0-Windows.zip`, kemudian jalankan EXE di dalamnya. `Crazy-Rich-World-Tour-30.0-Android.apk` adalah APK ARM64 dengan sertifikat debug, min SDK 23 dan target SDK 36. Paket serta file checksum tidak masuk Git; hasil verifikasinya ada di `QA/30.0/build-verification.json`. Build Windows dan APK telah lulus, tetapi QA multiplayer dan perangkat Android fisik belum selesai.

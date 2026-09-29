# Crazy Rich: World Tour — Unity 28.0 QA

## Lulus pemeriksaan paket
- Struktur project Unity 6 lengkap: `Assets`, `Packages`, `ProjectSettings`.
- 13 file C# runtime/editor melewati pemeriksaan leksikal statik: kurung/brace seimbang, tidak ada duplicate type yang bermasalah.
- Semua JSON pada paket berhasil diparse.
- 6 file karakter GLB v23 tervalidasi sebagai glTF binary v2 dengan ukuran header yang sesuai.
- 55 profil landmark dibawa ke `StreamingAssets`.
- Environment dan Weather manifest dibawa ke `StreamingAssets`.
- Tidak ada `service_role` key pada source Unity. Client hanya memakai Supabase publishable key + access token user.
- Client memiliki auto-refresh session saat RPC mendapat HTTP 401 dan refresh token masih valid.
- Kamera foundation mendukung drag mouse, mouse-wheel zoom, touch rotate, dan pinch zoom.
- Legacy Web 27.0 tetap dibundel sebagai fallback/reference QA selama migrasi.

## Backend contract
Signature RPC utama diverifikasi langsung terhadap project Supabase aktif sebelum source Unity dikemas, termasuk auth-facing room flow, match snapshot, roll, property actions, auction, liquidation, travel/festival, skill/card, bot/timeout, result, dan rematch.

## Authority
Saat online, Unity tidak menentukan RNG dadu, cash, rent, property ownership, auction result, bankruptcy, atau winner. Semua state itu tetap berasal dari backend `crwt_*`.

## Belum dapat diverifikasi di environment ini
Unity Editor/Unity Build Support tidak terpasang di container QA. Karena itu **APK/EXE 28.0 belum dikompilasi atau diuji di perangkat** dari environment ini. Compile pertama perlu dijalankan pada mesin dengan Unity 6.

## Batas 28.0
- Pawn Unity masih procedural fallback; model GLB sudah dibawa tetapi belum dihubungkan ke Animator/Humanoid production rig.
- UI adalah production foundation, belum final art pass.
- Travel UI foundation memakai target cepat +8 tile; destination picker penuh belum dipindahkan.
- RPC Card sudah tersedia di network layer, tetapi HUD targeting card kompleks belum dipindahkan penuh.

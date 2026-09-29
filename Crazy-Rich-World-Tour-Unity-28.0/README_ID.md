# Crazy Rich: World Tour — Unity Production Client 28.0

Versi 28.0 memulai migrasi client dari HTML/WebGL prototype ke **Unity 6**, tanpa mengganti backend Supabase yang sudah server-authoritative.

## Cara membuka
1. Install Unity Hub dan Unity 6, dengan modul Windows Build Support dan/atau Android Build Support.
2. `Add project from disk` lalu pilih folder ini.
3. Tunggu Package Manager selesai memasang `uGUI` dan `Newtonsoft JSON`.
4. Script `CrwtProjectSetup` otomatis membuat empat scene: `CRWT_Bootstrap`, `CRWT_Login`, `CRWT_Lobby`, `CRWT_Match`.
5. Buka `Assets/CRWT/Scenes/CRWT_Bootstrap.unity` lalu tekan Play.

Jika scene belum dibuat otomatis, pilih menu **Crazy Rich > 28.0 > Setup Project**.

## Yang sudah dipindahkan
- Supabase email/password auth + signup.
- Progression bootstrap.
- Create room, join room, quick match, ready, bot, start match, resume room.
- Polling snapshot server-authoritative.
- Roll, buy, upgrade, takeover, auction, liquidation, travel, festival, skill, timeout/bot hooks.
- Result + rematch v27.
- Papan 32 tile 3D Unity procedural, pion 3D, property/building visualization dari server state, orbit camera, HUD responsive.
- Offline 3D visual demo untuk membuka client tanpa akun.

## Penting
Unity client **tidak menghitung RNG, cash, rent, ownership, bankruptcy, atau winner** saat online. Semua keputusan gameplay tetap berasal dari RPC server. Demo offline hanya untuk melihat renderer/UI.

## Asset
Model GLB karakter v23 disimpan di `Assets/StreamingAssets/Characters`. Unity project ini belum memuat GLB tersebut ke rig final; 28.0 memakai pawn procedural sebagai fallback yang langsung dapat dijalankan. Tahap berikutnya mengganti pawn dengan FBX/GLTF runtime/import pipeline final.

## Legacy Web
Folder `LegacyWeb27` mempertahankan client 27.0 sebagai referensi/fallback QA selama migrasi Unity berlangsung.

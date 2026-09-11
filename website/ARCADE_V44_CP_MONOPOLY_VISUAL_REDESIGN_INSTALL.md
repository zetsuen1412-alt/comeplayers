# ComePlayers Arcade V44 — CP Monopoly Visual Redesign

## Tujuan
Mengubah CP Monopoly dari papan gelap dan datar menjadi board-game mobile 2.5D yang cerah, berkarakter, dan tetap memakai identitas asli ComePlayers.

## Perubahan
- Papan 2.5D dengan perspektif, ketebalan, bayangan, dan efek hover.
- 40 petak dibuat sebagai kartu kota berwarna dengan ikon landmark.
- Rumah dan hotel tampil sebagai bangunan mini di atas petak.
- Token pemain dibuat seperti pion 3D dan bergerak mengambang.
- Alexia tampil sebagai host di tengah papan dan layar pemilihan mode.
- HUD pemain baru dengan avatar, uang, aset, net worth, status giliran, serta status detention.
- Kota mini dan pulau hijau di tengah arena.
- Dadu glossy 3D dengan animasi bounce/rotate saat rolling.
- Layout responsif untuk desktop dan Android.
- Seluruh logika V43, online room, matchmaking, NPC, trade, auction, mortgage, houses/hotel, autosave, serta audio tetap dipertahankan.

## Instalasi
Ekstrak ZIP ke folder utama proyek:

```text
C:\Comeplayers-new
```

Pilih **Replace files**, lalu jalankan:

```powershell
cd C:\Comeplayers-new\website
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
npm run build
npm run dev
```

Tidak ada migration Supabase baru untuk V44.

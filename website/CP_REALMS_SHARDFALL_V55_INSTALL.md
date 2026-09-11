# ComePlayers V55 — CP Realms: Shardfall

CP Realms: Shardfall adalah vertical slice action-MMORPG online original untuk ComePlayers. Game dibuka sebagai mini-window di atas Messages & Chat dan tidak menyalin aset, peta, nama, atau kode dari game lain.

## Fitur versi V55

- Dunia top-down 2.5D berukuran besar dengan beberapa zona.
- Dua faction: Gold Vanguard dan Cyber Legion.
- Empat class: Vanguard, Ranger, Arcanist, dan Oracle.
- Realtime public realms hingga 24 pemain.
- Global Quick Match dan daftar realm publik.
- Solo Expedition tanpa database online.
- WASD, mouse, keyboard ability, touch, dan tombol ability Android.
- Creature AI, world boss, loot, potion, crystal, XP, level, gold, dan quest berulang.
- Faction PvP dasar, health/mana, respawn, ability cooldown, realtime chat, minimap, sound FX, dan high score.
- Canvas neon original dengan lighting, particle effects, faction citadels, biome, dan HUD premium.

## Instalasi

1. Ekstrak ZIP ke `C:\Comeplayers-new` dan pilih Replace files.
2. Jalankan seluruh isi file SQL berikut pada Supabase SQL Editor:

   `website/supabase/migrations/20260715153000_arcade_cp_realms_shardfall_v55.sql`

3. Build website:

```powershell
cd C:\Comeplayers-new\website
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
npm run typecheck
npm run build
npm run dev
```

4. Buka `/messages`, pilih `Games`, lalu `CP Realms: Shardfall`.

## Catatan arsitektur

- Lobby dan membership disimpan di PostgreSQL/Supabase.
- Posisi pemain, ability, PvP hit, chat, dan efek realtime memakai Supabase Realtime Broadcast.
- Solo Expedition dapat dimainkan tanpa migration.
- V55 adalah vertical slice client-authoritative. Untuk skala MMORPG produksi dengan ekonomi persisten, anti-cheat kuat, ribuan pemain, guild, dungeon, dan shared enemy state, tahap berikutnya perlu authoritative game server khusus.

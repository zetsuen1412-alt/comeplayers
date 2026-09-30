# Crazy Rich: World Tour — Web 30.0

Folder ini adalah **source of truth** Crazy Rich: World Tour untuk target:

- Website browser
- Android (PWA / APK wrapper)
- PC Windows (PWA / desktop wrapper)

Backend gameplay tetap Supabase dan server-authoritative. Client Web/Android/PC tidak boleh menentukan hasil Starwheel, economy, ownership, card effect, skill, timeout, atau winner secara lokal.

## Struktur

- `client/` — launcher, offline preview, online renderer WebGL/Three.js, GLB characters, environment/landmark assets.
- `pwa/` — manifest, service worker, dan bootstrap instalasi.
- `integration/` — Next.js route/shell untuk ComePlayers.
- `tools/publish.mjs` — sinkronisasi source project ke `website/`.

## Publish ke website

Dari root repository:

```bash
node Crazy-Rich-World-Tour-Web-30.0/tools/publish.mjs
```

Untuk hanya mengecek apakah website masih sinkron:

```bash
node Crazy-Rich-World-Tour-Web-30.0/tools/publish.mjs --check
```

Target publish:

- `website/public/games/crazy-rich-world-tour/client/`
- `website/public/games/crazy-rich-world-tour/sw.js`
- `website/public/crazy-rich-world-tour/manifest.webmanifest`
- `website/public/crazy-rich-world-tour/install.js`
- `website/app/games/crazy-rich-world-tour/CrazyRichGameShell.tsx`
- `website/app/games/crazy-rich-world-tour/page.tsx`

## Kontrak Starwheel

- d1/d2: 0–6
- total: 0–12
- 0+0: tetap di tile sekarang
- 0 adalah genap
- 0+0 adalah doubles; extra roll ditentukan server
- `roll_id` adalah identitas authoritative untuk mencegah replay cinematic
- timeout client hanya memanggil RPC server; tidak boleh generate roll lokal

## Branch aktif

`codex/crazy-rich-web-v30`

PR: #34

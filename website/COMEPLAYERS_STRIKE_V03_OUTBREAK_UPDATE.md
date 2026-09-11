# ComePlayers Strike — Outbreak Update 0.3

## Fokus update

Update ini memperluas prototype browser FPS ComePlayers Strike dengan map industrial yang lebih detail dan dua pengalaman zombie yang berbeda. Implementasinya orisinal dan tidak menyertakan kode, model, suara, map, atau aset proprietary dari Counter-Strike Online.

## Map dan environment

- Arena diperbesar menjadi distrik industrial dengan jalan utama dan terrain sisi yang tidak rata.
- Bangunan bertingkat dengan jendela emissive, container bertumpuk, kendaraan, barikade, pipa, puing, lampu jalan, drone, gerbang karantina, terminal, serta kompleks reaktor.
- Objective beacon dinamis berpindah mengikuti objective mode.
- Environment memiliki animasi rotor drone, reactor core, lampu berkedip, beam objective, dan gerbang yang terbuka selama Adventure.
- Preset Low menyembunyikan dekorasi kecil dan menurunkan pixel ratio/fog workload.

## Zombie Survival

- Delapan wave, bukan lima.
- Walker: musuh standar.
- Runner: lebih cepat dengan health lebih rendah.
- Spitter: serangan toxic jarak menengah.
- Brute: lambat, besar, dan tahan damage.
- Outbreak Colossus: final boss dengan health besar dan shockwave area attack.
- Mini-boss pada wave tertentu dan resupply antargelombang.

## Zombie Adventure

Lima chapter objective-based:

1. Secure the Arrival Yard.
2. Hack the Quarantine Gate dengan menahan tombol E.
3. Clear the Quarantine Corridor.
4. Activate the Reactor Purge dengan menahan tombol E.
5. Defeat the Outbreak Colossus dan seluruh infected tersisa.

HUD menampilkan chapter, objective distance, interaction progress, serta boss health bar.

## File utama yang berubah

- `components/strike/StrikeGame.ts`
- `components/strike/ComePlayersStrike.tsx`
- `components/strike/strike.module.css`
- `app/games/comeplayers-strike/page.tsx`
- `app/play/comeplayers-strike/page.tsx`
- `public/strike/mode-adventure.png`

## Menjalankan

```bash
cd Comeplayers-new/website
npm install
npm run dev
```

Buka `http://localhost:3000/play/comeplayers-strike`.

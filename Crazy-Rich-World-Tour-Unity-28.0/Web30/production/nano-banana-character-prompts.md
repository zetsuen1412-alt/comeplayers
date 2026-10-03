# Prompt Nano Banana — Crazy Rich: World Tour

Paket ini meminta **referensi raster** untuk rekonstruksi karakter. Gambar tidak menjadi GLB, mesh, rig, animasi, atau bukti bahwa karakter sudah masuk game. Tidak ada generasi/API atau biaya yang dijalankan oleh paket ini.

Dasar: [inventaris desain](character-design-inventory-2026-10-03.json), master `chibi_travel_adventurers_collectible_lineup.png` (SHA-256 `d3559fe6948cc5a1befffba7f779d46138517394dcb53f2deb0ce0be113c719e`) dan handoff branch `codex/crazy-rich-web-v30`, commit `fbdb1e36ecb9ee3fc07aaed9072441285ba683b9`.

Master tidak berlabel. Posisi Alexia dan Rindi dikonfirmasi catatan proyek; nama delapan karakter lainnya dipetakan mengikuti urutan roster. Detail sisi/punggung yang tidak tampak tetap **usulan inferensi**, bukan desain yang sudah dibuktikan.

Referensi untuk dilampirkan: [master lineup](https://github.com/zetsuen1412-alt/comeplayers/blob/codex/crazy-rich-web-v30/Crazy-Rich-World-Tour-Unity-28.0/Web30/production/references/chibi_travel_adventurers_collectible_lineup.png), [Alexia V2 biru](https://github.com/zetsuen1412-alt/comeplayers/blob/codex/crazy-rich-web-v30/Crazy-Rich-World-Tour-Unity-28.0/Web30/production/turnarounds/alexia/turnaround-blue-imagegen-v2.png), [Rindi V5 — draft](https://github.com/zetsuen1412-alt/comeplayers/blob/codex/crazy-rich-web-v30/Crazy-Rich-World-Tour-Unity-28.0/Web30/production/turnarounds/rindi/turnaround-imagegen-v5.png).

## Cara menggunakan

1. Lampirkan master kanonis. Untuk Alexia, lampirkan juga **turnaround V2 mata biru** sebagai jangkar aktif. Rindi V5 boleh menjadi pembanding, tetapi masih draft.
2. Salin **prompt master + modifier karakter + satu suffix view** ke editor gambar Gemini/Nano Banana. Buat front dahulu; gunakan front yang konsisten sebagai jangkar tambahan untuk view berikutnya. Satu panggilan menghasilkan satu gambar, bukan sheet panel.
3. Untuk prop, salin **prompt prop + deskripsi satu aset + satu suffix prop**. Pisahkan badan, koper/tas, alat dan companion agar tidak menyatu saat rekonstruksi.
4. Pakai kanvas persegi dan framing/scale yang sama antar view karakter. Prompt meminta ortografik; inspeksi hasil untuk memastikan skala, sisi anatomis dan perspektif benar.
5. Gunakan akses gratis yang tersedia pada akun. Kuota dan ketersediaan model diperiksa pada antarmuka sebelum generasi. File [JSON](nano-banana-character-prompts.json) berisi **40 prompt body lengkap** serta prompt prop lengkap agar dapat langsung disalin.

Pose berdiri netral yang diminta adalah adaptasi draft untuk rekonstruksi. Wajah/ekspresi sumber tetap dipertahankan; membuka mata Atlas atau mengubah wink memerlukan desain lanjutan karena belum terlihat pada master. Catat inferensi di metadata/nama file, tanpa menambah label pada gambar.

## Prompt master body

```text
Use the attached source image(s) as the visual authority for Crazy Rich: World Tour. Isolate ONLY the target character identified below. Preserve the source's detailed anime-chibi collectible style, facial silhouette, eye shape/expression, layered hair volumes, clothing construction, shoes, hardware and proportions. Do not substitute a generic doll or a photorealistic person.

Generate ONE individual, full-body reference view of the same character, using the requested orthographic camera angle. Use a fixed square canvas and identical subject scale, pose, framing and soft diffuse lighting across all four views; fit the entire silhouette with safe margins. The requested neutral pose is a reconstruction draft adaptation, not a new character design. Keep wearable costume parts specified below. Remove exactly the detachable props specified below, including their loose straps and every disconnected remnant. Resolve newly revealed areas with the smallest plain continuation of the observed garment.

Use one flat, uniform light-gray background: no horizon, floor, ground plane, pedestal, display disc, cast/contact shadow, border or panel grid. No suitcase wheels or handles may remain on a body-only character. No labels, text, watermark, added logos, duplicate characters or extra decorations. The only exception is Pip: its own case, wheels and handle ARE its anatomy.

For surfaces absent from the source, propose only conservative continuation of established shapes, colors and material boundaries. Do not invent rear emblems, prints, pockets, complex seams or mechanisms. Such hidden surfaces are unverified inference and require consistency inspection. Never mirror an asymmetrical design to fake another view. Output a raster concept reference only; this prompt does not produce a mesh, rig or GLB.
```

## Empat suffix view — satu per gambar

**front**

```text
VIEW: FRONT. Camera faces the front of the character, level with the body. Show the full frontal silhouette with no perspective foreshortening. Keep anatomical left/right assignments; image-right is character-left in a straight front view.
```

**back**

```text
VIEW: BACK. Rotate the SAME character 180 degrees relative to the front reference while keeping the same pose and scale. Show the true back, not a mirrored frontal face. Preserve asymmetries; image-left is character-left in a straight back view. Do not introduce unsupported rear artwork or a second face.
```

**left**

```text
VIEW: ANATOMICAL LEFT SIDE. Camera faces the character's own LEFT side at exactly 90 degrees from the front. Show its left-side silhouette with no three-quarter perspective, no mirroring and no pose change.
```

**right**

```text
VIEW: ANATOMICAL RIGHT SIDE. Camera faces the character's own RIGHT side at exactly 90 degrees from the front. Show its right-side silhouette with no three-quarter perspective, no mirroring and no pose change.
```

## Modifier per karakter

Tempel satu modifier berikut di antara master dan suffix view. Headphone, goggles, topi, cape atau scarf tetap sebagai bagian tampilan kostum pada raster body; saat produksi mesh, komponen tersebut perlu tetap teridentifikasi dan diberi rig yang sesuai.

### Alexia — top row, first figure from left

```text
TARGET: Alexia, top row column 1. If supplied, Alexia blue-eye turnaround V2 is the active supporting reference. BLUE eyes are mandatory. Preserve the small closed smile, long layered silver-lavender hair, face-framing bangs and high tied hair mass seen in the source; do not replace it with invented twin pigtails. Keep the large black/white/gold over-ear headphones with dark pads, black/white jacket with gold trim and hardware, white buttoned shirt, dark shorts, black/gold belt, black fingerless gloves, dark ankle socks and chunky black/white/amber-gold sneakers with white laces.

BODY-ONLY: Remove the navy suitcase completely, including its pull handle, wheels, gold star and all shadows/remnants. Keep both arms relaxed slightly away from the torso and both feet flat in a neutral standing draft. Preserve hair, headphones, face, costume and body proportions from V2. Do not add new back emblems or alter trim.
```

Mata biru terkunci; override merah tidak aktif. Koper wajib GLB terpisah, pada kiri anatomis Alexia.

**Prop terpisah:**

- **navy-star-suitcase:** `Alexia's navy hard-shell rolling suitcase, gold edge/corner trim and handle hardware, small wheels, ONE large gold star on the FRONT broad face. Keep rear face plain navy with conservative gold trim as in V2. No star on the rear. It will later attach beside Alexia's anatomical LEFT leg: image-right in front, image-left in back. Generate the suitcase alone; no body or floor.` Detail belum diketahui: Unseen internal hardware and tread.

### Rindi — top row, second figure from left

```text
TARGET: Rindi, top row column 2. Use the master lineup as the identity source. Preserve candy-pink large curled twin-tails, red ribbon bows, bangs and small gold/yellow bow clip; anatomical right eye winking, visible left iris red/ruby, cheerful open-mouth smile. Keep the pink/white jacket with white sleeves, red trim and gold hardware, white collared shirt with dark/red neck detail, short black/red/pink plaid skirt, white ankle socks and red/pink/white chunky high-top sneakers.

BODY-ONLY: Remove the pink satchel and its detachable strap, plus the white rabbit charm. Preserve garment edges and any observed clothing trim. Use a neutral standing draft, both feet flat, arms slightly apart and empty relaxed hands. Retain the reference wink instead of inventing a new iris color. Rindi V5 may assist draft consistency, but it is not a visually approved turnaround.
```

Tas kanan anatomis; kelinci kiri anatomis. V5 Rindi belum mendapat persetujuan visual; jangan jadikan detail inferensinya otomatis kanonis.

**Prop terpisah:**

- **pink-satchel:** `Rindi's pink/cream satchel, gold hardware, envelope-like flap and visible decorative detail, with ONE strap. Preserve front-visible construction without inventing the hidden strap route. Later attachment: anatomical RIGHT hip.` Detail belum diketahui: Hidden strap route and rear attachment.
- **white-rabbit-charm:** `Rindi's small white rabbit charm with pink ears and red/pink details, matching the rabbit at her anatomical LEFT cuff/forearm. Generate the rabbit alone; do not convert it into Nox's top-hat rabbit.` Detail belum diketahui: Whether charm or independent companion.

### Kairo — top row, third figure from left

```text
TARGET: Kairo, top row column 3. Preserve blue/cyan eyes, cheerful open-mouth smile, short spiky cyan/turquoise hair with substantial tufts, black/brass goggles with glossy blue lenses over the forehead, white hooded jacket with teal/blue panels, dark accents and gold details, white shirt, black shorts, black/gold belt and black fingerless gloves. Keep chunky white/teal trainers, teal laces, gold accents, dark soles and dark socks.

BODY-ONLY: Remove the brown satchel and detachable strap, red teardrop-like dangling charm and blue/gold suitcase. Keep the goggles and garment construction. Adapt the running pose into a neutral standing draft with both feet flat, arms slightly away from body and empty relaxed hands. Do not invent identities for tiny symbols or the charm.
```

Pose berlari pada master belum mendefinisikan satu siklus Walk. Sisi/punggung baru merupakan inferensi.

**Prop terpisah:**

- **brown-satchel:** `Kairo's brown travel satchel and single strap, with source-visible gold hardware and front shape. Later attachment: anatomical RIGHT hip.` Detail belum diketahui: Hidden strap continuation.
- **red-dangling-charm:** `The small red teardrop-like charm visible at the left side of Kairo's jacket. Match only its observed shape and attachment; do not redesign it as a weapon, gem mechanism or creature.` Detail belum diketahui: Tiny details not resolved by source.
- **blue-gold-suitcase:** `The blue/gold rolling suitcase partially visible behind Kairo's legs. Match visible panels and trim; use conservative plain continuation for hidden faces. No Alexia star may be copied onto it unless visible in the reference.` Detail belum diketahui: Hidden panels and hand attachment.

### Luna — top row, fourth figure from left

```text
TARGET: Luna, top row column 4. Preserve purple eyes and small warm smile, long flowing lavender/purple hair with bangs and wavy layers, oversized dark-purple witch hat with tilted wide brim, gold band/stars and large white/gold star ornament with pink center. Keep the dark-purple cape with source-visible gold trim/star motifs, white blouse with gold details, short purple skirt with pale scalloped edge, opaque dark tights and black ankle boots with gold laces/trim.

BODY-ONLY: Remove the entire celestial staff and detached floating/dangling star props; keep fixed visible hat and costume ornamentation. Empty the hands, standing neutral with feet flat and arms slightly apart while preserving cape/hair volume. Do not invent a rear cape star pattern, new hat underside markings or extra ornaments.
```

Staff terpisah; celah cincin harus tetap terbaca. Pola punggung cape dan bagian bawah topi belum diketahui.

**Prop terpisah:**

- **celestial-staff:** `Luna's complete gold celestial/armillary staff: dark grip, blue orb enclosed by source-matched gold rings, lower ring assembly and gold crescent with star details. Preserve the visible hierarchy and gaps between rings; no hand, torso or cape attached. Later held in anatomical LEFT hand.` Detail belum diketahui: Hidden ring geometry and mechanisms.
- **detachable-star-ornament:** `ONE detachable star ornament visibly associated with Luna's cape. Match a selected specific visible ornament from the source; do not synthesize a new set or duplicate fixed costume prints.` Detail belum diketahui: Hidden attachment.

### Nox — top row, fifth figure from left

```text
TARGET: Nox, top row column 5. Preserve the visible purple eye, other eye winking and mischievous open smile; short tousled dark-purple hair, tall black top hat with red band/bow and gold trim. Keep the black long tailcoat with gold piping, source-visible red/pink lining and star/diamond decorations, red waistcoat, white shirt/red tie, dark trousers, black fingerless gloves and black/brown boots with gold laces.

BODY-ONLY: Remove the rabbit, all floating cards and disconnected floating charms. Retain fixed coat motifs. Use a neutral standing draft with empty hands and arms slightly apart; keep the reference wink. Do not invent a rear coat emblem or add cards into the cloth texture.
```

Satu kartu/ornamen per generasi agar tidak menjadi satu mesh gabungan. Trik kartu belum menjadi koreografi Skill yang disetujui.

**Prop terpisah:**

- **top-hat-rabbit:** `Nox's white rabbit with pink ears, small black top hat/red band and red bow. Preserve this rabbit's identity; it is different from Rindi's cuff charm. Later presented by Nox's anatomical LEFT hand.` Detail belum diketahui: Independent companion behavior and hidden surfaces.
- **playing-card:** `ONE selected playing card clearly visible around Nox, white with its source-visible red suit motif. Match that card's actual shown face without inventing a full deck, suit count or printed writing.` Detail belum diketahui: Back design and total card count.
- **detachable-coat-charm:** `ONE specific dangling star/diamond-like ornament visible on Nox's coat tails. Preserve its observed color and shape, isolated from fabric; no new symbol design.` Detail belum diketahui: Rear attachment.

### Atlas — bottom row, first figure from left

```text
TARGET: Atlas, bottom row column 1. Preserve the broad toothy grin and closed smiling eyes. His iris color is UNKNOWN: do not open the eyes or choose a color in this reference draft. Keep tousled brown hair with thick curled/spiked locks, orange explorer/cargo outfit, dark garment harness straps, metallic buckles, patches, dark belt and source-visible cloth pockets. Keep black gloves and heavy brown boots with gold/amber laces and dark soles.

BODY-ONLY: Remove the backpack, bedroll, parcel, map/document, detachable field pouches and suitcase. Preserve the main clothing harness and belt. Adapt the thumbs-up pose to a neutral standing draft, both feet flat and empty relaxed hands slightly away from torso. Reconstruct only simple cloth where removed gear occluded it; no invented backpack straps or rear prints.
```

Warna mata Atlas belum dapat ditentukan dari master. Backpack, mat, parcel, map dan koper dibuat per aset.

**Prop terpisah:**

- **olive-backpack:** `Atlas's large olive/green explorer backpack, matching visible front/side panels, straps and hardware. Generate the pack alone, without bedroll, parcel, body or suitcase; keep existing pack attachment points.` Detail belum diketahui: Full rear silhouette/harness connections.
- **green-bedroll:** `Atlas's green rolled sleeping mat, its visible concentric roll and source-matched retaining straps; generate it alone.` Detail belum diketahui: Unseen strap continuation.
- **tan-parcel:** `The tan parcel visibly strapped above/behind Atlas's shoulder. Preserve visible shape and small existing markings as indistinct source detail; no new readable labels or brands.` Detail belum diketahui: Hidden parcel faces.
- **map-document:** `Atlas's rolled/folded map-like document, as held in anatomical RIGHT hand in the source. Preserve visible paper curl and linework; no newly readable words or invented map content.` Detail belum diketahui: Actual map content.
- **field-pouch:** `ONE specific brown field pouch visible at Atlas's waist, including its source-matched flap and buckle. Use one pouch per call, without body or harness mesh.` Detail belum diketahui: Rear attachments.
- **navy-gold-suitcase:** `Atlas's navy/gold rolling suitcase visible behind his anatomical left side. Match its own visible trim and shape; do not borrow Alexia's large front star if absent.` Detail belum diketahui: Hidden rear/side panels.

### Zeno — bottom row, second figure from left

```text
TARGET: Zeno, bottom row column 2. Preserve blue eyes and small closed smile, short messy light-teal hair with large curved tufts, black/brass goggles with reflective blue lenses. Keep taupe/brown open adventurer coat, cream shirt and trousers, mustard-yellow scarf with source-visible trailing ends, garment harness/belts and gold hardware, black gloves and brown high boots with straps/buckles.

BODY-ONLY: Remove detachable pouches, small tool-like attachments and the obscured suitcase. Keep the goggles and yellow scarf as worn costume. Adapt the hand-to-goggles pose to a neutral standing draft with empty hands and arms slightly apart. Do not assign invented tool identities, add mechanical gadgets or invent rear scarf decoration.
```

Nama Zeno pada posisi ini mengikuti urutan roster; master tidak berlabel. Alat kecil dan bagian belakang scarf belum terdefinisi.

**Prop terpisah:**

- **field-pouch-or-attachment:** `ONE selected source-visible brown pouch or small tool-like attachment from Zeno's belt. Reproduce the observed silhouette and gold hardware only; do not decide an unsupported tool type or add a mechanism.` Detail belum diketahui: Identity of tiny attachments.
- **teal-brown-suitcase:** `Zeno's partially obscured teal/brown suitcase behind his legs. Preserve visible color boundaries and hardware; hidden faces use minimal plain continuation without new emblems.` Detail belum diketahui: Full suitcase shape and hidden faces.

### Yuna — bottom row, third figure from left

```text
TARGET: Yuna, bottom row column 3. Preserve amber/brown eyes and cheerful open-mouth smile, coral/orange wavy bob with curled face-framing locks and turquoise beret with small lime paint-like mark. Keep white long-sleeve shirt, turquoise painter overalls/dungarees, source-visible pink/yellow/green paint splashes, brown/gold belt and clothing shoulder/hip straps, and brown/gold ankle boots.

BODY-ONLY: Remove painter palette, paintbrush and side satchel including its detachable bag strap, while preserving the overalls' own shoulder straps. Use neutral standing draft with empty relaxed hands and arms slightly apart. Match visible paint spots instead of randomizing them; do not invent rear paint artwork, new pocket construction or brush marks.
```

Strap tas boleh dihapus dari body; strap overall harus tetap ada. Sisi/punggung dan pola cat yang tersembunyi tetap inferensi.

**Prop terpisah:**

- **painter-palette:** `Yuna's pale painter palette with source-visible multicolor paint blobs and thumb hole, normally in anatomical RIGHT hand. Preserve each clearly visible paint color and relative placement; generate it alone.` Detail belum diketahui: Exact rear and occluded paint placement.
- **rainbow-brush:** `Yuna's turquoise-handled paintbrush, gold ferrule and source-visible rainbow-colored brush tip, normally in anatomical LEFT hand. Preserve shape and colors, without hand or palette.` Detail belum diketahui: Unseen bristle volume.
- **brown-satchel:** `Yuna's brown/gold side satchel with source-visible flap/hardware and single strap. Later attachment: anatomical LEFT hip. Keep its own design.` Detail belum diketahui: Rear flap and strap route.

### Mochi — bottom row, fourth figure from left

```text
TARGET: Mochi, bottom row column 4. A non-human orange-and-cream chibi kitten, upright/bipedal as seen in the source. Preserve large amber/brown eyes, pink nose, happy open mouth/tongue, whiskers, orange ears/crown, cream muzzle/belly/paws, pink paw pads/toes and orange-and-cream curled tail. Keep dark-navy cap with gold trim and blue/gold badge.

BODY-ONLY: Remove the brown crossbody bag, its detachable strap and small turquoise vial/charm. The tail and ears are BODY anatomy: keep them attached coherently, not detachable props. Use a calm upright kitten draft with both hind paws supported and front paws slightly away from belly. Do not add human fingers, human boots, clothing, new back fur patches or a new tail shape.
```

Mochi memerlukan rig kitten; anatomi manusia tidak sesuai. Paw, telinga dan tail harus diuji dari sudut bawah dan animasi.

**Prop terpisah:**

- **kitten-travel-bag:** `Mochi's brown crossbody travel bag with source-visible strap, gold buckle/hardware and visible pocket structure. Later attachment: anatomical LEFT hip. Isolate bag without kitten fur or paws.` Detail belum diketahui: Rear/strap route.
- **turquoise-vial-charm:** `The small turquoise vial/charm attached to Mochi's bag, with source-visible gold/brown attachment detail. Match only what is visible; no invented potion label or mechanism.` Detail belum diketahui: Tiny cap/attachment details.

### Pip — bottom row, fifth figure from left

```text
TARGET: Pip, bottom row column 5. The MAIN tall wheeled robot suitcase is the character. Preserve rounded rectangular hard-shell volume, turquoise/light-blue/white/gold panels, gold corner armor and seams, black inset front screen with emissive cyan oval eyes and curved cyan smile, source-visible star stickers/patches and central gold badge with blue globe/compass-like emblem. Keep its own retractable black twin-rail handle/top grip, visible side handles and dark swivel caster wheel assemblies.

BODY-ONLY means MAIN CASE ONLY: Remove the smaller suitcase companion entirely. Keep Pip's own wheels and handle as its anatomy. Use the same upright travel configuration in every view; no humanoid neutral pose. Do not add arms/legs or repeat the front face screen on the back. Do not assert a hidden caster count or invent rear mechanisms; use minimal continuation for the unseen case.
```

Pip adalah koper robot volumetrik; layar wajah tidak boleh menjadi pengganti seluruh bentuk 3D. Pisahkan companion dan gunakan rig mekanis untuk roda/handle.

**Prop terpisah:**

- **small-suitcase-companion:** `Pip's SMALL matching suitcase companion, its own rounded blue/white/gold shell, front black screen with cyan smile/eyes, individual pull handle, visible stickers and dark wheels. Generate the small companion alone without the main Pip case. Preserve relative design, but full size relationship must be checked separately. No human limbs.` Detail belum diketahui: Hidden rear, wheel count, companion behavior.

## Prompt master prop

Pilih tepat satu deskripsi aset di atas. Jangan membuat satu collage berisi banyak prop.

```text
Use the attached canonical reference for Crazy Rich: World Tour. Generate ONE isolated detachable asset specified below, without the character, hands or any other asset. Match its visible silhouette, proportions, color boundaries, construction, hardware and ornaments exactly. Use a square canvas, fixed scale and soft diffuse light, with one flat uniform light-gray background. No floor, plinth, contact shadow, border, panel grid, label, watermark or added decoration. Do not fuse unrelated parts together. Preserve designed connections within this asset, while showing distinguishable materials and components. Hidden surfaces may use only the simplest continuation of observed shapes/colors, with no invented rear emblems or mechanisms; they remain proposed inference. This is a raster prop reference, not a GLB.

ASSET: [PASTE ONE ASSET DESCRIPTION]

PROP VIEW: [FRONT / BACK / LEFT SIDE / RIGHT SIDE], orthographic, entire asset visible, same scale.
```

Back/left/right prop yang tidak terlihat pada sumber mengikuti batas inferensi yang sama. Koper Alexia berwarna navy dengan satu bintang emas pada muka depan saja; penempatan setelah assembly pada kiri anatomisnya.

## Koreksi satu masalah tanpa drift

Lampirkan referensi kanonis dan hasil edit yang ingin diperbaiki. Sebut satu cacat konkret beserta lokasinya.

```text
Use image 1 as the canonical character reference and image 2 as the exact edit target. Correct ONLY this documented discrepancy: [DESCRIBE ONE PRECISE DEFECT AND LOCATION]. Preserve every other feature, silhouette, face/expression, eye color, hair strand mass, headphone/hat shape, garment trim, body proportions, pose, scale, background and lighting. Do not mirror the character, add decoration, repaint the whole outfit or alter other views. If removing a prop remnant, remove its entire connected handle/wheels/shadow and fill only the exposed area with the smallest source-consistent cloth continuation. Output the corrected individual view without labels. Any newly revealed hidden surface remains unverified inference.
```

Khusus pembersihan body Alexia:

```text
Use the attached Alexia V2 as the identity authority and the supplied body-only view as the edit target. Remove ONLY any remaining suitcase, its handle, its wheels, its gold star emblem/remnants, floor/pedestal or shadow remnants. Preserve all fixed jacket and sleeve star patches. Keep BLUE eyes, the exact face, silver-lavender layered hair and tied hair mass, black/white/gold headphones, jacket trim, white shirt, dark shorts, belt, fingerless gloves and chunky sneakers unchanged. Fill the minimal occluded cloth area conservatively; do not change hair or costume design. Do not move or reshape the character. Output one clean individual view, same scale/angle/lighting, uniform flat background, no labels. The suitcase will be modeled separately and later attached on anatomical LEFT.
```

## Setelah raster konsisten

Rekonstruksi mesh volumetrik body dan prop secara terpisah, lalu render **mesh nyata** dari front, tiga-perempat, kiri, kanan, back, atas dan bawah. Tolak fusion koper/floor, spikes, hair fragments berlebihan dan celah artikulasi buruk sebelum texturing. Periksa material, UV dan rig/deformasi; gunakan rig kitten untuk Mochi dan rig mekanis roda/handle untuk Pip.

Bukti akhir: turntable 360°, screenshot papan game dan rekaman animasi mesh **Idle, Walk, Jump, Skill, Win, Lose**. Koreografi Skill per karakter belum didokumentasikan sebagai desain final. Simpan SHA-256 GLB yang direview dan gunakan file yang sama pada papan serta selector. Viewer inspeksi sendiri belum membuktikan integrasi game. Model procedural/sculpt lama yang ditolak tidak dipakai sebagai referensi final.


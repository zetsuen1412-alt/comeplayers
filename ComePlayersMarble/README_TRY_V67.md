# ComePlayers Marble V67 — World Diorama

## Quick play from the verified web build

The playable Web Desktop build is already available at `build/web-desktop-v67`.

1. Open PowerShell in `C:\ComePlayersMarble`.
2. Run `node tools\serve-v67.cjs`.
3. Open `http://127.0.0.1:7456/` in a browser.
4. Choose **Quick Match**.
5. In the waiting room, press **Ready & Start**.
6. Press **Roll Dice**, move around the 3D board, and buy or upgrade cities.

Keep the PowerShell window open while playing. Press `Ctrl+C` there to stop the local preview server.

## Rebuild with Cocos Creator 3.8.8

Run:

```powershell
node tools\run-cocos-build-v67.cjs
```

The helper launches the installed Cocos Creator 3.8.8 command-line builder, answers its local Dashboard identity request with an empty offline profile, and treats Creator's success code `36` correctly. It does not sign in, modify an account, or send project data. The output is written to `build/web-desktop-v67`.

You can also open the project normally in Cocos Creator 3.8.8, open `assets/scenes/Match.scene`, and use Preview or Build → Web Desktop.

## V67 visual checklist

- Original generated world-diorama lobby artwork with a procedural fallback and readability overlay.
- Short board entrance presentation.
- Glossy, metallic, matte, and emissive material profiles.
- Animated center globe, crown, and orbiting lights.
- Distinct START, Island, World Travel, and Bonus corner landmarks.
- Recognizable Fortune, Game Center, Olympic, Tax, and Tourist props.
- Property upgrades with lit windows, roofs, and an animated landmark beacon.
- Detailed player pieces with legs, shoes, arms, visor, and travel pack.
- PBR dice with gold corner accents and a full roll animation.
- Directional shadow maps at 2048 resolution with two CSM levels.

## Verified gameplay route

The final web build was tested through lobby → Quick Match → Ready & Start → 3D board → dice roll → animated player movement → property purchase → bot turn. The final run rolled `4 + 5 = 9`, offered Solara for CP 120,000, reduced the player balance to CP 1,880,000 after purchase, and continued to Bot Nova's turn with no browser console errors or warnings.

The local route does not require Supabase credentials. Online rooms, authoritative matches, ranked queues, and cups still require the migrations and project configuration described in the V57–V66 documentation.

For online features, load the official Supabase browser SDK before entering an online room. V67 accepts it through either `globalThis.supabase` or `globalThis.COMEPLAYERS_SUPABASE_SDK`. This keeps the large SDK out of Cocos scene registration and avoids the mixed ESM/CommonJS startup failure in Creator 3.8.8.

## Reference and distribution policy

The material under `references/` and `C:\Netmarble\NetmarbleModuMarble.zip` is design-study input only. V67 uses an original board layout, names, procedural geometry, and generated key art. Do not include the `references/` directory or the Netmarble archive in a public release.

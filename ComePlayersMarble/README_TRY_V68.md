# ComePlayers Marble V68

## Open the project
1. Install Cocos Creator 3.8.8.
2. Open this folder from Cocos Dashboard.
3. Wait for Cocos to regenerate `library` and `temp` when they are absent.
4. Open `assets/scenes/Match.scene` and press Play.

## Verify the source
```bash
npm run verify
```

## Build Web Desktop on Windows
```powershell
npm run build:web
```

When Cocos Creator is installed elsewhere:
```powershell
$env:COCOS_CREATOR_PATH="D:\Cocos\Creator\3.8.8\CocosCreator.exe"
npm run build:web
```

Production-style build:
```powershell
$env:COMEPLAYERS_BUILD_DEBUG="false"
npm run build:web
```

## Preview the generated build
```bash
npm run preview
```
Then open `http://127.0.0.1:7456/`.

Custom preview port:
```powershell
$env:COMEPLAYERS_PREVIEW_PORT="8080"
npm run preview
```

## Clean project ZIP
The release ZIP intentionally excludes generated folders such as `library`, `temp`, `node_modules`, and old build output. Cocos Creator regenerates required caches automatically.

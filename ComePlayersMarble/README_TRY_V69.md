# ComePlayers Marble V69

## Main update
V69 expands the persistent Career system with eleven missions, a Career Mastery score, completed mission tracking, and lifetime gameplay statistics. Existing V68 career data is retained and automatically contributes to the new missions.

## Open the project
1. Install Cocos Creator 3.8.8.
2. Open this folder from Cocos Dashboard.
3. Wait for Cocos to regenerate `library` and `temp`.
4. Open `assets/scenes/Match.scene` and press Play.

## Verify the clean source
```bash
npm run verify
```

## Build Web Desktop on Windows
```powershell
npm run build:web
```

Custom Cocos Creator installation:
```powershell
$env:COCOS_CREATOR_PATH="D:\Cocos\Creator\3.8.8\CocosCreator.exe"
npm run build:web
```

## Preview generated build
```bash
npm run preview
```
Open `http://127.0.0.1:7456/`.

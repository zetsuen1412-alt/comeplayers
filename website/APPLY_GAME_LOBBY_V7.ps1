$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not (Test-Path (Join-Path $root "package.json"))) {
  Write-Host "ERROR: Ekstrak ZIP ini langsung ke folder website yang berisi package.json." -ForegroundColor Red
  exit 1
}
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = Join-Path $root "backup-game-lobby-v7-$stamp"
New-Item -ItemType Directory -Force -Path $backup | Out-Null
if (Test-Path (Join-Path $root "app\HomeClient.tsx")) { Copy-Item (Join-Path $root "app\HomeClient.tsx") $backup -Force }
if (Test-Path (Join-Path $root "app\gameLobby.module.css")) { Copy-Item (Join-Path $root "app\gameLobby.module.css") $backup -Force }
if (Test-Path (Join-Path $root ".next")) { Remove-Item (Join-Path $root ".next") -Recurse -Force }
Write-Host "GAME LOBBY V7 berhasil dipasang." -ForegroundColor Green
Write-Host "Jalankan: npm run dev" -ForegroundColor Yellow

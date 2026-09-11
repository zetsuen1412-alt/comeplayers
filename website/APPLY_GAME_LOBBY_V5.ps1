$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$payload = Join-Path $root "_alexia_patch_v5"

if (-not (Test-Path (Join-Path $root "package.json"))) {
  Write-Host "ERROR: Ekstrak ZIP langsung ke folder website yang memiliki package.json." -ForegroundColor Red
  Write-Host "Folder saat ini: $root" -ForegroundColor Yellow
  exit 1
}

$required = @(
  "app\page.tsx",
  "app\layout.tsx",
  "app\GameLobbyV5.tsx",
  "app\GameLobbyCanvas.tsx",
  "app\game-lobby-v5.types.ts",
  "app\game-lobby-v5.module.css",
  "app\components\ConditionalChrome.tsx",
  "app\marketplace\page.tsx",
  "public\game-lobby-v5\idle.webp",
  "public\game-lobby-v5\chat.webp",
  "public\game-lobby-v5\marketplace.webp"
)

foreach ($relative in $required) {
  $source = Join-Path $payload $relative
  if (-not (Test-Path $source)) {
    Write-Host "ERROR: File payload tidak ditemukan: $relative" -ForegroundColor Red
    exit 1
  }
}

$package = Get-Content (Join-Path $root "package.json") -Raw | ConvertFrom-Json
$hasPixi = $false
if ($package.dependencies) {
  $hasPixi = $package.dependencies.PSObject.Properties.Name -contains "pixi.js"
}

if (-not $hasPixi) {
  Write-Host "Memasang PixiJS 8.14.3..." -ForegroundColor Cyan
  Push-Location $root
  try {
    & npm install pixi.js@8.14.3 --save-exact
    if ($LASTEXITCODE -ne 0) {
      throw "npm install pixi.js gagal dengan exit code $LASTEXITCODE"
    }
  }
  finally {
    Pop-Location
  }
}
else {
  Write-Host "PixiJS sudah tersedia. Instalasi dependency dilewati." -ForegroundColor DarkGray
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = Join-Path $root "backup-game-lobby-v5-$stamp"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

$filesToBackup = @(
  "app\page.tsx",
  "app\layout.tsx",
  "app\GameLobbyV5.tsx",
  "app\GameLobbyCanvas.tsx",
  "app\game-lobby-v5.types.ts",
  "app\game-lobby-v5.module.css",
  "app\components\ConditionalChrome.tsx",
  "app\marketplace\page.tsx"
)

foreach ($relative in $filesToBackup) {
  $current = Join-Path $root $relative
  if (Test-Path $current) {
    $target = Join-Path $backupDir $relative
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
    Copy-Item $current $target -Force
  }
}

foreach ($relative in $required) {
  $source = Join-Path $payload $relative
  $target = Join-Path $root $relative
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
  Copy-Item $source $target -Force
  Write-Host "REPLACED: $relative" -ForegroundColor Green
}

$marker = Join-Path $root "GAME_LOBBY_V5_INSTALLED.txt"
@"
ComePlayers Game Lobby V5 installed: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
Renderer: PixiJS 8.14.3
Homepage: app\page.tsx
Canvas: app\GameLobbyCanvas.tsx
UI: app\GameLobbyV5.tsx
"@ | Set-Content -Path $marker -Encoding UTF8

$nextDir = Join-Path $root ".next"
if (Test-Path $nextDir) {
  Remove-Item $nextDir -Recurse -Force
  Write-Host "Cache .next dihapus." -ForegroundColor Green
}

Write-Host ""
Write-Host "COMEPLAYERS GAME LOBBY V5 BERHASIL DIPASANG." -ForegroundColor Cyan
Write-Host "Backup dibuat di: $backupDir" -ForegroundColor DarkGray
Write-Host "Jalankan: npm run dev" -ForegroundColor Yellow
Write-Host "Buka: http://localhost:3000 lalu tekan Ctrl+F5" -ForegroundColor Yellow
Write-Host "Cari badge GAME LOBBY V5 - PIXIJS di kanan bawah." -ForegroundColor Yellow

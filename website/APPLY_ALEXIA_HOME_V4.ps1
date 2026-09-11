$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$payload = Join-Path $root "_alexia_patch_v4"

if (-not (Test-Path (Join-Path $root "package.json"))) {
  Write-Host "ERROR: Ekstrak ZIP ini langsung ke folder website yang memiliki package.json." -ForegroundColor Red
  Write-Host "Folder saat ini: $root" -ForegroundColor Yellow
  exit 1
}

$required = @(
  "app\page.tsx",
  "app\AlexiaHomeV4.tsx",
  "app\alexia-home-v4.module.css",
  "public\alexia-v4\idle.webp",
  "public\alexia-v4\chat-hover.webp",
  "public\alexia-v4\marketplace-hover.webp"
)

foreach ($relative in $required) {
  $source = Join-Path $payload $relative
  if (-not (Test-Path $source)) {
    Write-Host "ERROR: File payload tidak ditemukan: $relative" -ForegroundColor Red
    exit 1
  }
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = Join-Path $root "backup-alexia-home-v4-$stamp"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

$filesToBackup = @(
  "app\page.tsx",
  "app\AlexiaHomeV4.tsx",
  "app\alexia-home-v4.module.css"
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

$marker = Join-Path $root "ALEXIA_HOME_V4_INSTALLED.txt"
@"
Alexia Home V4 installed: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
Homepage file: app\page.tsx
Component: app\AlexiaHomeV4.tsx
Animation: requestAnimationFrame spring + smooth crossfade + breathing + hair sway
"@ | Set-Content -Path $marker -Encoding UTF8

$nextDir = Join-Path $root ".next"
if (Test-Path $nextDir) {
  Remove-Item $nextDir -Recurse -Force
  Write-Host "Cache .next dihapus." -ForegroundColor Green
}

Write-Host ""
Write-Host "ALEXIA HOME V4 SMOOTH BERHASIL DIPASANG." -ForegroundColor Cyan
Write-Host "Backup dibuat di: $backupDir" -ForegroundColor DarkGray
Write-Host "Jalankan: npm run dev" -ForegroundColor Yellow
Write-Host "Buka: http://localhost:3000 lalu tekan Ctrl+F5" -ForegroundColor Yellow
Write-Host "Cari badge ALEXIA HOME V4 - SMOOTH di kanan bawah." -ForegroundColor Yellow

$ErrorActionPreference = "Stop"

$ProjectRoot = (Get-Location).Path
$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$PayloadRoot = Join-Path $ScriptRoot "_replace"

if (-not (Test-Path (Join-Path $ProjectRoot "package.json"))) {
  Write-Host "ERROR: Jalankan installer dari folder website yang berisi package.json." -ForegroundColor Red
  Write-Host "Contoh: C:\Comeplayers-new\website" -ForegroundColor Yellow
  exit 1
}

if (-not (Test-Path $PayloadRoot)) {
  Write-Host "ERROR: Folder _replace tidak ditemukan. Extract seluruh isi ZIP terlebih dahulu." -ForegroundColor Red
  exit 1
}

$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$BackupRoot = Join-Path $ProjectRoot "_alexia_home_backup_v9_$Timestamp"
New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null

$FilesToBackup = @(
  "app\page.tsx",
  "app\HomeClient.tsx",
  "app\HomeClient.module.css"
)

foreach ($RelativePath in $FilesToBackup) {
  $Source = Join-Path $ProjectRoot $RelativePath
  if (Test-Path $Source) {
    $BackupFile = Join-Path $BackupRoot $RelativePath
    $BackupFolder = Split-Path -Parent $BackupFile
    New-Item -ItemType Directory -Force -Path $BackupFolder | Out-Null
    Copy-Item $Source $BackupFile -Force
  }
}

Copy-Item (Join-Path $PayloadRoot "app\page.tsx") (Join-Path $ProjectRoot "app\page.tsx") -Force
Copy-Item (Join-Path $PayloadRoot "app\HomeClient.tsx") (Join-Path $ProjectRoot "app\HomeClient.tsx") -Force
Copy-Item (Join-Path $PayloadRoot "app\HomeClient.module.css") (Join-Path $ProjectRoot "app\HomeClient.module.css") -Force

$AssetTarget = Join-Path $ProjectRoot "public\alexia-game-v9"
New-Item -ItemType Directory -Force -Path $AssetTarget | Out-Null
Copy-Item (Join-Path $PayloadRoot "public\alexia-game-v9\*") $AssetTarget -Force

$NextCache = Join-Path $ProjectRoot ".next"
if (Test-Path $NextCache) {
  Remove-Item $NextCache -Recurse -Force
}

$Marker = @"
ComePlayers Alexia Option A V9
Installed: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
Backup: $BackupRoot
Marketplace route was not modified.
"@
Set-Content -Path (Join-Path $ProjectRoot "ALEXIA_OPTION_A_V9_INSTALLED.txt") -Value $Marker -Encoding UTF8

Write-Host "" 
Write-Host "ALEXIA OPTION A V9 BERHASIL DIPASANG." -ForegroundColor Green
Write-Host "Backup homepage lama: $BackupRoot" -ForegroundColor Cyan
Write-Host "Marketplace tidak diubah." -ForegroundColor Cyan
Write-Host "Jalankan: npm run dev" -ForegroundColor Yellow
Write-Host "Lalu buka: http://localhost:3000 dan tekan Ctrl+F5" -ForegroundColor Yellow

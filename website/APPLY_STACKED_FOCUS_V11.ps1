$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Backup = Join-Path $Root ("_backup_stacked_focus_v11_" + (Get-Date -Format "yyyyMMdd_HHmmss"))

if (-not (Test-Path (Join-Path $Root "package.json"))) {
  Write-Host "ERROR: Jalankan patch ini dari folder website yang memiliki package.json." -ForegroundColor Red
  exit 1
}

New-Item -ItemType Directory -Force -Path $Backup | Out-Null

$Targets = @(
  "app\page.tsx",
  "app\HomeClient.tsx",
  "app\home.module.css"
)

foreach ($Target in $Targets) {
  $Existing = Join-Path $Root $Target
  if (Test-Path $Existing) {
    $BackupPath = Join-Path $Backup $Target
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $BackupPath) | Out-Null
    Copy-Item $Existing $BackupPath -Force
  }
}

if (Test-Path (Join-Path $Root ".next")) {
  Remove-Item (Join-Path $Root ".next") -Recurse -Force
}

Write-Host "STACKED FOCUS V11 siap digunakan." -ForegroundColor Green
Write-Host "Backup file lama: $Backup" -ForegroundColor DarkGray
Write-Host "Jalankan: npm run dev" -ForegroundColor Yellow

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = Join-Path $root "_comeplayers_backups\home-v20-$stamp"
New-Item -ItemType Directory -Force -Path $backup | Out-Null

$files = @(
  "app\page.tsx",
  "app\HomeClient.tsx",
  "app\home.module.css"
)

foreach ($file in $files) {
  $source = Join-Path $root $file
  if (Test-Path $source) {
    $destination = Join-Path $backup $file
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null
    Copy-Item $source $destination -Force
  }
}

$next = Join-Path $root ".next"
if (Test-Path $next) {
  Remove-Item $next -Recurse -Force
}

Write-Host "" 
Write-Host "COMEPLAYERS CINEMATIC LIVING ALEXIA V20 BERHASIL DIPASANG." -ForegroundColor Green
Write-Host "Video: 960x540, 60 FPS, loop 6 detik." -ForegroundColor Cyan
Write-Host "Backup: $backup" -ForegroundColor DarkGray
Write-Host "" 

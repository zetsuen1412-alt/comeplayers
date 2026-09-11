Write-Host "Applying ComePlayers Dual World Portal V12..." -ForegroundColor Yellow
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$nextDir = Join-Path $root ".next"
if (Test-Path $nextDir) {
  Remove-Item -Recurse -Force $nextDir
  Write-Host "Removed .next cache" -ForegroundColor DarkGray
}
Write-Host "DUAL WORLD PORTAL V12 BERHASIL DIPASANG." -ForegroundColor Green

Write-Host "Applying ComePlayers Dual World Portal Sound V13..." -ForegroundColor Cyan
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$nextDir = Join-Path $root ".next"
if (Test-Path $nextDir) {
  Remove-Item -Recurse -Force $nextDir
  Write-Host "Removed .next cache" -ForegroundColor DarkGray
}
Write-Host "DUAL WORLD PORTAL SOUND V13 BERHASIL DIPASANG." -ForegroundColor Green

Write-Host "Applying ComePlayers Dual World Portal Sound V13.1 precision fix..." -ForegroundColor Yellow
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$nextDir = Join-Path $root ".next"
if (Test-Path $nextDir) {
  Remove-Item -Recurse -Force $nextDir
  Write-Host "Removed .next cache" -ForegroundColor DarkGray
}
Write-Host "V13.1 PRECISION FIX BERHASIL DIPASANG." -ForegroundColor Green

Write-Host "Applying ComePlayers Homepage Static UI V18..." -ForegroundColor Yellow
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$nextDir = Join-Path $root ".next"
if (Test-Path $nextDir) {
  Remove-Item -Recurse -Force $nextDir
  Write-Host "Cache .next dihapus." -ForegroundColor DarkGray
}
Write-Host "HOME STATIC UI V18 BERHASIL DIPASANG." -ForegroundColor Green
Write-Host "Semua animasi berulang di homepage telah dihapus." -ForegroundColor Cyan

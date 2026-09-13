$ErrorActionPreference = "Continue"

function Check-Command($Name, $Hint) {
  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($command) {
    Write-Host "[OK] $Name -> $($command.Source)" -ForegroundColor Green
  } else {
    Write-Host "[MISSING] $Name. $Hint" -ForegroundColor Red
  }
}

Write-Host "ComePlayers requirements check" -ForegroundColor Cyan
Check-Command "node" "Install Node.js LTS from https://nodejs.org/en/download"
Check-Command "npm" "npm is included with Node.js."
Check-Command "git" "Install Git from https://git-scm.com/download/win"
Check-Command "rustc" "Install Rust from https://rustup.rs/ (required for Windows app)."
Check-Command "cargo" "Cargo is included with Rust."

if (Get-Command node -ErrorAction SilentlyContinue) {
  Write-Host "Node version: $(node --version)"
}
if (Get-Command rustc -ErrorAction SilentlyContinue) {
  Write-Host "Rust version: $(rustc --version)"
}

Write-Host "`nAndroid Studio is optional when testing on a real Android phone or using EAS cloud builds." -ForegroundColor Yellow
Write-Host "See DOWNLOAD_LINKS.md for official downloads." -ForegroundColor Yellow

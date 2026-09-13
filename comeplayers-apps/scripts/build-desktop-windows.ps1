$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Bundle = Join-Path $Root "apps\desktop\src-tauri\target\release\bundle"

Push-Location $Root
try {
  Write-Host "[ComePlayers] Installing workspace dependencies..." -ForegroundColor Cyan
  npm.cmd install
  if ($LASTEXITCODE -ne 0) {
    throw "Workspace dependency installation failed."
  }

  Write-Host "[ComePlayers] Type-checking all app packages..." -ForegroundColor Cyan
  npm.cmd run typecheck
  if ($LASTEXITCODE -ne 0) {
    throw "Workspace type-check failed."
  }

  Write-Host "[ComePlayers] Building Windows desktop installers..." -ForegroundColor Yellow
  npm.cmd run desktop:build
  if ($LASTEXITCODE -ne 0) {
    throw "Windows desktop build failed."
  }
}
finally {
  Pop-Location
}

Write-Host "Desktop installer output: $Bundle" -ForegroundColor Green

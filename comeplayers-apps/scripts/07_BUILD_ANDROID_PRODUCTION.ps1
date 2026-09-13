$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Mobile = Join-Path $Root "apps\mobile"

& "$PSScriptRoot\clean-mobile-generated-native.ps1"

Push-Location $Mobile
try {
  Write-Host "[ComePlayers] Checking Android app types..." -ForegroundColor Cyan
  npm.cmd run typecheck
  if ($LASTEXITCODE -ne 0) {
    throw "Android type-check failed."
  }

  Write-Host "[ComePlayers] Checking Expo account..." -ForegroundColor Cyan
  npx.cmd eas-cli@latest whoami
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Login to the Expo account that owns ComePlayers." -ForegroundColor Yellow
    npx.cmd eas-cli@latest login
    if ($LASTEXITCODE -ne 0) {
      throw "Expo login failed."
    }
  }

  Write-Host "[ComePlayers] Starting signed Google Play AAB build..." -ForegroundColor Yellow
  npx.cmd eas-cli@latest build --platform android --profile production
  if ($LASTEXITCODE -ne 0) {
    throw "Android production AAB build failed."
  }
}
finally {
  Pop-Location
}

Write-Host "AAB production build finished. Use npm run android:submit after internal verification." -ForegroundColor Green

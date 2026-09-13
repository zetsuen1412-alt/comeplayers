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

  Write-Host "[ComePlayers] Starting signed preview APK build in EAS..." -ForegroundColor Yellow
  npx.cmd eas-cli@latest build --platform android --profile preview
  if ($LASTEXITCODE -ne 0) {
    throw "Android preview APK build failed."
  }
}
finally {
  Pop-Location
}

Write-Host "APK preview build finished. Download it from the EAS build link above." -ForegroundColor Green

param(
  [ValidateSet("preview", "production")]
  [string]$Profile = "production"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Mobile = Join-Path $Root "apps\mobile"

& "$PSScriptRoot\clean-mobile-generated-native.ps1"

Push-Location $Mobile
try {
  Write-Host "[ComePlayers] Checking iOS application types..." -ForegroundColor Cyan
  npm.cmd run typecheck
  if ($LASTEXITCODE -ne 0) {
    throw "iOS type-check failed."
  }

  Write-Host "[ComePlayers] Checking Expo account..." -ForegroundColor Cyan
  npx.cmd eas-cli@latest whoami
  if ($LASTEXITCODE -ne 0) {
    throw "Expo login is required. Run npx eas-cli@latest login."
  }

  Write-Host "[ComePlayers] Starting EAS iOS $Profile build..." -ForegroundColor Yellow
  npx.cmd eas-cli@latest build --platform ios --profile $Profile
  if ($LASTEXITCODE -ne 0) {
    throw "iOS $Profile build failed."
  }
}
finally {
  Pop-Location
}

Write-Host "iOS $Profile build finished in EAS." -ForegroundColor Green

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

if (-not (Test-Path "apps/mobile/.env")) {
  throw "apps/mobile/.env is missing. Run scripts/02_SETUP_PROJECT.ps1 first."
}

npm run start --workspace @comeplayers/mobile

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

if (-not (Test-Path "apps/desktop/.env")) {
  throw "apps/desktop/.env is missing. Run scripts/02_SETUP_PROJECT.ps1 first."
}

npm run tauri:dev --workspace @comeplayers/desktop

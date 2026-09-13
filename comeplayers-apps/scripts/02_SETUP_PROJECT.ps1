$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

if (-not (Test-Path "apps/desktop/.env")) {
  Copy-Item "apps/desktop/.env.example" "apps/desktop/.env"
  Write-Host "Created apps/desktop/.env" -ForegroundColor Yellow
}
if (-not (Test-Path "apps/mobile/.env")) {
  Copy-Item "apps/mobile/.env.example" "apps/mobile/.env"
  Write-Host "Created apps/mobile/.env" -ForegroundColor Yellow
}

Write-Host "Installing workspace dependencies..." -ForegroundColor Cyan
npm install
if ($LASTEXITCODE -ne 0) { throw "npm install failed." }

Write-Host "`nSetup complete." -ForegroundColor Green
Write-Host "Now edit apps/desktop/.env and apps/mobile/.env using ENV_VALUE_MAP.md." -ForegroundColor Yellow

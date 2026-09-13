$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

npm run tauri:build --workspace @comeplayers/desktop
if ($LASTEXITCODE -ne 0) { throw "Windows build failed." }

Write-Host "Installer output:" -ForegroundColor Green
Write-Host "apps/desktop/src-tauri/target/release/bundle/"
